class Reranker:
    def rank(self, query: str, documents: list) -> list:
        for document in documents:
            document["relevance"] = document.get("score", 0)
        return sorted(documents, key=lambda document: document["relevance"], reverse=True)


class ContextMerger:
    def __init__(self, max_tokens: int = 3000):
        self.max_tokens = max_tokens

    def merge(self, query: str, documents: list, associative: list) -> str:
        context_parts = []
        tokens_used = 0
        for item in documents:
            text = item["text"]
            tokens = len(text.split())
            if tokens_used + tokens >= self.max_tokens:
                continue
            label = "Memory" if item.get("source") == "memory" else "Knowledge"
            context_parts.append(f"[{label}] {text}")
            tokens_used += tokens

        for metadata, _score in associative:
            text = metadata.get("text", "")
            tokens = len(text.split())
            if text and tokens_used + tokens < self.max_tokens:
                context_parts.append(f"[Associative] {text}")
                tokens_used += tokens

        return "\n\n".join(context_parts)
