import re


class ResponseValidator:
    """Lightweight response guardrail for the Render free instance."""

    def __init__(self, use_moderation: bool = True):
        self.harmful_patterns = [
            re.compile(pattern, re.IGNORECASE)
            for pattern in (r"\bkill\s+yourself\b", r"\bcommit\s+suicide\b", r"\bend\s+your\s+life\b", r"\bharm\s+yourself\b")
        ]

    async def validate(self, response: str) -> dict:
        harmful = any(pattern.search(response) for pattern in self.harmful_patterns)
        return {"safe": not harmful, "toxicity": 0.0, "harmful_detected": harmful, "moderation_flagged": False, "issues": ["harmful pattern"] if harmful else []}
