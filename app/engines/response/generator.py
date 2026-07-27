import openai
import json
import os
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from dotenv import load_dotenv
from app.config import settings

load_dotenv()

class ResponseGenerator:
    def __init__(self, examples_file="data/my_data.json"):
        self.client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=10.0, max_retries=0)
        self.examples = self._load_examples(examples_file)
        self.system_prompt_base = """You are HOPEMO, an emotionally intelligent assistant.
Be concise, warm, supportive, and natural. Never sound clinical.
Use the provided context (memories, knowledge, associative recalls) to personalize.
Keep responses under 150 words.
Vary your phrasing, reflection style, and follow-up questions naturally. Do not reuse stock openings in consecutive answers. Respond directly to the user's latest words before asking one gentle question.

Here are examples of how you should respond:
{examples}
"""
        self.few_shot_prompt = self.system_prompt_base.format(examples=self.examples)

    def _load_examples(self, file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if isinstance(data, dict):
                examples_list = data.get("examples", [])
            elif isinstance(data, list):
                examples_list = data
            else:
                print(f"Warning: Examples file {file_path} has an unsupported format. Using minimal prompt.")
                return ""

            try:
                example_limit = int(os.getenv("HOPEMO_EXAMPLE_LIMIT", "20"))
            except ValueError:
                example_limit = 20

            formatted = []
            for ex in examples_list:
                if not isinstance(ex, dict):
                    continue

                user = ex.get("user") or ex.get("User Query")
                assistant = ex.get("assistant") or ex.get("Chatbot Response")
                if not user or not assistant:
                    continue

                formatted.append(f'User: "{user}"\nAssistant: "{assistant}"')
                if len(formatted) >= example_limit:
                    break

            return "\n\n".join(formatted)
        except FileNotFoundError:
            print(f"Warning: Examples file {file_path} not found. Using minimal prompt.")
            return ""

    @retry(
        stop=stop_after_attempt(1),
        wait=wait_exponential(multiplier=1, min=1, max=1),
        retry=retry_if_exception_type((openai.APITimeoutError, openai.APIError, openai.RateLimitError))
    )
    async def generate(self, user_message: str, context: str, emotion: dict, safety: dict) -> str:
        messages = [
            {"role": "system", "content": self.few_shot_prompt},
            {"role": "system", "content": f"Current emotional state: {json.dumps(emotion)}"},
            {"role": "system", "content": f"Relevant context:\n{context}"}
        ]

        if safety.get('risk_level') in ['high', 'critical']:
            messages.append({
                "role": "system",
                "content": "The user may be in distress. Prioritize safety and provide crisis resources. Keep your response calm and supportive."
            })

        messages.append({"role": "user", "content": user_message})

        response = await self.client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-3.5-turbo"),
            messages=messages,
            temperature=0.85,
            max_tokens=300,
            presence_penalty=0.45,
            frequency_penalty=0.25,
            stream=False
        )
        return response.choices[0].message.content

    async def generate_stream(self, user_message: str, context: str, emotion: dict, safety: dict):
        messages = [
            {"role": "system", "content": self.few_shot_prompt},
            {"role": "system", "content": f"Context: {context}"},
        ]
        if safety.get('risk_level') in ['high', 'critical']:
            messages.append({
                "role": "system",
                "content": "The user may be in distress. Prioritize safety and provide crisis resources."
            })
        messages.append({"role": "user", "content": user_message})

        stream = await self.client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-3.5-turbo"),
            messages=messages,
            temperature=0.85,
            max_tokens=300,
            stream=True
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
