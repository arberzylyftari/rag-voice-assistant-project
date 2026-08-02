"""Resolve a follow-up question into one that stands on its own.

Conversation memory is used to *understand* the question, never to supply its
answer. A follow-up is rewritten here, retrieval then runs on the rewritten
form, and every fact in the answer still comes from passages fetched for the
current turn.

The rewrite is what makes that possible: "Po pas pesë vjetësh?" retrieves
nothing about leave on its own — measured, it lands on the training budget —
so without this step conversation memory could only work by letting earlier
answers leak into later ones.
"""

import logging

import openai
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.openai_client import OpenAINotConfigured, get_client

logger = logging.getLogger(__name__)

# Turns kept from the conversation. Enough for a chain of follow-ups, short
# enough that the rewrite stays cheap and focused on the recent thread.
MAX_HISTORY_TURNS = 6

SYSTEM_PROMPT = """\
Detyra jote është të rishkruash pyetjen e fundit të përdoruesit si një pyetje
të plotë dhe të pavarur në gjuhën shqipe, duke përdorur bisedën e mëparshme.

Rregullat:
- Zëvendëso përemrat dhe referencat e nënkuptuara me atë që i takojnë.
  Shembull: pas pyetjes „Sa ditë pushimi kam?", pyetja „Po pas pesë vjetësh?"
  bëhet „Sa ditë pushimi vjetor kam pas pesë vjetësh punë?"
- Shto vetëm aq sa duhet për ta bërë pyetjen të kuptueshme. MOS bart
  kualifikues nga turnet e mëparshme që pyetja e re nuk i kërkon.
  Shembull: pas „Sa ditë pushimi kam pas pesë vjetësh?", pyetja
  „Dhe sa mund të bart?" bëhet „Sa ditë pushimi mund të bart në vitin
  pasardhës?" — pa „pas pesë vjetësh", sepse tema ndryshoi te bartja.
- Nëse pyetja e fundit është tashmë e plotë, ktheje të pandryshuar.
- Mos iu përgjigj pyetjes. Mos shto informacion që nuk është në bisedë.
- Kthe vetëm pyetjen, në shqip.
"""


class StandaloneQuestion(BaseModel):
    question: str = Field(description="Pyetja e rishkruar, e plotë dhe e pavarur.")


class Turn(BaseModel):
    """One exchange in the conversation."""

    role: str = Field(pattern="^(user|assistant)$")
    content: str


def render_history(history: list[Turn]) -> str:
    labels = {"user": "Përdoruesi", "assistant": "Asistenti"}
    return "\n".join(f"{labels[turn.role]}: {turn.content}" for turn in history)


async def resolve_question(question: str, history: list[Turn]) -> str:
    """Rewrite a follow-up using the conversation, or return it unchanged.

    A failure here is not fatal: the original question is used instead. A
    worse retrieval is better than refusing a question outright because a
    helper call fell over.
    """
    recent = history[-MAX_HISTORY_TURNS:]

    if not recent:
        return question

    settings = get_settings()

    try:
        client = get_client()
    except OpenAINotConfigured:
        logger.warning("Cannot resolve a follow-up without an API key; using it as-is")
        return question

    prompt = f"BISEDA:\n{render_history(recent)}\n\nPYETJA E FUNDIT: {question}"

    try:
        completion = await client.chat.completions.parse(
            model=settings.rewrite_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            response_format=StandaloneQuestion,
            temperature=0.0,
        )
    except openai.OpenAIError:
        logger.exception("Follow-up rewrite failed; using the question as-is")
        return question

    parsed = completion.choices[0].message.parsed

    if parsed is None or not parsed.question.strip():
        logger.warning("Follow-up rewrite returned nothing; using the question as-is")
        return question

    resolved = parsed.question.strip()

    if resolved != question:
        logger.info("Resolved follow-up %r to %r", question[:60], resolved[:60])

    return resolved
