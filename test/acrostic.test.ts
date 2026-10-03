import { describe, expect, it } from "vitest";

import {
    createAcrosticPuzzle,
    extractAcrostic,
    normalizeAcrosticCoverText,
    normalizeAcrosticGenre,
    normalizeAcrosticPhrase,
    validateAcrosticCover
} from "../src/agents/acrostic/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const KNOWN_COVER_TEXT = `Morning traffic moved slowly beside the river while
evening rain still shimmered across the pavement.
Engineers inspecting the bridge expected
traffic to return to its usual pace by Friday.

After lunch, crews removed
the remaining barriers from the eastern lane.

New signs now mark
official detours around the construction area and
older fencing that will be collected
next week when the final inspection is complete.`;

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "MEET AT NOON",
    coverText: KNOWN_COVER_TEXT,
    genre: "community news brief"
});

describe("cover-text line acrostic engine", () => {
    it("extracts a known multi-word line-initial acrostic", () => {
        expect(extractAcrostic(KNOWN_COVER_TEXT)).toBe("MEETATNOON");
        expect(validateAcrosticCover("MEET AT NOON", KNOWN_COVER_TEXT))
            .toBe("MEET AT NOON");
    });

    it("uses the first ASCII letter after leading spaces or punctuation", () => {
        const coverText = [
            "  - Amber light crossed the quiet room.",
            "\t(Blue curtains moved beside the window.",
            "",
            "2026 Cedar branches brushed the garden wall."
        ].join("\n");

        expect(extractAcrostic(coverText)).toBe("ABC");
    });

    it("allows sentences to continue naturally across carrier lines", () => {
        const coverText = [
            "Morning traffic moved slowly beside the river,",
            "even as the clouds began to clear above downtown,",
            "eventually revealing sunlight along the eastern bridge."
        ].join("\n");

        expect(extractAcrostic(coverText)).toBe("MEE");
    });

    it("normalizes only documented solution, genre, and line-ending equivalences", () => {
        expect(normalizeAcrosticPhrase("  meet   at noon ")).toBe("MEET AT NOON");
        expect(normalizeAcrosticGenre("  first-person   travel blog "))
            .toBe("first-person travel blog");
        expect(normalizeAcrosticCoverText("  Alpha words remain.\r\nBeta words follow.  "))
            .toBe("Alpha words remain.\nBeta words follow.");
    });

    it("creates a deterministic private instance with typed ports and rule metadata", () => {
        const first = createAcrosticPuzzle(knownSpec("acrostic-1"));
        const second = createAcrosticPuzzle(knownSpec("acrostic-1"));
        const metadata = first.extensions.acrostic as {
            genre: string;
            ruleVersion: string;
            wordLengths: number[];
            extractedLetters: string;
            validatedMessage: string;
            coverTextSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("acrostic-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("cover-text-line-acrostic");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["cover_text", "extraction_rule"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["acrostic-cover-text", "acrostic-extraction-rule"]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(getPuzzleArtifactSource(first.artifact)).toBe(KNOWN_COVER_TEXT);
        expect(first.prompt).toContain("first letter on each nonblank line");
        expect(first.prompt).toContain("recover the original phrase");
        expect(first.prompt).not.toContain("word lengths");
        expect(metadata.genre).toBe("community news brief");
        expect(metadata.ruleVersion).toBe("line-initial-ascii-v2");
        expect(metadata.wordLengths).toEqual([4, 2, 4]);
        expect(metadata.extractedLetters).toBe("MEETATNOON");
        expect(metadata.validatedMessage).toBe("MEET AT NOON");
        expect(metadata.coverTextSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses normalized deterministic answer validation", () => {
        const puzzle = createAcrosticPuzzle(knownSpec("acrostic-2"));

        expect(validateNormalizedTextAnswer(puzzle, " meet   at noon ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "meetatnoon")).toBe(false);
        expect(validateNormalizedTextAnswer(puzzle, "meet after noon")).toBe(false);
    });

    it("creates a safe schema-valid public projection", () => {
        const puzzle = createAcrosticPuzzle(knownSpec("acrostic-3"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("MEET AT NOON");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toBe(KNOWN_COVER_TEXT);
    });

    it("rejects extraction mismatches and plainly exposed answers", () => {
        expect(() => validateAcrosticCover("MEET AT DAWN", KNOWN_COVER_TEXT))
            .toThrow('extracts to "MEETATNOON"');

        const exposed = [
            "Meet at noon beside the old fountain.",
            "Everyone should bring a notebook tomorrow.",
            "Evening activities will begin after dinner.",
            "Tea will be available near the entrance."
        ].join("\n");
        expect(() => validateAcrosticCover("MEET", exposed))
            .toThrow("must not appear contiguously");
    });

    it("ignores blank lines and rejects malformed carrier lines", () => {
        expect(extractAcrostic(
            "Alpha words start here.\n\n\nBeta words finish here."
        )).toBe("AB");
        expect(() => extractAcrostic(
            "Alpha words start here.\n\n123 --- !!!"
        )).toThrow("must contain an ASCII letter");
        expect(() => extractAcrostic(
            "Alpha words start here.\nBrief line."
        )).toThrow("at least 3 words");
    });

    it("rejects artificial sentence-per-line and capitalized continuation layouts", () => {
        const sentencePerLine = [
            "Morning traffic moved slowly beside the river.",
            "Evening rain left the sidewalks shining brightly.",
            "Engineers inspected the bridge before the commute."
        ].join("\n");
        expect(() => validateAcrosticCover("MEE", sentencePerLine))
            .toThrow("natural mid-sentence line break");

        const capitalizedContinuation = [
            "Morning traffic moved slowly beside the river,",
            "Evening rain still shimmered across the pavement while",
            "engineers inspected the bridge before the commute."
        ].join("\n");
        expect(() => validateAcrosticCover("MEE", capitalizedContinuation))
            .toThrow("normal lowercase capitalization");
    });

    it("rejects invalid messages, genres, cover text, and puzzle IDs", () => {
        expect(() => normalizeAcrosticPhrase("MEET @ NOON"))
            .toThrow("only English letters and spaces");
        expect(() => normalizeAcrosticPhrase("A".repeat(121)))
            .toThrow("must not exceed 120");
        expect(() => normalizeAcrosticGenre("   ")).toThrow("must not be empty");
        expect(() => normalizeAcrosticGenre("G".repeat(81))).toThrow("must not exceed 80");
        expect(() => normalizeAcrosticGenre("poem\u0000memo"))
            .toThrow("must not contain control characters");
        expect(() => normalizeAcrosticCoverText("A".repeat(8_001)))
            .toThrow("must not exceed 8000");
        expect(() => normalizeAcrosticCoverText("Invalid\u0000text"))
            .toThrow("printable ASCII");
        expect(() => createAcrosticPuzzle({
            ...knownSpec("   ")
        })).toThrow("ID must not be empty");
    });

    it("changes the stored source hash when the exact cover text changes", () => {
        const first = createAcrosticPuzzle(knownSpec("hash-1"));
        const changedCover = KNOWN_COVER_TEXT.replace(
            "Morning traffic moved slowly beside the river while",
            "Morning traffic moved quietly beside the river while"
        );
        const second = createAcrosticPuzzle({
            ...knownSpec("hash-2"),
            coverText: changedCover
        });
        const firstMetadata = first.extensions.acrostic as { coverTextSha256: string };
        const secondMetadata = second.extensions.acrostic as { coverTextSha256: string };

        expect(firstMetadata.coverTextSha256).not.toBe(secondMetadata.coverTextSha256);
    });

});
