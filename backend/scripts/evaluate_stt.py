#!/usr/bin/env python
"""Measure speech-to-text accuracy on real human Albanian speech.

    python scripts/evaluate_stt.py                  # 100 clips, both configurations
    python scripts/evaluate_stt.py --limit 475      # the whole test split
    python scripts/evaluate_stt.py --config prompt  # skip the ablation

Every accuracy figure this project recorded before this script existed came
from synthetic fixtures produced by a text-to-speech model that does not
officially support Albanian — so an unknown part of the error was the
fixture's pronunciation rather than the transcriber. This measures against
recordings of people actually speaking.

The corpus is the Albanian test split of Mozilla Common Voice 17.0: read
speech from volunteer contributors, with the sentence each of them was asked
to read as the reference. It is CC-0. The clips are downloaded on first run
and cached; they are not committed.

Cost: one transcription API call per clip per configuration.
"""

import argparse
import asyncio
import csv
import json
import random
import sys
import tarfile
import unicodedata
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import difflib  # noqa: E402

import openai  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.services.openai_client import OpenAINotConfigured, get_client  # noqa: E402
from app.services.transcription import is_prompt_echo  # noqa: E402

REPO = "https://huggingface.co/datasets/fsicoli/common_voice_17_0/resolve/main"
TRANSCRIPT_URL = f"{REPO}/transcript/sq/test.tsv"
AUDIO_URL = f"{REPO}/audio/sq/test/sq_test_0.tar"

CACHE_DIR = BACKEND_DIR / "data" / "stt-eval"

# Clips are mp3; the transcription API infers the container from the filename.
CONTENT_TYPE = "audio/mpeg"

# Concurrent transcription requests. High enough to keep the run short,
# low enough not to trip rate limits on a personal key.
CONCURRENCY = 8


@dataclass
class Clip:
    path: Path
    reference: str


@dataclass
class Result:
    reference: str
    hypothesis: str
    similarity: float
    word_errors: int
    reference_words: int
    char_errors: int
    reference_chars: int


def download(url: str, destination: Path) -> Path:
    """Fetch a file once and keep it."""
    if destination.exists():
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {url.rsplit('/', 1)[-1]} …", flush=True)

    with urllib.request.urlopen(url) as response:  # noqa: S310 - fixed https URL
        destination.write_bytes(response.read())

    return destination


def load_clips(limit: int, seed: int) -> list[Clip]:
    """Download the split if needed and take a reproducible sample of it."""
    transcript = download(TRANSCRIPT_URL, CACHE_DIR / "test.tsv")
    archive = download(AUDIO_URL, CACHE_DIR / "sq_test_0.tar")

    audio_dir = CACHE_DIR / "audio"
    if not audio_dir.exists():
        audio_dir.mkdir(parents=True)
        with tarfile.open(archive) as tar:
            tar.extractall(audio_dir, filter="data")

    # The audio ships in nested directories; index by filename.
    by_name = {path.name: path for path in audio_dir.rglob("*.mp3")}

    with transcript.open(encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))

    clips = [
        Clip(path=by_name[row["path"]], reference=row["sentence"].strip())
        for row in rows
        if row.get("path") in by_name and row.get("sentence", "").strip()
    ]

    # Sampled rather than taken from the front, so the selection is not one
    # speaker or one recording session. Seeded, so a rerun is comparable.
    random.Random(seed).shuffle(clips)
    return clips[:limit]


def normalise(text: str) -> str:
    """Lowercase and strip punctuation, keeping Albanian letters intact.

    `ë` and `ç` are letters, not decoration — stripping them would flatter the
    score by forgiving a real error. Unicode is normalised so a composed `ë`
    and a decomposed one compare equal.
    """
    text = unicodedata.normalize("NFC", text.lower())
    kept = [character for character in text if character.isalnum() or character.isspace()]
    return " ".join("".join(kept).split())


def edit_distance(reference: list[str] | str, hypothesis: list[str] | str) -> int:
    """Levenshtein distance, over words or characters."""
    previous = list(range(len(hypothesis) + 1))

    for i, reference_token in enumerate(reference, start=1):
        current = [i]
        for j, hypothesis_token in enumerate(hypothesis, start=1):
            current.append(
                previous[j - 1]
                if reference_token == hypothesis_token
                else 1 + min(previous[j - 1], previous[j], current[j - 1])
            )
        previous = current

    return previous[-1]


def score(reference: str, hypothesis: str) -> Result:
    clean_reference = normalise(reference)
    clean_hypothesis = normalise(hypothesis)

    reference_words = clean_reference.split()
    hypothesis_words = clean_hypothesis.split()

    return Result(
        reference=reference,
        hypothesis=hypothesis,
        # Kept because it is the metric the project's earlier synthetic
        # figures were reported in, so the two are broadly comparable.
        similarity=difflib.SequenceMatcher(None, clean_reference, clean_hypothesis).ratio(),
        word_errors=edit_distance(reference_words, hypothesis_words),
        reference_words=len(reference_words),
        char_errors=edit_distance(clean_reference, clean_hypothesis),
        reference_chars=len(clean_reference),
    )


async def transcribe_one(client: openai.AsyncOpenAI, clip: Clip, prompt: str | None) -> str:
    """One transcription call, with or without the Albanian steering prompt."""
    settings = get_settings()
    arguments = {
        "model": settings.stt_model,
        "file": (clip.path.name, clip.path.read_bytes()),
    }
    if prompt:
        arguments["prompt"] = prompt

    result = await client.audio.transcriptions.create(**arguments)
    return (result.text or "").strip()


async def run_configuration(
    clips: list[Clip], prompt: str | None, label: str
) -> tuple[list[Result], int]:
    """Transcribe every clip and score it. Returns results and failure count."""
    client = get_client()
    semaphore = asyncio.Semaphore(CONCURRENCY)
    results: list[Result] = []
    failures = 0
    done = 0

    async def one(clip: Clip) -> None:
        nonlocal failures, done
        async with semaphore:
            try:
                hypothesis = await transcribe_one(client, clip, prompt)
            except Exception as error:  # noqa: BLE001 - a failed clip is data, not a crash
                failures += 1
                print(f"    ! {clip.path.name}: {type(error).__name__}", flush=True)
                return
            results.append(score(clip.reference, hypothesis))
        done += 1
        if done % 25 == 0:
            print(f"    {done}/{len(clips)}", flush=True)

    print(f"  {label} …", flush=True)
    await asyncio.gather(*(one(clip) for clip in clips))
    return results, failures


def echo_statistics(results: list[Result]) -> tuple[int, int]:
    """How many transcripts the prompt-echo filter would reject, and how many
    it would let through despite the reference being nothing like them.

    The steering prompt does not only help. On a clip the model cannot make
    out, it falls back on the prompt's vocabulary and invents a fluent,
    in-domain question. `is_prompt_echo` catches the ones that quote the
    prompt; a *new* invented question is a valid-looking query that would sail
    through retrieval and get answered. Counting both is the point.
    """
    settings = get_settings()
    rejected = 0
    missed = 0

    for result in results:
        if is_prompt_echo(result.hypothesis, settings.stt_prompt):
            rejected += 1
        elif result.similarity < 0.4:
            # Bears almost no relation to what was said, yet reads as speech.
            missed += 1

    return rejected, missed


def summarise(results: list[Result]) -> dict[str, float]:
    """Corpus-level rates, plus the mean similarity for comparability.

    WER and CER are pooled over the whole corpus rather than averaged per
    clip: a one-word error in a four-word sentence should not weigh the same
    as one in a twenty-word sentence.
    """
    if not results:
        return {}

    return {
        "wer": sum(r.word_errors for r in results) / max(sum(r.reference_words for r in results), 1),
        "cer": sum(r.char_errors for r in results) / max(sum(r.reference_chars for r in results), 1),
        "similarity": sum(r.similarity for r in results) / len(results),
        "exact": sum(1 for r in results if normalise(r.reference) == normalise(r.hypothesis))
        / len(results),
    }


def report(name: str, results: list[Result], failures: int) -> None:
    stats = summarise(results)
    if not stats:
        print(f"\n{name}: no results")
        return

    rejected, missed = echo_statistics(results)

    print(f"\n{name}  ({len(results)} clips, {failures} failed)")
    print(f"  WER                {stats['wer']:.3f}")
    print(f"  CER                {stats['cer']:.3f}")
    print(f"  mean similarity    {stats['similarity']:.3f}")
    print(f"  exact matches      {stats['exact']:.1%}")
    print(f"  caught by the echo filter   {rejected} ({rejected / len(results):.1%})")
    print(f"  unrecognisable but fluent   {missed} ({missed / len(results):.1%})")

    worst = sorted(results, key=lambda r: r.similarity)[:3]
    print("  worst clips:")
    for item in worst:
        print(f"    {item.similarity:.2f}  ref: {item.reference[:70]}")
        print(f"          hyp: {item.hypothesis[:70]}")


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100, help="clips to evaluate")
    parser.add_argument("--seed", type=int, default=17, help="sampling seed")
    parser.add_argument("--save", type=Path, default=None, help="write per-clip results as JSON")
    parser.add_argument(
        "--config",
        choices=("both", "prompt", "no-prompt"),
        default="both",
        help="which configurations to run",
    )
    arguments = parser.parse_args()

    try:
        get_client()
    except OpenAINotConfigured:
        print("OPENAI_API_KEY is not set.", file=sys.stderr)
        return 1

    settings = get_settings()
    print(f"Model: {settings.stt_model}")

    clips = load_clips(arguments.limit, arguments.seed)
    if not clips:
        print("No clips found.", file=sys.stderr)
        return 1
    print(f"Clips: {len(clips)} from the Common Voice 17.0 Albanian test split\n")

    if arguments.config in ("both", "prompt"):
        results, failures = await run_configuration(
            clips, settings.stt_prompt, "with the Albanian prompt"
        )
        report("With the Albanian prompt (what the system does)", results, failures)
        if arguments.save:
            arguments.save.write_text(
                json.dumps([asdict(result) for result in results], ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"\n  per-clip results written to {arguments.save}")

    if arguments.config in ("both", "no-prompt"):
        results, failures = await run_configuration(clips, None, "without any prompt")
        report("Without any prompt", results, failures)

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
