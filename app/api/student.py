"""Student Success APIs. Scores are transparent guidance, never diagnoses or grade guarantees."""
from datetime import date, datetime, timedelta, timezone
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.models.mongo import student_assessments, student_checkins, student_profiles, student_tasks

router = APIRouter(prefix="/api/v1/student", tags=["Student Success"])


class StudentProfileRequest(BaseModel):
    student_name: str = Field(min_length=2, max_length=80)
    age: int = Field(ge=10, le=100)
    institution: str = Field(min_length=2, max_length=160)
    board: str = Field(min_length=2, max_length=100)
    semester: str = Field(min_length=1, max_length=40)
    course: str = Field(min_length=2, max_length=120)
    subjects: list[str] = Field(min_length=1, max_length=20)
    exam_date: date | None = None
    study_hours: float = Field(default=2, ge=0.25, le=16)
    career_goal: str = Field(default="", max_length=240)


class AssessmentRequest(BaseModel):
    completed_topics: int = Field(ge=0, le=100)
    total_topics: int = Field(ge=1, le=100)
    difficult_topics: list[str] = Field(default_factory=list, max_length=30)
    learning_style: Literal["visual", "reading", "practical", "mixed"] = "mixed"
    focus: int = Field(ge=1, le=5)
    motivation: int = Field(ge=1, le=5)
    stress: int = Field(ge=1, le=5)
    sleep: int = Field(ge=1, le=5)
    time_management: int = Field(ge=1, le=5)
    procrastination: int = Field(ge=1, le=5)
    syllabus: str = Field(default="", max_length=100)
    completed_chapters: list[str] = Field(default_factory=list, max_length=100)
    daily_social_hours: float = Field(default=0, ge=0, le=24)
    revision_frequency: int = Field(default=3, ge=1, le=5)
    higher_studies_or_job: Literal["higher_studies", "job", "undecided"] = "undecided"
    interest_areas: list[str] = Field(default_factory=list, max_length=20)
    answers: dict[str, int] = Field(default_factory=dict)


class CheckinRequest(BaseModel):
    mood: Literal["happy", "okay", "stressed", "tired"]
    note: str = Field(default="", max_length=300)


class TaskPatch(BaseModel):
    completed: bool


def _score(value: float) -> int:
    return max(0, min(100, round(value)))


def calculate_scores(item: AssessmentRequest) -> dict:
    progress = item.completed_topics / item.total_topics
    readiness = _score(progress * 55 + item.focus * 6 + item.time_management * 5)
    wellness = _score((item.motivation + item.sleep + (6 - item.stress)) / 15 * 100)
    productivity = _score((item.time_management + (6 - item.procrastination) + item.revision_frequency) / 15 * 100)
    exam_readiness = _score(readiness * .65 + productivity * .2 + wellness * .15)
    return {"academic_readiness": readiness, "focus": _score(item.focus / 5 * 100), "wellness": wellness, "time_management": _score(item.time_management / 5 * 100), "productivity": productivity, "exam_readiness": exam_readiness, "stress_level": "high" if item.stress >= 4 else "medium" if item.stress == 3 else "low"}


async def _profile(user_id: str) -> dict:
    profile = await student_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Create your student profile first.")
    return profile


@router.put("/profile")
async def save_profile(request: StudentProfileRequest, current_user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    # JSON mode converts the browser's exam date into a MongoDB-safe ISO string.
    document = request.model_dump(mode="json")
    document["subjects"] = [subject.strip() for subject in document["subjects"] if subject.strip()]
    await student_profiles.update_one({"user_id": current_user["_id"]}, {"$set": {**document, "user_id": current_user["_id"], "updated_at": now}, "$setOnInsert": {"created_at": now}}, upsert=True)
    return {**document, "configured": True}


@router.post("/assessment")
async def save_assessment(request: AssessmentRequest, current_user: dict = Depends(get_current_user)):
    await _profile(current_user["_id"])
    scores = calculate_scores(request)
    now = datetime.now(timezone.utc)
    await student_assessments.update_one({"user_id": current_user["_id"]}, {"$set": {"user_id": current_user["_id"], **request.model_dump(), "scores": scores, "updated_at": now}, "$setOnInsert": {"created_at": now}}, upsert=True)
    return {"scores": scores, "learning_style": request.learning_style, "message": "These scores are planning guidance, not a diagnosis or grade prediction."}


@router.post("/roadmap")
async def create_roadmap(current_user: dict = Depends(get_current_user)):
    profile = await _profile(current_user["_id"])
    assessment = await student_assessments.find_one({"user_id": current_user["_id"]}, {"_id": 0})
    if not assessment:
        raise HTTPException(status_code=400, detail="Complete the student assessment before creating a roadmap.")
    today = date.today()
    exam_date = profile.get("exam_date") or today + timedelta(days=28)
    if isinstance(exam_date, datetime): exam_date = exam_date.date()
    days = max(7, (exam_date - today).days)
    await student_tasks.delete_many({"user_id": current_user["_id"], "source": "roadmap"})
    tasks = []
    difficult = assessment.get("difficult_topics") or []
    subjects = profile["subjects"]
    roadmap_days = min(28, days)
    for offset in range(roadmap_days):
        subject = subjects[offset % len(subjects)]
        topic = difficult[offset % len(difficult)] if difficult else f"core topic in {subject}"
        week = offset // 7 + 1
        kind = "study" if week == 1 else "quiz" if week == 2 else "revision" if week == 3 else "mock_test"
        title = f"{subject}: {topic}" if kind != "mock_test" else f"{subject}: timed mock test and final revision"
        task = {"_id": str(uuid.uuid4()), "user_id": current_user["_id"], "title": title, "kind": kind, "week": week, "date": (today + timedelta(days=offset)).isoformat(), "minutes": max(25, round(profile.get("study_hours", 2) * 60 / 2)), "completed": False, "source": "roadmap", "created_at": datetime.now(timezone.utc)}
        tasks.append(task)
    await student_tasks.insert_many(tasks)
    return {"exam_date": exam_date.isoformat(), "days_remaining": days, "weeks": min(4, (roadmap_days + 6) // 7), "tasks": [{k: v for k, v in task.items() if k not in ("user_id", "created_at")} for task in tasks]}


@router.get("/overview")
async def overview(current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    profile = await student_profiles.find_one({"user_id": user_id}, {"_id": 0})
    assessment = await student_assessments.find_one({"user_id": user_id}, {"_id": 0})
    today = date.today().isoformat()
    tasks = [{k: v for k, v in task.items() if k not in ("user_id", "created_at")} async for task in student_tasks.find({"user_id": user_id, "date": today}, {"_id": 1, "title": 1, "kind": 1, "minutes": 1, "completed": 1, "date": 1, "week": 1})]
    roadmap = [{k: v for k, v in task.items() if k not in ("user_id", "created_at")} async for task in student_tasks.find({"user_id": user_id, "source": "roadmap"}, {"_id": 1, "title": 1, "kind": 1, "minutes": 1, "completed": 1, "date": 1, "week": 1}).sort("date", 1)]
    checkin = await student_checkins.find_one({"user_id": user_id, "date": today}, {"_id": 0, "mood": 1, "note": 1})
    return {"profile": profile, "assessment": assessment, "tasks": tasks, "roadmap": roadmap, "checkin": checkin}


@router.get("/study-tools")
async def study_tools(current_user: dict = Depends(get_current_user)):
    profile = await _profile(current_user["_id"])
    assessment = await student_assessments.find_one({"user_id": current_user["_id"]}, {"_id": 0}) or {}
    subjects = profile.get("subjects", [])
    difficult = assessment.get("difficult_topics", [])
    return {"lessons": [f"Psychology lesson: focused study and memory for {subject}" for subject in subjects[:3]], "flashcards": [f"Flashcards for {topic}" for topic in difficult[:3]], "previous_year_questions": [f"Previous-year questions: {subject}" for subject in subjects[:3]], "mock_tests": [f"Mock test: {subject}" for subject in subjects[:3]]}


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, request: TaskPatch, current_user: dict = Depends(get_current_user)):
    result = await student_tasks.update_one({"_id": task_id, "user_id": current_user["_id"]}, {"$set": {"completed": request.completed, "updated_at": datetime.now(timezone.utc)}})
    if not result.matched_count: raise HTTPException(status_code=404, detail="Task not found.")
    return {"id": task_id, "completed": request.completed}


@router.post("/checkin")
async def checkin(request: CheckinRequest, current_user: dict = Depends(get_current_user)):
    today = date.today().isoformat()
    await student_checkins.update_one({"user_id": current_user["_id"], "date": today}, {"$set": {"user_id": current_user["_id"], "date": today, **request.model_dump(), "updated_at": datetime.now(timezone.utc)}}, upsert=True)
    guidance = {"happy": "Keep your momentum with one focused study block.", "okay": "Start with your most important task, then take a short break.", "stressed": "Use a 45-minute focused block, then take a 10-minute break and choose an easier next task.", "tired": "Choose one short revision task today and protect your rest."}
    return {"mood": request.mood, "guidance": guidance[request.mood]}


@router.get("/coach-context")
async def coach_context(current_user: dict = Depends(get_current_user)):
    profile = await student_profiles.find_one({"user_id": current_user["_id"]}, {"_id": 0, "institution": 1, "course": 1, "semester": 1, "subjects": 1, "study_hours": 1})
    assessment = await student_assessments.find_one({"user_id": current_user["_id"]}, {"_id": 0, "difficult_topics": 1, "learning_style": 1, "scores": 1})
    tasks = [task["title"] async for task in student_tasks.find({"user_id": current_user["_id"], "date": date.today().isoformat(), "completed": False}, {"title": 1})]
    return {"profile": profile, "assessment": assessment, "today_tasks": tasks}
