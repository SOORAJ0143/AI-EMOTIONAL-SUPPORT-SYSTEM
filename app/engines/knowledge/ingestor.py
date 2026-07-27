import os

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
