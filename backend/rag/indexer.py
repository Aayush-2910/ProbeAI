"""Builds the documents that go into the vector store.

Two corpora, kept in separate collections because they answer different
questions: "what does the curriculum say about X" and "what could I ask about
X for this kind of candidate".

Every document is *contextualised* before embedding. A bare objective like
"Finalize the production-ready system prompt" is seven words with no subject —
its vector is close to almost nothing useful. Prefixing the day, module and
tools gives the embedding enough signal to actually retrieve well, at the cost
of a few extra tokens per document. With a corpus this small that cost is
irrelevant and the quality difference is not.

Document counts, from the supplied data:
    curriculum  31 day summaries + 155 objectives + 31 tool docs = 217
    questions   192 (24 per module)
"""

import json
from pathlib import Path
from typing import Any, Dict, List

from config import DATA_DIR
from core.curriculum import Curriculum, curriculum as default_curriculum
from logging_config import get_logger

logger = get_logger("rag.indexer")

QUESTION_BANK_PATH = DATA_DIR / "question_bank.json"

# Chroma metadata values must be scalars, so lists are joined before storage.
KIND_DAY_SUMMARY = "day_summary"
KIND_OBJECTIVE = "objective"
KIND_TOOLS = "tools"


def _doc(doc_id: str, text: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": doc_id, "text": text.strip(), "metadata": metadata}


def curriculum_documents(curric: Curriculum = default_curriculum) -> List[Dict[str, Any]]:
    """Three document types per curriculum day."""
    docs: List[Dict[str, Any]] = []

    for day in curric.all_days():
        title = curric.get_title(day)
        module = curric.get_module(day)
        module_id = curric.get_module_id(day) or 0
        day_type = curric.get_type(day)
        objectives = curric.get_objectives(day)
        tools = curric.get_tools(day)

        header = f"Day {day} — {title} ({module})"
        base_meta = {
            "day": day,
            "module": module,
            "module_id": module_id,
            "title": title,
            "type": day_type,
        }

        # 1. Whole-day summary: the broadest match for a topic query.
        summary = (
            f"{header}\n"
            f"Type: {day_type}\n"
            f"Tools: {', '.join(tools) if tools else 'none listed'}\n"
            f"Learning objectives: {' '.join(objectives)}"
        )
        docs.append(_doc(f"day-{day}-summary", summary, {**base_meta, "kind": KIND_DAY_SUMMARY}))

        # 2. One document per objective, each carrying its day's context.
        for index, objective in enumerate(objectives):
            text = (
                f"{header}\n"
                f"Learning objective: {objective}\n"
                f"Tools for this day: {', '.join(tools) if tools else 'none listed'}"
            )
            docs.append(
                _doc(
                    f"day-{day}-obj-{index}",
                    text,
                    {**base_meta, "kind": KIND_OBJECTIVE, "objective_index": index,
                     "objective": objective},
                )
            )

        # 3. Tool document: lets a query naming a tool ("ChromaDB", "LoRA")
        #    find the day even when the objectives never spell the tool out.
        if tools:
            text = f"{header}\nTools and technologies used: {', '.join(tools)}"
            docs.append(
                _doc(
                    f"day-{day}-tools",
                    text,
                    {**base_meta, "kind": KIND_TOOLS, "tools": ", ".join(tools)},
                )
            )

    return docs


def load_question_bank(path: Path = QUESTION_BANK_PATH) -> List[Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("questions", [])
    except FileNotFoundError:
        logger.error(
            "question bank missing",
            extra={"event": "rag.question_bank_missing", "path": str(path)},
        )
        return []
    except json.JSONDecodeError as exc:
        logger.error(
            "question bank is not valid JSON",
            extra={"event": "rag.question_bank_invalid", "error": str(exc)},
        )
        return []


def question_documents(
    curric: Curriculum = default_curriculum,
    path: Path = QUESTION_BANK_PATH,
) -> List[Dict[str, Any]]:
    """One document per authored question.

    The embedded text includes `looks_for` because that field carries the
    topical vocabulary — "cosine similarity", "catastrophic forgetting",
    "reciprocal rank fusion" — that a topic query is most likely to match on.
    The question wording alone is often deliberately plain.
    """
    docs: List[Dict[str, Any]] = []

    for question in load_question_bank(path):
        day = int(question["day"])
        day_title = curric.get_title(day)
        module_title = curric.get_module(day)

        text = (
            f"Module {question['module']} — {module_title} | Day {day} — {day_title}\n"
            f"Difficulty: {question['difficulty']}\n"
            f"Question: {question['question']}\n"
            f"A strong answer covers: {question['looks_for']}"
        )

        docs.append(
            _doc(
                question["id"],
                text,
                {
                    "qid": question["id"],
                    "module": int(question["module"]),
                    "module_title": module_title,
                    "day": day,
                    "day_title": day_title,
                    "difficulty": question["difficulty"],
                    "assumes": question["assumes"],
                    "question": question["question"],
                    "followup": question["followup"],
                    "looks_for": question["looks_for"],
                },
            )
        )

    return docs


def build_all(curric: Curriculum = default_curriculum) -> Dict[str, List[Dict[str, Any]]]:
    curriculum_docs = curriculum_documents(curric)
    question_docs = question_documents(curric)

    logger.info(
        "indexer built documents",
        extra={
            "event": "rag.documents_built",
            "curriculum_docs": len(curriculum_docs),
            "question_docs": len(question_docs),
        },
    )
    return {"curriculum": curriculum_docs, "questions": question_docs}
