# app/services/embedding.py
import openai
from app.config import settings

client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


async def get_embedding(text: str) -> list:
    response = await client.embeddings.create(
        model=settings.OPENAI_EMBEDDING_MODEL,
        input=text
    )
    return response.data[0].embedding


async def close_embedding_client() -> None:
    """Close HTTP connections before the asyncio event loop shuts down."""
    await client.close()
