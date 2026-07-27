# app/engines/safety/detector.py
import openai
from detoxify import Detoxify
import asyncio
from dotenv import load_dotenv
from app.config import settings
load_dotenv()

class SafetyDetector:
    def __init__(self):
        self.openai_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.detoxify_model = Detoxify('original')  # Multilingual

    async def check(self, text: str) -> dict:
        # 1. OpenAI Moderation
        moderation = await self.openai_client.moderations.create(input=text)
        flagged = moderation.results[0].flagged
        categories = moderation.results[0].categories.model_dump()
        
        # 2. Detoxify
        toxicity_scores = self.detoxify_model.predict(text)
        
        # 3. Combine risk levels
        risk = "low"
        if flagged or toxicity_scores['toxicity'] > 0.7:
            risk = "high"
        elif toxicity_scores['toxicity'] > 0.5:
            risk = "medium"
        
        # Crisis detection keywords
        crisis_keywords = ["kill myself", "suicide", "end my life", "want to die"]
        if any(kw in text.lower() for kw in crisis_keywords):
            risk = "critical"
        
        return {
            "risk_level": risk,
            "flagged_categories": [k for k, v in categories.items() if v],
            "toxicity_score": toxicity_scores['toxicity'],
            "safe": risk in ["low", "medium"]
        }