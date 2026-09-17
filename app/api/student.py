"""Student Success APIs. Scores are transparent guidance, never diagnoses or grade guarantees."""
from datetime import date, datetime, timedelta, timezone
from typing import Literal
import re
import uuid
import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pypdf import PdfReader
from docx import Document
from io import BytesIO
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.models.mongo import student_assessments, student_checkins, student_profiles, student_tasks, users
from app.config import settings

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
    syllabus: str = Field(default="")
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
    completed: bool | None = None
    actual_minutes: int | None = Field(default=None, ge=0, le=1440)
    status: Literal["not_started", "in_progress", "completed"] | None = None
    scheduled_date: date | None = None
    priority: Literal["low", "medium", "high"] | None = None
    title: str | None = Field(default=None, min_length=3, max_length=500)


class TaskCreateRequest(BaseModel):
    description: str = Field(min_length=3, max_length=500)
    deadline: date | None = None
    recurrence: Literal["none", "daily", "weekly"] = "none"
    subject: str = Field(default="", max_length=100)
    confirm_schedule: bool = True


def _syllabus_topics(text: str) -> list[str]:
    """Read a syllabus outline without treating administrative text as study material."""
    raw_lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    unit_pattern = re.compile(r"^(?:unit|module)\s*(?:[-:–.]?\s*(?:[ivxlcdm]+|\d+))?\s*[-:–.]?\s*(.*)$", re.IGNORECASE)
    units: list[dict] = []
    current: dict | None = None
    for line in raw_lines:
        match = unit_pattern.match(line)
        if match:
            title = match.group(1).strip(" -:–.")
            current = {"label": line[:180] if title else line[:80], "topics": []}
            units.append(current)
        elif current and line and not re.match(r"^(?:co|po|pso|course code|credits?|hours?|assessment)\b", line, re.IGNORECASE):
            item = re.sub(r"^(?:[A-Z]|\d+(?:\.\d+)?)\s*[.):\-]\s*", "", line).strip()
            if 4 <= len(item) <= 220:
                current["topics"].append(item)
    if units:
        extracted = []
        for unit in units:
            for topic in unit["topics"]:
                extracted.append(f"{unit['label']} — {topic}")
            if not unit["topics"]:
                extracted.append(unit["label"])
        return list(dict.fromkeys(extracted))[:120]
    lines = [re.sub(r"^[\s\d.\-•]+", "", line).strip() for line in raw_lines]
    topics = [line[:180] for line in lines if 3 <= len(line) <= 180 and not line.lower().startswith(("page ", "syllabus", "course code", "co and po mapping", "average of"))]
    return list(dict.fromkeys(topics))[:80]


def _docx_syllabus_units(content: bytes) -> list[str]:
    """Read Unit/Module rows and their topic rows from structured university DOCX tables."""
    document = Document(BytesIO(content))
    units: list[dict] = []
    current: dict | None = None
    unit_re = re.compile(r"^unit\s*([ivxlcdm]+|\d+)\b", re.IGNORECASE)
    item_re = re.compile(r"^[A-Z]$|^\d+(?:\.\d+)?$", re.IGNORECASE)
    for table in document.tables:
        for row in table.rows:
            cells = []
            for cell in row.cells:
                value = re.sub(r"\s+", " ", cell.text).strip()
                if value and value not in cells:
                    cells.append(value)
            if not cells:
                continue
            unit_index = next((i for i, value in enumerate(cells) if unit_re.match(value)), None)
            if unit_index is not None:
                number = unit_re.match(cells[unit_index]).group(1)
                title = next((value for value in cells[unit_index + 1:] if not value.lower().startswith("co") and len(value) > 2), "")
                current = {"label": f"Unit {number}" + (f": {title}" if title else ""), "topics": []}
                units.append(current)
                continue
            if current and item_re.match(cells[0]):
                topic = next((value for value in cells[1:] if not value.lower().startswith("co") and len(value) > 5), "")
                if topic:
                    current["topics"].append(topic)
    extracted = []
    for unit in units:
        for topic in unit["topics"]:
            extracted.append(f"{unit['label']} — {topic}")
    return list(dict.fromkeys(extracted))[:160]


def _study_chunks(topics: list[str]) -> list[dict[str, str]]:
    """Turn broad unit text into small, teachable syllabus-only study chunks."""
    chunks: list[dict[str, str]] = []
    seen = set()
    for raw_topic in topics:
        text = re.sub(r"\s+", " ", str(raw_topic)).strip()
        if not text:
            continue
        prefix, separator, body = text.partition(" — ")
        if not separator:
            prefix, body = "Course topic", text
        # University syllabi commonly use pipes, semicolons, and commas inside each unit row.
        pieces = re.split(r"\s*(?:\||;|\u2022)\s*|,\s*(?![^()]*\))", body)
        clean_pieces = [re.sub(r"^(?:[A-Z]|\d+(?:\.\d+)?)\s*[.):\-]\s*", "", part).strip(" -:–.") for part in pieces]
        clean_pieces = [part for part in clean_pieces if len(part) >= 3]
        if not clean_pieces:
            clean_pieces = [body]
        for piece in clean_pieces:
            piece = piece[:180]
            lowered = piece.lower()
            if any(marker in lowered for marker in ("co and po mapping", "po and pso mapping", "strength of correlation", "addressed to", "course name", "average of non-zeros")):
                continue
            key = f"{prefix.lower()}::{piece.lower()}"
            if key not in seen:
                seen.add(key)
                chunks.append({"unit": prefix[:100], "topic": piece})
    return chunks


def _time_after(start_time: str, minutes: int) -> str:
    start_hour, start_minute = (int(part) for part in start_time.split(":"))
    total = (start_hour * 60 + start_minute + minutes) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _pdf_text(value: str) -> str:
    return (str(value).replace("–", "-").replace("—", "-").replace("•", "-")
            .replace("’", "'").encode("latin-1", "replace").decode("latin-1"))


def _pdf_wrap(value: str, width: int = 88) -> list[str]:
    words = _pdf_text(value).split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    return lines + ([current] if current else [""])


async def send_due_reminders():
    """Called by the application scheduler; safely skips delivery when SMTP is not configured."""
    if not all((settings.SMTP_HOST, settings.SMTP_USERNAME, settings.SMTP_PASSWORD, settings.SMTP_FROM_EMAIL)): return
    now = datetime.now().strftime("%H:%M")
    today = date.today().isoformat()
    tasks = [task async for task in student_tasks.find({"date": today, "completed": False, "$or": [{"start_time": now}, {"end_time": now}]})]
    for task in tasks:
        marker = f"reminder_{now}"
        if task.get(marker): continue
        user = await users.find_one({"_id": task["user_id"]}, {"email": 1, "name": 1})
        if not user or not user.get("email"): continue
        is_start = task.get("start_time") == now
        message = EmailMessage(); message["Subject"] = f"HOPEMO study reminder: {task['title']}"; message["From"] = settings.SMTP_FROM_EMAIL; message["To"] = user["email"]
        message.set_content(f"Hi {user.get('name', 'there')},\n\n{'Your study block starts now.' if is_start else 'Your scheduled study block has ended.'}\n\nTask: {task['title']}\n\nOpen Student Success to mark it complete or continue it later.")
        try:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=12) as server:
                if settings.SMTP_USE_TLS: server.starttls()
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD); server.send_message(message)
            await student_tasks.update_one({"_id": task["_id"]}, {"$set": {marker: True}})
        except Exception:
            continue


@router.post("/syllabus")
async def upload_syllabus(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    name = file.filename or "syllabus"
    suffix = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    if suffix not in {"pdf", "docx", "txt"}:
        raise HTTPException(status_code=400, detail="Upload a PDF, DOCX, or TXT syllabus file.")
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Keep syllabus files under 8 MB.")
    try:
        if suffix == "pdf": text = "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(content)).pages)
        elif suffix == "docx":
            document = Document(BytesIO(content))
            text = "\n".join(p.text for p in document.paragraphs)
        else: text = content.decode("utf-8", errors="ignore")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="We could not read that file. Try a text-based PDF, DOCX, or TXT file.") from exc
    topics = _docx_syllabus_units(content) if suffix == "docx" else _syllabus_topics(text)
    if not topics:
        topics = _syllabus_topics(text)
    if not topics: raise HTTPException(status_code=400, detail="No study topics were found in this file.")
    await student_assessments.update_one({"user_id": current_user["_id"]}, {"$set": {"syllabus_file": name, "syllabus_text": text[:24000], "syllabus_topics": topics, "updated_at": datetime.now(timezone.utc)}}, upsert=True)
    found_units = any(re.match(r"^(?:unit|module)\b", item, re.IGNORECASE) for item in topics)
    return {"file_name": name, "topics": topics, "topic_count": len(topics), "extraction_type": "units" if found_units else "topics"}


def _score(value: float) -> int:
    return max(0, min(100, round(value)))


def calculate_scores(item: AssessmentRequest) -> dict:
    progress = item.completed_topics / item.total_topics
    readiness = _score(progress * 55 + item.focus * 6 + item.time_management * 5)
    wellness = _score((item.motivation + item.sleep + (6 - item.stress)) / 15 * 100)
    productivity = _score((item.time_management + (6 - item.procrastination) + item.revision_frequency) / 15 * 100)
    exam_readiness = _score(readiness * .65 + productivity * .2 + wellness * .15)
    return {"academic_readiness": readiness, "focus": _score(item.focus / 5 * 100), "wellness": wellness, "time_management": _score(item.time_management / 5 * 100), "productivity": productivity, "exam_readiness": exam_readiness, "stress_level": "high" if item.stress >= 4 else "medium" if item.stress == 3 else "low"}


def understand_task(description: str, deadline: date | None, recurrence: str) -> dict:
    """A transparent first-pass planner for naturally written student tasks."""
    text = description.lower()
    duration_match = re.search(r"\b(\d+(?:\.5)?)\s*(minutes?|mins?|hours?|hrs?|hr|h)\b", text)
    minutes = 45
    if duration_match:
        amount = float(duration_match.group(1))
        minutes = round(amount * 60) if duration_match.group(2).startswith(("h", "hr")) else round(amount)
    minutes = max(15, min(minutes, 480))
    difficulty = "high" if any(word in text for word in ("hard", "difficult", "challenging", "complex")) else "low" if any(word in text for word in ("easy", "quick", "simple")) else "medium"
    priority = "high" if any(word in text for word in ("urgent", "asap", "important", "exam", "submit", "deadline")) else "medium"
    if "daily" in text: recurrence = "daily"
    elif "weekly" in text or "every week" in text: recurrence = "weekly"
    today = date.today()
    if not deadline and "tomorrow" in text: deadline = today + timedelta(days=1)
    elif not deadline and "today" in text: deadline = today
    if deadline and deadline <= today + timedelta(days=1): priority = "high"
    scheduled_for = today if priority == "high" or not deadline else min(deadline - timedelta(days=1), today + timedelta(days=2))
    return {"minutes": minutes, "difficulty": difficulty, "priority": priority, "deadline": deadline.isoformat() if deadline else None, "recurrence": recurrence, "date": scheduled_for.isoformat()}


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
    elif isinstance(exam_date, str):
        try:
            exam_date = date.fromisoformat(exam_date)
        except ValueError:
            exam_date = today + timedelta(days=28)
    days = max(7, (exam_date - today).days)
    await student_tasks.delete_many({"user_id": current_user["_id"], "source": "roadmap"})
    tasks = []
    difficult = [str(topic).lower() for topic in (assessment.get("difficult_topics") or [])]
    syllabus_topics = assessment.get("syllabus_topics") or _syllabus_topics(assessment.get("syllabus_text") or assessment.get("syllabus", ""))
    completed = [str(topic).lower() for topic in assessment.get("completed_chapters", [])]
    chunks = [chunk for chunk in _study_chunks(syllabus_topics) if not any(done in chunk["topic"].lower() for done in completed)]
    if not chunks:
        chunks = _study_chunks(syllabus_topics) or [{"unit": profile.get("course") or "Course", "topic": "Review the course outline and create your first notes"}]
    # Difficult areas appear earlier, but every item still comes only from the submitted syllabus.
    chunks.sort(key=lambda chunk: 0 if any(term and term in chunk["topic"].lower() for term in difficult) else 1)
    study_hours = max(0.25, float(profile.get("study_hours", 2)))
    focus = int(assessment.get("focus", 3))
    motivation = int(assessment.get("motivation", 3))
    time_management = int(assessment.get("time_management", 3))
    stress = int(assessment.get("stress", 3))
    procrastination = int(assessment.get("procrastination", 3))
    readiness = (focus + motivation + time_management + (6 - stress) + (6 - procrastination)) / 25
    block_minutes = 50 if study_hours >= 2 and readiness >= .58 else 40 if study_hours >= 1 else 25
    planned_minutes = max(25, min(150, round(study_hours * 60 * (.65 + readiness * .2))))
    daily_capacity = max(1, min(3, planned_minutes // block_minutes))
    roadmap_days = min(days, max(1, (len(chunks) + daily_capacity - 1) // daily_capacity))
    subject = profile.get("course") or (profile.get("subjects") or ["Study"])[0]
    for offset in range(roadmap_days):
        day_chunks = chunks[offset * daily_capacity:(offset + 1) * daily_capacity]
        if not day_chunks:
            break
        minutes = max(25, round(planned_minutes / len(day_chunks))) * len(day_chunks)
        labels = [chunk["topic"] for chunk in day_chunks]
        unit = day_chunks[0]["unit"]
        title = f"{unit}: " + "; ".join(labels)
        task = {"_id": str(uuid.uuid4()), "user_id": current_user["_id"], "title": title[:500], "subject": subject, "kind": "study", "week": offset // 7 + 1, "date": (today + timedelta(days=offset)).isoformat(), "start_time": "18:00", "end_time": _time_after("18:00", minutes), "minutes": minutes, "subtasks": [{"id": str(uuid.uuid4()), "title": label, "minutes": max(20, round(minutes / len(labels))), "completed": False} for label in labels], "completed": False, "status": "not_started", "source": "roadmap", "created_at": datetime.now(timezone.utc)}
        tasks.append(task)
    await student_tasks.insert_many(tasks)
    return {"exam_date": exam_date.isoformat(), "days_remaining": days, "weeks": (len(tasks) + 6) // 7, "tasks": [{k: v for k, v in task.items() if k not in ("user_id", "created_at")} for task in tasks]}


@router.get("/overview")
async def overview(current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    profile = await student_profiles.find_one({"user_id": user_id}, {"_id": 0})
    assessment = await student_assessments.find_one({"user_id": user_id}, {"_id": 0})
    today = date.today().isoformat()
    task_fields = {"_id": 1, "title": 1, "subject": 1, "kind": 1, "minutes": 1, "actual_minutes": 1, "completed": 1, "status": 1, "date": 1, "week": 1, "priority": 1, "difficulty": 1, "deadline": 1, "recurrence": 1, "subtasks": 1, "source": 1}
    tasks = [{k: v for k, v in task.items() if k not in ("user_id", "created_at")} async for task in student_tasks.find({"user_id": user_id, "date": today}, task_fields).sort("priority", -1)]
    roadmap = [{k: v for k, v in task.items() if k not in ("user_id", "created_at")} async for task in student_tasks.find({"user_id": user_id, "source": "roadmap"}, {"_id": 1, "title": 1, "kind": 1, "minutes": 1, "completed": 1, "date": 1, "week": 1, "start_time": 1, "end_time": 1, "subtasks": 1}).sort("date", 1)]
    checkin = await student_checkins.find_one({"user_id": user_id, "date": today}, {"_id": 0, "mood": 1, "note": 1})
    overdue = [task async for task in student_tasks.find({"user_id": user_id, "completed": False, "date": {"$lt": today}}, {"title": 1, "date": 1, "deadline": 1})]
    due_soon = [task async for task in student_tasks.find({"user_id": user_id, "completed": False, "deadline": {"$in": [today, (date.today() + timedelta(days=1)).isoformat()]}}, {"title": 1, "deadline": 1})]
    notifications = ([f"{task['title']} needs attention: it was scheduled for {task['date']}." for task in overdue[:2]] + [f"{task['title']} is due {task['deadline']}." for task in due_soon[:2]])
    all_tasks = [{k: v for k, v in task.items() if k not in ("user_id", "created_at")} async for task in student_tasks.find({"user_id": user_id}, task_fields).sort("date", 1)]
    completed = [task for task in all_tasks if task.get("completed")]
    recurring = [task for task in all_tasks if task.get("recurrence") and task["recurrence"] != "none"]
    task_views = {"do_now": [task for task in all_tasks if not task.get("completed") and task.get("priority") == "high" and task.get("date", today) <= today], "today": tasks, "upcoming": [task for task in all_tasks if not task.get("completed") and task.get("date", today) > today], "overdue": [task for task in all_tasks if not task.get("completed") and task.get("date", today) < today], "completed": completed}
    consistency = f"{sum(1 for task in recurring if task.get('completed'))}/{len(recurring)} recurring tasks completed" if recurring else "Add a recurring task to begin consistency tracking."
    if tasks and not notifications:
        minutes_left = sum(task.get("minutes", 0) for task in tasks if not task.get("completed"))
        notifications.append(f"You have about {minutes_left} minutes planned today. Start the highest-priority task first.")
    return {"profile": profile, "assessment": assessment, "tasks": tasks, "task_views": task_views, "roadmap": roadmap, "checkin": checkin, "notifications": notifications, "task_insights": {"recurring_consistency": consistency, "completed_count": len(completed), "planned_minutes": sum(task.get("minutes", 0) for task in all_tasks), "actual_minutes": sum(task.get("actual_minutes", 0) for task in all_tasks)}}


@router.delete("/reset")
async def reset_student_success(current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    await student_profiles.delete_one({"user_id": user_id})
    await student_assessments.delete_one({"user_id": user_id})
    await student_tasks.delete_many({"user_id": user_id})
    await student_checkins.delete_many({"user_id": user_id})
    return {"message": "Your Student Success profile, roadmap, and tasks were reset."}


@router.get("/roadmap.pdf")
async def roadmap_pdf(current_user: dict = Depends(get_current_user)):
    profile = await _profile(current_user["_id"])
    tasks = [task async for task in student_tasks.find({"user_id": current_user["_id"], "source": "roadmap"}, {"title": 1, "date": 1, "start_time": 1, "end_time": 1, "minutes": 1, "subtasks": 1}).sort("date", 1)]
    lines = [f"HOPEMO study roadmap - {profile.get('student_name', 'Student')}", f"Course: {profile.get('course', '')}", f"Daily study time: {profile.get('study_hours', 0)} hours", f"{len(tasks)} planned study days", ""]
    for task in tasks:
        lines.extend(_pdf_wrap(f"{task.get('date')} | {task.get('start_time', '18:00')}-{task.get('end_time', '')} | {task.get('minutes', 0)} minutes"))
        for subtask in task.get("subtasks") or [{"title": task.get("title", "Study task")}]:
            lines.extend(_pdf_wrap(f"  - {subtask.get('title', '')}"))
        lines.append("")
    pages = [lines[index:index + 42] for index in range(0, len(lines), 42)] or [["No roadmap tasks have been created yet."]]
    objects = {1: "<< /Type /Catalog /Pages 2 0 R >>", 3: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"}
    page_ids = []
    next_id = 4
    for page_lines in pages:
        page_id, content_id = next_id, next_id + 1
        next_id += 2
        page_ids.append(page_id)
        escaped = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in page_lines]
        stream = "BT /F1 11 Tf 50 760 Td " + " ".join(f"({line}) Tj 0 -16 Td" for line in escaped) + " ET"
        objects[page_id] = f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"
        objects[content_id] = f"<< /Length {len(stream.encode())} >>\nstream\n{stream}\nendstream"
    objects[2] = f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {len(page_ids)} >>"
    parts, offsets = ["%PDF-1.4\n"], []
    for index in range(1, next_id):
        offsets.append(sum(len(p.encode()) for p in parts)); parts.append(f"{index} 0 obj\n{objects[index]}\nendobj\n")
    xref = sum(len(p.encode()) for p in parts); parts.append(f"xref\n0 {next_id}\n0000000000 65535 f \n" + "".join(f"{offset:010d} 00000 n \n" for offset in offsets) + f"trailer << /Size {next_id} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF")
    return Response(content="".join(parts).encode(), media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=hopemo-study-roadmap.pdf"})


@router.get("/study-tools")
async def study_tools(current_user: dict = Depends(get_current_user)):
    profile = await _profile(current_user["_id"])
    assessment = await student_assessments.find_one({"user_id": current_user["_id"]}, {"_id": 0}) or {}
    subjects = profile.get("subjects", [])
    difficult = assessment.get("difficult_topics", [])
    return {"lessons": [f"Psychology lesson: focused study and memory for {subject}" for subject in subjects[:3]], "flashcards": [f"Flashcards for {topic}" for topic in difficult[:3]], "previous_year_questions": [f"Previous-year questions: {subject}" for subject in subjects[:3]], "mock_tests": [f"Mock test: {subject}" for subject in subjects[:3]]}


@router.post("/tasks/preview")
async def preview_smart_task(request: TaskCreateRequest, current_user: dict = Depends(get_current_user)):
    await _profile(current_user["_id"])
    plan = understand_task(request.description, request.deadline, request.recurrence)
    title = request.description.strip()
    subtasks = []
    if plan["minutes"] >= 90 or plan["difficulty"] == "high":
        portions = 3 if plan["minutes"] >= 150 else 2
        subtasks = [{"title": f"Part {index + 1}: {title}", "completed": False, "minutes": max(20, round(plan["minutes"] / portions))} for index in range(portions)]
    return {"title": title, "subject": request.subject.strip(), "plan": plan, "subtasks": subtasks, "suggestion": f"Schedule this {plan['priority']}-priority task for {plan['date']}."}


@router.post("/tasks")
async def add_smart_task(request: TaskCreateRequest, current_user: dict = Depends(get_current_user)):
    await _profile(current_user["_id"])
    plan = understand_task(request.description, request.deadline, request.recurrence)
    title = request.description.strip()
    portions = 3 if plan["minutes"] >= 150 else 2 if plan["minutes"] >= 90 or plan["difficulty"] == "high" else 0
    subtasks = [{"id": str(uuid.uuid4()), "title": f"Part {index + 1}: {title}", "completed": False, "minutes": max(20, round(plan["minutes"] / portions))} for index in range(portions)] if portions else []
    task = {"_id": str(uuid.uuid4()), "user_id": current_user["_id"], "title": title, "subject": request.subject.strip(), "kind": "student_task", **plan, "status": "not_started", "completed": False, "actual_minutes": 0, "subtasks": subtasks, "source": "student", "created_at": datetime.now(timezone.utc)}
    await student_tasks.insert_one(task)
    result = {k: v for k, v in task.items() if k not in ("user_id", "created_at")}
    return {"task": result, "message": f"Added as a {plan['priority']}-priority {plan['minutes']}-minute task for {plan['date']}."}


@router.patch("/tasks/{task_id}")
async def update_task(task_id: str, request: TaskPatch, current_user: dict = Depends(get_current_user)):
    update = {"updated_at": datetime.now(timezone.utc)}
    if request.completed is not None:
        update["completed"] = request.completed
        update["status"] = "completed" if request.completed else (request.status or "not_started")
    elif request.status is not None:
        update["status"] = request.status
        update["completed"] = request.status == "completed"
    if request.scheduled_date is not None: update["date"] = request.scheduled_date.isoformat()
    if request.priority is not None: update["priority"] = request.priority
    if request.title is not None: update["title"] = request.title.strip()
    if request.actual_minutes is not None:
        update["actual_minutes"] = request.actual_minutes
    if update.get("completed"):
        update["completed_at"] = datetime.now(timezone.utc)
    result = await student_tasks.update_one({"_id": task_id, "user_id": current_user["_id"]}, {"$set": update})
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
