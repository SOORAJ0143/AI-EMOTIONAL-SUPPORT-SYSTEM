from datetime import datetime, timezone

from app.models.mongo import emotional_analytics


class AnalyticsTracker:
    async def update(self, user_id: str, emotion_scores: dict, risk_level: str = "low"):
        now = datetime.now(timezone.utc)
        date_key = now.strftime("%Y-%m-%d")
        existing = await emotional_analytics.find_one({"user_id": user_id, "date": date_key})

        if not existing:
            await emotional_analytics.insert_one(
                {
                    "user_id": user_id,
                    "date": date_key,
                    "avg_anxiety": emotion_scores.get("anxiety", 0),
                    "avg_stress": emotion_scores.get("stress", 0),
                    "avg_hope": emotion_scores.get("hope", 0),
                    "dominant_emotion": emotion_scores.get("primary_emotion"),
                    "risk_level": risk_level,
                    "entries_count": 1,
                    "created_at": now,
                }
            )
            return

        count = existing.get("entries_count", 0)
        new_count = count + 1
        await emotional_analytics.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "avg_anxiety": (existing.get("avg_anxiety", 0) * count + emotion_scores.get("anxiety", 0)) / new_count,
                    "avg_stress": (existing.get("avg_stress", 0) * count + emotion_scores.get("stress", 0)) / new_count,
                    "avg_hope": (existing.get("avg_hope", 0) * count + emotion_scores.get("hope", 0)) / new_count,
                    "dominant_emotion": emotion_scores.get("primary_emotion"),
                    "risk_level": risk_level,
                    "entries_count": new_count,
                    "updated_at": now,
                }
            },
        )
