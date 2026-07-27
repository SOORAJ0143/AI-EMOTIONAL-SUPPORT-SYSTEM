# scripts/ingest_knowledge.py
import os
import sys
import asyncio
from pathlib import Path

# Running this file directly sets sys.path to ``scripts/``.  Add the
# repository root so the top-level ``app`` package can be imported.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from app.engines.rag.retriever import VectorStore
from app.models.mongo import close_mongodb_connection
from app.services.embedding import close_embedding_client
from app.engines.knowledge.ingestor import KnowledgeIngestor  # create simple ingestor

async def main():
    vs = VectorStore()
    ingestor = KnowledgeIngestor(vs)
    try:
        # Ingest all PDFs from knowledge_base folder
        for file in os.listdir("./knowledge_base"):
            if file.endswith(".pdf"):
                await ingestor.ingest(f"./knowledge_base/{file}", category="therapy")
        print("Ingestion complete")
    finally:
        await close_embedding_client()
        await close_mongodb_connection()

if __name__ == "__main__":
    asyncio.run(main())
