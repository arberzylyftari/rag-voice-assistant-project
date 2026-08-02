"""Generate an answer grounded in retrieved passages.

Layers two and three of the guardrail sit here. The prompt constrains what the
model may say; the structured response is then checked against the passages
that were actually supplied, so a claim of grounding is verified rather than
trusted.
"""

import logging

import openai
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.openai_client import OpenAINotConfigured, get_client
from app.services.vector_store import SearchHit

logger = logging.getLogger(__name__)

MESSAGES = {
    "not_configured": "Sherbimi nuk eshte i konfiguruar. Kontakto administratorin.",
    "overloaded": "Sherbimi eshte i mbingarkuar per momentin. Provo serish pas pak.",
    "unreachable": "Nuk u arrit lidhja me sherbimin. Kontrollo internetin dhe provo serish.",
    "failed": "Gjenerimi i pergjigjes deshtoi. Provo serish.",
}

# Shown when nothing was retrieved, when the model reports it cannot answer,
# and when its citations do not hold up. One message for all three: from the
# user's side they are the same outcome.
REFUSAL = (
    "Nuk e gjej kete informacion ne dokumentet e kompanise. "
    "Provo ta riformulosh pyetjen ose pyet per dicka tjeter."
)

SYSTEM_PROMPT = """\
Je një asistent i brendshëm i kompanisë Nexora sh.p.k. Përgjigjesh vetëm në
gjuhën shqipe.

Rregulli themelor: përgjigju VETËM duke u bazuar në pasazhet e dhëna më poshtë.
Nuk lejohet të shtosh njohuri të përgjithshme, të hamendësosh, ose të plotësosh
boshllëqe me atë që të duket e arsyeshme.

Si të veprosh:

1. Lexo pasazhet. Nëse ato e përgjigjin pyetjen, vendos `can_answer` = true dhe
   shkruaj përgjigjen.
2. Nëse pasazhet NUK e përgjigjen pyetjen — edhe nëse flasin për tema të
   afërta — vendos `can_answer` = false dhe lëre `answer` bosh. Mos u përpiq
   ta afrosh përgjigjen me hamendje.
3. Nëse pyetja niset nga një premisë e gabuar — cilëson një shifër, afat ose
   rregull që nuk përputhet me pasazhet — kjo NUK është arsye për të refuzuar.
   Vendos `can_answer` = true, korrigjo premisën në fjalinë e parë me të
   dhënën e saktë, dhe pastaj përgjigju pyetjes.

   Shembull: nëse pyetja thotë „Nga 40 ditët e lejes, sa mund të bart?" dhe
   pasazhet thonë se leja është 25 ditë, përgjigju: „Leja vjetore është 25
   ditë, jo 40. Prej tyre mund të barten 5 ditë."

   Refuzo vetëm nëse pasazhet nuk e përmbajnë as të dhënën e saktë.
4. Në `citations` vendos numrat e pasazheve që përdore — vetëm numrat, p.sh.
   [1, 3]. Mos shto pasazhe që nuk i përdore.

Stili: përgjigje e shkurtër dhe e drejtpërdrejtë, 1–4 fjali. Përfshi shifra
konkrete (ditë, afate, shuma) kur dokumentet i japin. Mos e përsërit pyetjen.
Mos shto hyrje si "Sipas dokumenteve".
"""


class GroundedAnswer(BaseModel):
    """The shape the model must return."""

    can_answer: bool = Field(
        description="True vetëm nëse pasazhet e dhëna e përgjigjin pyetjen."
    )
    answer: str = Field(description="Përgjigjja në shqip. Bosh nëse can_answer është false.")
    citations: list[int] = Field(
        default_factory=list,
        description="Numrat e pasazheve të përdorura, p.sh. [1, 3].",
    )


class AnswerResult(BaseModel):
    """What the caller gets back."""

    answer: str
    answered: bool
    citations: list[str] = Field(default_factory=list)
    model: str


class GenerationError(Exception):
    """A provider failure with a message the user can act on."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def build_context(hits: list[SearchHit]) -> str:
    """Render passages for the prompt, numbered so they can be cited by index.

    Citing by number rather than by heading was a deliberate change: asked to
    copy a heading verbatim, the model reproduced it with the surrounding
    brackets included, and an exact-match check threw away a correct answer.
    An index is unambiguous, and every formatting variant of it still parses.
    """
    return "\n\n".join(
        f"[{position}] {hit.heading}\n{hit.text}" for position, hit in enumerate(hits, start=1)
    )


def verify_citations(cited: list[int], hits: list[SearchHit]) -> list[str]:
    """Resolve cited passage numbers to headings, dropping any out of range.

    An index outside the supplied set is a source the user could not check,
    which is what makes this a verification rather than a formatting step.
    """
    verified = [hits[index - 1].heading for index in cited if 1 <= index <= len(hits)]

    if len(verified) != len(cited):
        logger.warning(
            "Discarded %d citation(s) pointing outside the supplied passages",
            len(cited) - len(verified),
        )

    # The same passage cited twice should appear once.
    seen: list[str] = []
    for heading in verified:
        if heading not in seen:
            seen.append(heading)

    return seen


async def generate_answer(question: str, hits: list[SearchHit]) -> AnswerResult:
    """Answer a question from the supplied passages, or refuse."""
    settings = get_settings()

    if not hits:
        return AnswerResult(
            answer=REFUSAL, answered=False, citations=[], model=settings.answer_model
        )

    try:
        client = get_client()
    except OpenAINotConfigured:
        raise GenerationError(MESSAGES["not_configured"]) from None

    user_prompt = f"PASAZHET:\n\n{build_context(hits)}\n\nPYETJA: {question}"

    try:
        completion = await client.chat.completions.parse(
            model=settings.answer_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format=GroundedAnswer,
            temperature=settings.answer_temperature,
        )
    except openai.AuthenticationError:
        logger.exception("Generation rejected the API key")
        raise GenerationError(MESSAGES["not_configured"]) from None
    except openai.RateLimitError:
        logger.warning("Generation rate limited")
        raise GenerationError(MESSAGES["overloaded"]) from None
    except (openai.APIConnectionError, openai.APITimeoutError):
        logger.exception("Could not reach the generation API")
        raise GenerationError(MESSAGES["unreachable"]) from None
    except openai.APIStatusError:
        logger.exception("Generation returned an error status")
        raise GenerationError(MESSAGES["failed"]) from None

    parsed = completion.choices[0].message.parsed

    if parsed is None:
        # A refusal or a truncated response leaves nothing to validate.
        logger.warning("Generation returned no parsed answer")
        raise GenerationError(MESSAGES["failed"])

    if not parsed.can_answer or not parsed.answer.strip():
        return AnswerResult(
            answer=REFUSAL, answered=False, citations=[], model=settings.answer_model
        )

    citations = verify_citations(parsed.citations, hits)

    if not citations:
        # It claimed an answer but named no passage that was actually given.
        # Treated as unsupported: an answer nobody can trace back is exactly
        # what this project is meant not to produce.
        logger.warning("Discarding an answer with no verifiable citation")
        return AnswerResult(
            answer=REFUSAL, answered=False, citations=[], model=settings.answer_model
        )

    return AnswerResult(
        answer=parsed.answer.strip(),
        answered=True,
        citations=citations,
        model=settings.answer_model,
    )
