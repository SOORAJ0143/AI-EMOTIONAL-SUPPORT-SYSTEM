import hashlib
import json
import os
from pathlib import Path

from pypdf import PdfReader

from app.services.embedding import get_embedding


class KnowledgeIngestor:
    def __init__(self, vector_store):
        self.vector_store = vector_store

    async def ingest(self, file_path: str, category: str = "therapy"):
        reader = PdfReader(file_path)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        chunks = [chunk.strip() for chunk in text.split("\n\n") if len(chunk.strip()) > 50]

        for position, chunk in enumerate(chunks):
            embedding = await get_embedding(chunk)
            await self.vector_store.upsert_knowledge(
                document_id=f"{os.path.basename(file_path)}_{position}",
                text=chunk,
                embedding=embedding,
                metadata={"category": category, "source": os.path.basename(file_path)},
            )

        print(f"Processed {file_path}: {len(chunks)} chunks")
        return len(chunks)

    async def ingest_json_examples(
        self,
        file_path: str | Path,
        category: str = "therapy_examples",
        limit: int | None = None,
    ) -> int:
        """Store dataset question/answer pairs as searchable reference material.

        Document IDs are content-based, so re-running the job updates existing
        records instead of creating duplicates.
        """
        path = Path(file_path)
        with path.open("r", encoding="utf-8") as file:
            records = json.load(file)
        if not isinstance(records, list):
            raise ValueError("The JSON knowledge file must contain a list of records.")

        processed = 0
        seen_questions = set()
        for record in records:
            if limit is not None and processed >= limit:
                break
            if not isinstance(record, dict):
                continue

            question = str(record.get("user") or record.get("User Query") or "").strip()
            answer = str(record.get("assistant") or record.get("Chatbot Response") or "").strip()
            question_key = " ".join(question.lower().split())
            if not question or not answer or question_key in seen_questions:
                continue
            seen_questions.add(question_key)

            text = f"User situation:\n{question}\n\nSupportive response example:\n{answer}"
            # Keep a single embedding request within a practical size limit.
            text = text[:24000]
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            document_id = f"json_{digest}"
            if await self.vector_store.knowledge_exists(document_id):
                processed += 1
                continue
            await self.vector_store.upsert_knowledge(
                document_id=document_id,
                text=text,
                embedding=await get_embedding(text),
                metadata={"category": category, "source": path.name, "format": "question_answer"},
            )
            processed += 1

        print(f"Processed {path}: {processed} unique question/answer examples")
        return processed
