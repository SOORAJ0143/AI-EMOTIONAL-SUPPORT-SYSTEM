import openai
from app.config import settings


class SafetyDetector:
    """Fast safety checks that do not download a large local ML model."""

    def __init__(self):
        self.openai_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.crisis_keywords = ("kill myself", "suicide", "end my life", "want to die", "harm myself")

    async def check(self, text: str) -> dict:
        normalized = text.lower()
        if any(keyword in normalized for keyword in self.crisis_keywords):
            return {"risk_level": "critical", "flagged_categories": ["self_harm"], "toxicity_score": 0.0, "safe": False}

        try:
            moderation = await self.openai_client.moderations.create(input=text)
            result = moderation.results[0]
            categories = result.categories.model_dump()
            flagged = result.flagged
        except Exception:
            categories = {}
            flagged = False

        return {
            "risk_level": "high" if flagged else "low",
            "flagged_categories": [name for name, value in categories.items() if value],
            "toxicity_score": 0.0,
            "safe": not flagged,
        }
