"""ChromaDB vector store with a keyword fallback.

Two collections, built in-process at startup from the JSON data files:

    curriculum_objectives   217 docs — what the cohort actually taught
    question_bank           192 docs — what we can ask about it

Embeddings use Chroma's built-in function, which is all-MiniLM-L6-v2 running
on onnxruntime (~80MB). The `sentence-transformers` package ships the same
model but pulls in PyTorch (~2.5GB), which will not fit a small container.

If chromadb is unavailable or the index fails to build, the store degrades to
`_KeywordIndex` — same interface, same filters, scored by term overlap instead
of embeddings. Retrieval gets worse; the interview still runs. That matters
because a vector store failing at startup should never be the reason a
candidate cannot be interviewed.
"""

from typing import Any, Dict, Iterable, List, Optional, Sequence

from config import RAG_COLLECTION, RAG_ENABLED, RAG_TOP_K
from logging_config import get_logger
from rag import indexer

logger = get_logger("rag.store")

QUESTION_COLLECTION = "question_bank"

# Words too common in this corpus to carry meaning in the fallback scorer.
_STOPWORDS = frozenset(
    "a an the and or but if then than that this these those of in on to for with "
    "from by at as is are was were be been being do does did how what why when "
    "where which who your you it its their there here we they i".split()
)


def _tokenize(text: str) -> List[str]:
    cleaned = "".join(char.lower() if char.isalnum() else " " for char in text)
    return [token for token in cleaned.split() if token not in _STOPWORDS and len(token) > 2]


def _as_list(value: Any) -> Optional[List[Any]]:
    if value is None:
        return None
    if isinstance(value, (list, tuple, set)):
        items = [v for v in value if v is not None]
        return items or None
    return [value]


def _build_where(
    day: Any = None,
    difficulty: Any = None,
    assumes: Any = None,
    module: Any = None,
    kind: Any = None,
    exclude_qids: Optional[Sequence[str]] = None,
) -> Optional[Dict[str, Any]]:
    """Assemble a Chroma metadata filter.

    Chroma requires an explicit `$and` once there is more than one condition;
    a flat dict with two keys is rejected rather than treated as a conjunction.
    """
    clauses: List[Dict[str, Any]] = []

    for field, value in (
        ("day", day),
        ("difficulty", difficulty),
        ("assumes", assumes),
        ("module", module),
        ("kind", kind),
    ):
        values = _as_list(value)
        if values:
            clauses.append({field: {"$in": values}})

    if exclude_qids:
        clauses.append({"qid": {"$nin": list(exclude_qids)}})

    if not clauses:
        return None
    return clauses[0] if len(clauses) == 1 else {"$and": clauses}


def _matches(metadata: Dict[str, Any], where: Optional[Dict[str, Any]]) -> bool:
    """Evaluate the same filter shape against a plain dict, for the fallback."""
    if not where:
        return True

    clauses = where.get("$and", [where])
    for clause in clauses:
        for field, condition in clause.items():
            value = metadata.get(field)
            if "$in" in condition and value not in condition["$in"]:
                return False
            if "$nin" in condition and value in condition["$nin"]:
                return False
    return True


class _KeywordIndex:
    """Deterministic fallback: term-overlap scoring over the same documents."""

    def __init__(self, documents: List[Dict[str, Any]]):
        self.documents = documents
        self._tokens = {doc["id"]: set(_tokenize(doc["text"])) for doc in documents}

    def query(
        self, text: str, top_k: int, where: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        query_tokens = set(_tokenize(text))
        if not query_tokens:
            return []

        scored = []
        for doc in self.documents:
            if not _matches(doc["metadata"], where):
                continue
            overlap = query_tokens & self._tokens[doc["id"]]
            if not overlap:
                continue
            scored.append({**doc, "score": len(overlap) / len(query_tokens)})

        scored.sort(key=lambda d: d["score"], reverse=True)
        return scored[:top_k]


class VectorStore:
    """Owns both collections and hides which backend actually answered."""

    def __init__(self) -> None:
        self.backend = "uninitialised"
        self.ready = False
        self._client = None
        self._collections: Dict[str, Any] = {}
        self._fallback: Dict[str, _KeywordIndex] = {}
        self._counts: Dict[str, int] = {}

    # --- build ---------------------------------------------------------------

    def build(self) -> None:
        """Index both corpora. Called once, at application startup."""
        corpora = indexer.build_all()
        self._counts = {name: len(docs) for name, docs in corpora.items()}

        # The fallback is always built: it is cheap (a dict of token sets) and
        # it means a Chroma query failing mid-interview has somewhere to land.
        self._fallback = {
            "curriculum": _KeywordIndex(corpora["curriculum"]),
            "questions": _KeywordIndex(corpora["questions"]),
        }

        if not RAG_ENABLED:
            self.backend = "keyword (RAG_ENABLED=false)"
            self.ready = True
            logger.warning("vector store disabled by config", extra={"event": "rag.disabled"})
            return

        try:
            self._build_chroma(corpora)
            self.backend = "chromadb"
            self.ready = True
        except Exception as exc:  # noqa: BLE001 — any failure must degrade, not crash
            self.backend = "keyword (chroma unavailable)"
            self.ready = True
            # exc_info matters here: degrading silently is exactly how a broken
            # vector store survives to production disguised as a working one.
            logger.error(
                "chroma index failed; falling back to keyword retrieval",
                extra={
                    "event": "rag.chroma_failed",
                    "error": str(exc),
                    "error_type": type(exc).__name__,
                },
                exc_info=True,
            )

    def _build_chroma(self, corpora: Dict[str, List[Dict[str, Any]]]) -> None:
        import chromadb
        from chromadb.utils import embedding_functions

        embedding_function = embedding_functions.DefaultEmbeddingFunction()
        self._client = chromadb.EphemeralClient()

        for name, collection_name in (
            ("curriculum", RAG_COLLECTION),
            ("questions", QUESTION_COLLECTION),
        ):
            documents = corpora[name]
            collection = self._client.get_or_create_collection(
                name=collection_name,
                embedding_function=embedding_function,
                metadata={"hnsw:space": "cosine"},
            )
            collection.add(
                ids=[doc["id"] for doc in documents],
                documents=[doc["text"] for doc in documents],
                metadatas=[doc["metadata"] for doc in documents],
            )
            self._collections[name] = collection

            logger.info(
                "collection indexed",
                extra={
                    "event": "rag.collection_indexed",
                    "collection": collection_name,
                    "documents": len(documents),
                },
            )

    # --- query ---------------------------------------------------------------

    def _query(
        self,
        corpus: str,
        text: str,
        top_k: int,
        where: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        collection = self._collections.get(corpus)
        if collection is not None:
            try:
                result = collection.query(
                    query_texts=[text], n_results=top_k, where=where
                )
                return self._normalise(result)
            except Exception as exc:  # noqa: BLE001 — fall through to keyword
                logger.warning(
                    "chroma query failed; using keyword fallback",
                    extra={"event": "rag.query_failed", "corpus": corpus, "error": str(exc)},
                )

        index = self._fallback.get(corpus)
        return index.query(text, top_k, where) if index else []

    @staticmethod
    def _normalise(result: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Flatten Chroma's list-of-lists response into plain dicts."""
        ids = (result.get("ids") or [[]])[0]
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]

        out: List[Dict[str, Any]] = []
        for index, doc_id in enumerate(ids):
            distance = distances[index] if index < len(distances) else None
            out.append(
                {
                    "id": doc_id,
                    "text": documents[index] if index < len(documents) else "",
                    "metadata": metadatas[index] if index < len(metadatas) else {},
                    # Cosine distance -> similarity, so higher is always better
                    # regardless of which backend answered.
                    "score": (1.0 - distance) if distance is not None else None,
                }
            )
        return out

    @staticmethod
    def _above(results: List[Dict[str, Any]], min_score: Optional[float]) -> List[Dict[str, Any]]:
        """Drop weak matches.

        Both backends return top_k regardless of how poor the match is, so a
        broad filter will happily surface something scoring 0.005. Note the two
        scales are not identical — cosine similarity for Chroma, term-overlap
        ratio for the fallback — so this is a sanity floor, not a calibrated
        threshold. Callers that would rather have a bad match than none at all
        simply leave min_score unset.
        """
        if min_score is None:
            return results
        return [r for r in results if r.get("score") is None or r["score"] >= min_score]

    def query_curriculum(
        self,
        text: str,
        top_k: int = RAG_TOP_K,
        days: Optional[Iterable[int]] = None,
        kinds: Optional[Iterable[str]] = None,
        min_score: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve curriculum context for a topic."""
        where = _build_where(day=_as_list(days), kind=_as_list(kinds))
        return self._above(self._query("curriculum", text, top_k, where), min_score)

    def query_questions(
        self,
        text: str,
        top_k: int = RAG_TOP_K,
        difficulty: Any = None,
        assumes: Any = None,
        days: Optional[Iterable[int]] = None,
        modules: Optional[Iterable[int]] = None,
        exclude_qids: Optional[Sequence[str]] = None,
        min_score: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve candidate-appropriate questions.

        `difficulty` comes from the candidate's profile and `assumes` from how
        they performed on that specific day, so the same topic yields a very
        different question for someone who shipped it versus someone who
        skipped it.
        """
        where = _build_where(
            day=_as_list(days),
            difficulty=_as_list(difficulty),
            assumes=_as_list(assumes),
            module=_as_list(modules),
            exclude_qids=exclude_qids,
        )
        return self._above(self._query("questions", text, top_k, where), min_score)

    # --- introspection -------------------------------------------------------

    def stats(self) -> Dict[str, Any]:
        return {
            "backend": self.backend,
            "ready": self.ready,
            "curriculum_documents": self._counts.get("curriculum", 0),
            "question_documents": self._counts.get("questions", 0),
        }


vector_store = VectorStore()
