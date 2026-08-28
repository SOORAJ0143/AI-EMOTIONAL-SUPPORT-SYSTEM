from pymongo import AsyncMongoClient
from pymongo.server_api import ServerApi

from app.config import settings

client = AsyncMongoClient(
    settings.MONGODB_URI,
    # Atlas Vector Search's $vectorSearch stage is not available in Stable API
    # strict mode. Keep API versioning, but allow this Atlas-specific stage.
    server_api=ServerApi("1", strict=False, deprecation_errors=True),
)

db = client[settings.MONGODB_DB]

users = db.users
conversations = db.conversations
messages = db.messages
emotional_analytics = db.emotional_analytics
user_memories = db.user_memories
knowledge_base = db.knowledge_base
student_profiles = db.student_profiles
student_assessments = db.student_assessments
student_tasks = db.student_tasks
student_checkins = db.student_checkins


async def connect_to_mongodb():
    await client.admin.command("ping")
    await users.create_index("email", unique=True)
    await conversations.create_index("user_id")
    await messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await emotional_analytics.create_index([("user_id", 1), ("date", 1)], unique=True)
    await user_memories.create_index("user_id")
    await student_profiles.create_index("user_id", unique=True)
    await student_assessments.create_index([("user_id", 1), ("updated_at", -1)])
    await student_tasks.create_index([("user_id", 1), ("date", 1), ("completed", 1)])
    await student_checkins.create_index([("user_id", 1), ("date", -1)], unique=True)


async def close_mongodb_connection():
    await client.close()
