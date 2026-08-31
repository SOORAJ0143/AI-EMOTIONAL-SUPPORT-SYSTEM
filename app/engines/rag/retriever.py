from datetime import datetime, timezone
from typing import List

from app.engines.memory.hopfield import HopfieldAssociativeMemory
from app.models.mongo import knowledge_base, user_memories
from app.services.embedding import get_embedding


class VectorStore:
    async def upsert(self, user_id: str, text: str, embedding: List[float], metadata: dict):
        await user_memories.update_one(
            {"user_id": user_id, "text": text},
            {
                "$set": {
                    "user_id": user_id,
                    "text": text,
                    "embedding": embedding,
                    "metadata": metadata,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )

    async def upsert_knowledge(
        self,
        document_id: str,
        text: str,
        embedding: List[float],
        metadata: dict,
    ):
        await knowledge_base.update_one(
            {"_id": document_id},
            {
                "$set": {
                    "text": text,
                    "embedding": embedding,
                    "metadata": metadata,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )

    async def knowledge_exists(self, document_id: str) -> bool:
        return await knowledge_base.find_one({"_id": document_id}, {"_id": 1}) is not None

    async def search_memories(self, user_id: str, query_embedding: List[float], top_k: int = 5):
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "user_memories_vector",
                    "path": "embedding",
                    "queryVector": query_embedding,
                    "numCandidates": top_k * 20,
                    "limit": top_k,
                    "filter": {"user_id": user_id},
                }
            },
            {"$project": {"_id": 0, "text": 1, "metadata": 1, "score": {"$meta": "vectorSearchScore"}}},
        ]
        results = []
        cursor = await user_memories.aggregate(pipeline)
        async for document in cursor:
            document["source"] = "memory"
            results.append(document)
        return results

    async def search_knowledge(self, query_embedding: List[float], top_k: int = 5):
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "knowledge_vector",
                    "path": "embedding",
                    "queryVector": query_embedding,
                    "numCandidates": top_k * 20,
                    "limit": top_k,
                }
            },
            {"$project": {"_id": 0, "text": 1, "metadata": 1, "score": {"$meta": "vectorSearchScore"}}},
        ]
        results = []
        cursor = await knowledge_base.aggregate(pipeline)
        async for document in cursor:
            document["source"] = "knowledge"
            results.append(document)
        return results


class RAGRetriever:
    def __init__(self, vector_store):
        self.vector_store = vector_store
        self.associative_memory = HopfieldAssociativeMemory(vector_store)

    async def retrieve(self, query: str, user_id: str, top_k: int = 5):
        embedding = await get_embedding(query)
        memories = await self.vector_store.search_memories(user_id, embedding, top_k)
        knowledge = await self.vector_store.search_knowledge(embedding, top_k)
        associative = await self.associative_memory.retrieve_associative(embedding, user_id, top_k=2)
        return {"memories": memories, "knowledge": knowledge, "associative": associative}
