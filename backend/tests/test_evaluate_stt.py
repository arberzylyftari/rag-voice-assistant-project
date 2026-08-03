"""Tests for the scoring in scripts/evaluate_stt.py.

The script reports the numbers the README quotes, so the arithmetic behind
them is worth pinning down — particularly the normalisation, which decides
what counts as an error and could quietly flatter the result.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
SCRIPT = BACKEND_DIR / "scripts" / "evaluate_stt.py"

spec = importlib.util.spec_from_file_location("evaluate_stt", SCRIPT)
assert spec and spec.loader
evaluate_stt = importlib.util.module_from_spec(spec)
sys.modules["evaluate_stt"] = evaluate_stt
spec.loader.exec_module(evaluate_stt)

edit_distance = evaluate_stt.edit_distance
normalise = evaluate_stt.normalise
score = evaluate_stt.score
summarise = evaluate_stt.summarise


class TestNormalise:
    def test_lowercases_and_strips_punctuation(self) -> None:
        assert normalise("Qarku i Lezhës!") == "qarku i lezhës"

    def test_collapses_whitespace(self) -> None:
        assert normalise("  nje   dy\ttre\n") == "nje dy tre"

    def test_keeps_albanian_letters(self) -> None:
        # `ë` and `ç` are letters, not decoration. Dropping them would forgive
        # a real transcription error and inflate the score.
        assert normalise("Përditësuar çdo ditë") == "përditësuar çdo ditë"

    def test_treats_composed_and_decomposed_forms_as_equal(self) -> None:
        composed = "përditesuar"
        decomposed = "përditesuar"
        assert normalise(composed) == normalise(decomposed)

    def test_keeps_digits(self) -> None:
        assert normalise("21 dite pune.") == "21 dite pune"


class TestEditDistance:
    def test_identical_sequences_cost_nothing(self) -> None:
        assert edit_distance(["a", "b"], ["a", "b"]) == 0

    def test_counts_a_substitution_once(self) -> None:
        assert edit_distance(["a", "b"], ["a", "c"]) == 1

    def test_counts_insertions_and_deletions(self) -> None:
        assert edit_distance(["a", "b"], ["a"]) == 1
        assert edit_distance(["a"], ["a", "b"]) == 1

    def test_empty_reference_costs_the_hypothesis_length(self) -> None:
        assert edit_distance([], ["a", "b", "c"]) == 3

    def test_works_over_characters(self) -> None:
        assert edit_distance("kitten", "sitting") == 3


class TestScore:
    def test_a_perfect_transcript_scores_clean(self) -> None:
        result = score("Sa ditë pushimi vjetor kam?", "Sa ditë pushimi vjetor kam?")

        assert result.word_errors == 0
        assert result.char_errors == 0
        assert result.similarity == pytest.approx(1.0)

    def test_punctuation_and_case_are_not_errors(self) -> None:
        result = score("Qarku i Lezhës", "qarku i lezhës.")

        assert result.word_errors == 0
        assert result.char_errors == 0

    def test_a_wrong_word_is_one_word_error(self) -> None:
        result = score("Qarku i Lezhës", "Çarku i Lezhës")

        assert result.word_errors == 1
        assert result.reference_words == 3
        # One letter differs, so the character error rate stays far lower than
        # the word error rate — which is why both are reported.
        assert result.char_errors == 1

    def test_counts_reference_length_from_the_reference(self) -> None:
        result = score("nje dy tre", "nje")

        assert result.reference_words == 3
        assert result.word_errors == 2


class TestSummarise:
    def test_pools_errors_over_the_corpus_rather_than_averaging_clips(self) -> None:
        # A one-word error in a two-word clip and none in a ten-word clip is
        # 1/12, not the 25% a per-clip average would report.
        results = [
            score("nje dy", "nje tre"),
            score("a b c d e f g h i j", "a b c d e f g h i j"),
        ]

        assert summarise(results)["wer"] == pytest.approx(1 / 12)

    def test_reports_the_share_of_exact_matches(self) -> None:
        results = [
            score("nje dy", "nje dy"),
            score("nje dy", "nje tre"),
        ]

        assert summarise(results)["exact"] == pytest.approx(0.5)

    def test_empty_input_reports_nothing_rather_than_dividing_by_zero(self) -> None:
        assert summarise([]) == {}
