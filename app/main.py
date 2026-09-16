import asyncio
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import openai
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.auth import router as auth_router
from app.api.student import router as student_router, send_due_reminders
from app.auth import get_current_user
from app.config import settings
from app.engines.analytics.tracker import AnalyticsTracker
from app.engines.emotion.detector import EmotionalAnalyzer
from app.engines.memory.hopfield import HopfieldAssociativeMemory
from app.engines.rag.reranker import ContextMerger, Reranker
from app.engines.rag.retriever import RAGRetriever, VectorStore
from app.engines.response.generator import ResponseGenerator
from app.engines.response.validator import ResponseValidator
from app.engines.safety.detector import SafetyDetector
from app.models.mongo import close_mongodb_connection, connect_to_mongodb, conversations, emotional_analytics, messages, student_assessments, student_profiles, student_tasks
from app.services.embedding import get_embedding
from app.utils.helpers import convert_numpy

logger = logging.getLogger(__name__)

emotion_analyzer = EmotionalAnalyzer()
safety_detector = SafetyDetector()
vector_store = VectorStore()
rag_retriever = RAGRetriever(vector_store)
reranker = Reranker()
context_merger = ContextMerger()
response_generator = ResponseGenerator()
response_validator = ResponseValidator()
analytics_tracker = AnalyticsTracker()
hopfield_memory = HopfieldAssociativeMemory(vector_store)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongodb()
    async def reminder_loop():
        while True:
            await send_due_reminders()
            await asyncio.sleep(60)
    reminder_task = asyncio.create_task(reminder_loop())
    logger.info("HOPEMO started")
    try:
        yield
    finally:
        reminder_task.cancel()
        await close_mongodb_connection()


app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION, lifespan=lifespan)

allowed_origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(student_router)


@app.exception_handler(openai.AuthenticationError)
async def openai_authentication_exception_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": "OpenAI authentication failed."})


@app.exception_handler(openai.RateLimitError)
async def openai_rate_limit_exception_handler(request, exc):
    return JSONResponse(status_code=429, content={"detail": "OpenAI rate limit reached. Try again later."})


@app.exception_handler(openai.APIConnectionError)
async def openai_connection_exception_handler(request, exc):
    return JSONResponse(status_code=503, content={"detail": "Could not connect to OpenAI."})


@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    logger.exception("Unhandled application error")
    detail = str(exc) if settings.ENVIRONMENT == "development" else "Internal Server Error"
    return JSONResponse(status_code=500, content={"detail": detail})


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: Optional[str] = None
    student_coach: bool = False


class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    emotion: dict
    safety: dict


def _fallback_response(message: str, name: str) -> str:
    import random
    text = message.lower()
    person = name.split()[0] if name else "there"
    if any(word in text for word in ("sad", "upset", "cry", "lonely", "down")):
        choices = [f"{person}, that sounds painful. You deserve room to feel it without fixing everything at once. What feels heaviest right now?", f"I’m sorry this is sitting so heavily with you, {person}. Did something specific bring this feeling up today?"]
    elif any(word in text for word in ("anxious", "stress", "worried", "panic", "overwhelm")):
        choices = [f"That sounds like a lot of pressure, {person}. What is one thought that keeps returning?", f"Your mind seems to be carrying several things at once, {person}. Which part feels most urgent right now?"]
    else:
        choices = [f"I’m with you, {person}. Say a little more so I can understand the situation better.", f"That sounds important, {person}. What would feel most helpful to explore first?", f"Let’s stay with that for a moment, {person}. What has this been like for you?"]
    return random.choice(choices)

@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    try:
        safety = convert_numpy(await asyncio.wait_for(safety_detector.check(req.message), timeout=1.5))
    except Exception:
        safety = {"safe": True, "risk_level": "low"}

    critical_response = None
    if not safety["safe"] and safety["risk_level"] == "critical":
        # Keep crisis messages in the conversation so the user can see this
        # high-risk moment in that conversation's insight graph.
        critical_response = "I'm concerned about you. Please contact local emergency services or a crisis helpline in your area right now."

    try:
        emotion = convert_numpy(await asyncio.wait_for(emotion_analyzer.analyze(req.message), timeout=2))
    except Exception:
        emotion = {"primary_emotion": "neutral", "intensity": 0.0}
    try:
        query_embedding = await asyncio.wait_for(get_embedding(req.message), timeout=3)
        retrieval = await asyncio.wait_for(rag_retriever.retrieve(req.message, user_id), timeout=3)
        reranked = reranker.rank(req.message, retrieval["memories"] + retrieval["knowledge"])
        context = context_merger.merge(req.message, reranked, retrieval["associative"])
        if req.student_coach:
            profile = await student_profiles.find_one({"user_id": user_id}, {"_id": 0, "course": 1, "semester": 1, "subjects": 1, "study_hours": 1})
            assessment = await student_assessments.find_one({"user_id": user_id}, {"_id": 0, "difficult_topics": 1, "learning_style": 1, "scores": 1})
            from datetime import date
            today_tasks = [task["title"] async for task in student_tasks.find({"user_id": user_id, "date": date.today().isoformat(), "completed": False}, {"title": 1})]
            context += "\n\nStudent Coach context (use only when helpful; keep wellbeing support non-diagnostic): " + json.dumps({"profile": profile, "assessment": assessment, "today_tasks": today_tasks})
        response_text = await asyncio.wait_for(response_generator.generate(req.message, context, emotion, safety), timeout=6)
    except Exception:
        logger.exception("AI response path failed; using fast fallback")
        query_embedding = []
        response_text = _fallback_response(req.message, current_user.get("name", ""))

    if critical_response:
        response_text = critical_response

    try:
        validation = await asyncio.wait_for(response_validator.validate(response_text), timeout=2)
    except Exception:
        validation = {"safe": True}
    if not validation["safe"]:
        response_text = "I want to make sure this conversation stays helpful. Could you tell me a little more about what you need right now?"

    try:
        metadata = {
            "type": "user_message",
            "primary_emotion": emotion.get("primary_emotion", ""),
            "intensity": float(emotion.get("intensity", 0.0)),
            "emotion_json": json.dumps(emotion),
            "text": req.message,
        }
        await hopfield_memory.add_memory(user_id, req.message, query_embedding, metadata)
    except Exception:
        logger.exception("Failed to store vector memory")

    try:
        await analytics_tracker.update(user_id, emotion, safety.get("risk_level", "low"))
    except Exception:
        logger.exception("Failed to update analytics")

    conv_id = req.conversation_id or str(uuid.uuid4())
    if req.conversation_id:
        conversation = await conversations.find_one({"_id": conv_id, "user_id": user_id})
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found.")
    else:
        await conversations.insert_one({"_id": conv_id, "user_id": user_id, "title": req.message.strip()[:60], "started_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)})

    try:
        await messages.insert_many(
            [
                {"conversation_id": conv_id, "role": "user", "content": req.message, "emotion_scores": emotion, "safety_flags": safety, "created_at": datetime.now(timezone.utc)},
                {"conversation_id": conv_id, "role": "assistant", "content": response_text, "created_at": datetime.now(timezone.utc)},
            ]
        )
        await conversations.update_one({"_id": conv_id}, {"$set": {"updated_at": datetime.now(timezone.utc)}})
    except Exception:
        logger.exception("Failed to store chat messages")

    return ChatResponse(response=response_text, conversation_id=conv_id, emotion=emotion, safety=safety)


@app.get("/api/v1/conversations")
async def list_conversations(current_user: dict = Depends(get_current_user)):
    items = []
    async for item in conversations.find({"user_id": current_user["_id"]}, {"_id": 1, "title": 1, "started_at": 1, "updated_at": 1}).sort([("updated_at", -1), ("started_at", -1)]):
        title = item.get("title")
        if not title:
            first_message = await messages.find_one({"conversation_id": item["_id"], "role": "user"}, {"content": 1})
            title = (first_message or {}).get("content", "Untitled conversation").strip()[:60]
            await conversations.update_one({"_id": item["_id"]}, {"$set": {"title": title}})
        items.append({"id": item["_id"], "title": title, "updated_at": item.get("updated_at") or item.get("started_at")})
    return items

@app.get("/api/v1/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    conversation = await conversations.find_one({"_id": conversation_id, "user_id": current_user["_id"]})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    return [
        {"role": message["role"], "content": message["content"], "created_at": message["created_at"]}
        async for message in messages.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1)
    ]


@app.get("/api/v1/conversations/{conversation_id}/insights")
async def get_conversation_insights(conversation_id: str, current_user: dict = Depends(get_current_user)):
    conversation = await conversations.find_one({"_id": conversation_id, "user_id": current_user["_id"]})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    rows = []
    async for item in messages.find({"conversation_id": conversation_id, "role": "user"}, {"_id": 0, "created_at": 1, "emotion_scores": 1, "safety_flags": 1}).sort("created_at", 1):
        emotion = item.get("emotion_scores") or {}
        safety = item.get("safety_flags") or {}
        intensity = max(*(float(emotion.get(key, 0) or 0) for key in ("anxiety", "stress", "sadness", "anger")), float(emotion.get("intensity", 0) or 0))
        rows.append({"time": item.get("created_at"), "intensity": round(intensity, 3), "hope": round(float(emotion.get("hope", 0) or 0), 3), "risk_level": safety.get("risk_level", "low"), "emotion": emotion.get("primary_emotion", "")})
    return rows



@app.delete("/api/v1/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, current_user: dict = Depends(get_current_user)):
    result = await conversations.delete_one({"_id": conversation_id, "user_id": current_user["_id"]})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    await messages.delete_many({"conversation_id": conversation_id})
    return {"deleted": True}

@app.get("/api/v1/emotions/trends")
async def emotion_trends(current_user: dict = Depends(get_current_user)):
    rows = [
        {"date": row["date"], "anxiety": round(float(row.get("avg_anxiety", 0)), 3), "stress": round(float(row.get("avg_stress", 0)), 3), "hope": round(float(row.get("avg_hope", 0)), 3), "dominant_emotion": row.get("dominant_emotion") or "", "risk_level": row.get("risk_level", "low")}
        async for row in emotional_analytics.find({"user_id": current_user["_id"]}, {"_id": 0, "date": 1, "avg_anxiety": 1, "avg_stress": 1, "avg_hope": 1, "dominant_emotion": 1, "risk_level": 1}).sort("date", -1).limit(14)
    ]
    return list(reversed(rows))

@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
