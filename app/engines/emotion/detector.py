"""Lightweight emotion signals for the free Render deployment.

The previous transformer model required several gigabytes of memory. These
signals keep the conversation insights responsive without loading a model at
startup; the OpenAI response generator still provides the conversational AI.
"""
from collections import defaultdict


class EmotionalAnalyzer:
    def __init__(self):
        self.keywords = {
            "anxiety": ("anxious", "anxiety", "nervous", "worried", "panic", "scared"),
            "stress": ("stress", "stressed", "overwhelmed", "pressure", "tense"),
            "sadness": ("sad", "down", "cry", "grief", "heartbroken", "upset"),
            "loneliness": ("lonely", "alone", "isolated", "nobody", "disconnected"),
            "burnout": ("burnout", "burned out", "exhausted", "drained", "tired"),
            "hope": ("hopeful", "better", "grateful", "optimistic", "calm", "peaceful"),
            "motivation": ("motivated", "excited", "ready", "progress", "confident"),
            "emotional_exhaustion": ("exhausted", "drained", "can't cope", "cannot cope", "too much"),
            "urgency": ("urgent", "help now", "panic", "can't breathe", "crisis"),
        }

    async def analyze(self, text: str) -> dict:
        normalized = text.lower()
        scores = defaultdict(float)
        for emotion, words in self.keywords.items():
            matches = sum(word in normalized for word in words)
            scores[emotion] = min(1.0, matches * 0.38)

        if not any(scores.values()):
            scores["hope"] = 0.12
        primary_emotion = max(scores, key=scores.get)
        intensity = max(scores.values())
        return {**scores, "primary_emotion": primary_emotion, "intensity": intensity}
