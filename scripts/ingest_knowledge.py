# scripts/ingest_knowledge.py
import os
import sys
import asyncio
import argparse
from pathlib import Path

# Running this file directly sets sys.path to ``scripts/``.  Add the
# repository root so the top-level ``app`` package can be imported.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from app.engines.rag.retriever import VectorStore
from app.models.mongo import close_mongodb_connection, connect_to_mongodb
from app.services.embedding import close_embedding_client
from app.engines.knowledge.ingestor import KnowledgeIngestor  # create simple ingestor

def parse_args():
    parser = argparse.ArgumentParser(description="Ingest PDFs and optional JSON examples into MongoDB vector search.")
    parser.add_argument("--include-json", action="store_true", help="Also ingest data/my_data.json as searchable examples.")
    parser.add_argument("--json-limit", type=int, default=None, help="Maximum number of unique JSON questions to ingest.")
    parser.add_argument("--skip-pdfs", action="store_true", help="Skip PDFs in knowledge_base.")
    parser.add_argument("--dry-run", action="store_true", help="Validate which inputs would be ingested without calling external services.")
    return parser.parse_args()


async def main(args):
    pdfs = sorted((PROJECT_ROOT / "knowledge_base").glob("*.pdf")) if not args.skip_pdfs else []
    json_path = PROJECT_ROOT / "data" / "my_data.json"
    if args.include_json and not json_path.is_file():
        raise FileNotFoundError(f"JSON knowledge file not found: {json_path}")
    if args.dry_run:
        print(f"PDFs ready for ingestion: {len(pdfs)}")
        if args.include_json:
            print(f"JSON examples ready for ingestion: {json_path}")
        return

    vs = VectorStore()
    ingestor = KnowledgeIngestor(vs)
    try:
        await connect_to_mongodb()
        pdf_count = 0
        for file in pdfs:
            pdf_count += await ingestor.ingest(str(file), category="therapy")
        json_count = 0
        if args.include_json:
            json_count = await ingestor.ingest_json_examples(json_path, limit=args.json_limit)
        print(f"Ingestion complete: {pdf_count} PDF chunks, {json_count} JSON examples.")
    finally:
        await close_embedding_client()
        await close_mongodb_connection()

if __name__ == "__main__":
    asyncio.run(main(parse_args()))
