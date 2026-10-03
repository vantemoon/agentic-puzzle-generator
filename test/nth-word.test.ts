import { describe, expect, it } from "vitest";

import {
    createNthWordPuzzle,
    extractNthWords,
    normalizeNthWordCover,
    normalizeNthWordGenre,
    normalizeNthWordPhrase,
    tokenizeNthWordCover,
    validateNthWordCover,
    validateNthWordRule
} from "../src/agents/nth-word/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

function buildCover(
    solution: string,
    step: number,
    startIndex: number,
    wordCount = 36
): string {
    const words = Array.from(
        { length: wordCount },
        (_, index) => ["garden", "river", "lantern", "window", "path"][index % 5]
    );
    solution.split(" ").forEach((word, index) => {
        words[startIndex - 1 + index * step] = word.toLowerCase();
    });
    return words.join(" ") + ".";
}

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "MEET AT NOON",
    coverText: buildCover("MEET AT NOON", 5, 2),
    genre: "garden journal",
    step: 5,
    startIndex: 2
});

describe("every-nth-word engine", () => {
    it("extracts a known one-based periodic word sequence", () => {
        expect(extractNthWords(knownSpec("vector").coverText, 5, 2, 3))
            .toBe("MEET AT NOON");
    });

    it("uses punctuation-independent tokenization compatible with word-index", () => {
        const tokens = tokenizeNthWordCover("Hello, world!\nIt's high-quality 42 times.");

        expect(tokens.map((token) => [token.index, token.normalized])).toEqual([
            [1, "HELLO"],
            [2, "WORLD"],
            [3, "IT'S"],
            [4, "HIGH"],
            [5, "QUALITY"],
            [6, "TIMES"]
        ]);
    });

    it("normalizes only documented phrase, cover, and genre equivalences", () => {
        expect(normalizeNthWordPhrase("  meet   at noon ")).toBe("MEET AT NOON");
        expect(normalizeNthWordCover("  first line\r\nsecond line  "))
            .toBe("first line\nsecond line");
        expect(normalizeNthWordGenre("  travel   journal ")).toBe("travel journal");
    });

    it("creates deterministic schema-valid private instances", () => {
        const first = createNthWordPuzzle(knownSpec("nth-word-1"));
        const second = createNthWordPuzzle(knownSpec("nth-word-1"));
        const metadata = first.extensions.nthWord as {
            tokenizerVersion: string;
            ruleVersion: string;
            selectedWordIndices: number[];
            selectedTokens: string[];
            extractedMessage: string;
            coverTextSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("nth-word-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("periodic-word-extraction");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["cover_text", "extraction_rule"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["periodic-word-carrier-text", "periodic-word-extraction-rule"]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(first.prompt).toContain("word 2");
        expect(first.prompt).toContain("every 5th word");
        expect(metadata.tokenizerVersion).toBe("ascii-words-apostrophes-v1");
        expect(metadata.ruleVersion).toBe("periodic-word-index-v1");
        expect(metadata.selectedWordIndices).toEqual([2, 7, 12]);
        expect(metadata.selectedTokens).toEqual(["MEET", "AT", "NOON"]);
        expect(metadata.extractedMessage).toBe("MEET AT NOON");
        expect(metadata.coverTextSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses case-insensitive normalized-text answer validation", () => {
        const puzzle = createNthWordPuzzle(knownSpec("nth-word-2"));

        expect(validateNormalizedTextAnswer(puzzle, " meet   at noon ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "meet after noon")).toBe(false);
    });

    it("creates a safe schema-valid public projection", () => {
        const puzzle = createNthWordPuzzle(knownSpec("nth-word-3"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("selectedWordIndices");
        expect(serialized).not.toContain("MEET AT NOON");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toBe(getPuzzleArtifactSource(puzzle.artifact));
    });

    it("supports repeated solution words at distinct periodic positions", () => {
        const cover = buildCover("BLUE BLUE", 7, 3);
        expect(extractNthWords(cover, 7, 3, 2)).toBe("BLUE BLUE");
        expect(() => validateNthWordCover("BLUE BLUE", cover, 7, 3)).not.toThrow();
    });

    it("rejects incorrect, too-short, and visibly exposed covers", () => {
        const incorrect = buildCover("MEET AT NIGHT", 5, 2);
        expect(() => validateNthWordCover("MEET AT NOON", incorrect, 5, 2))
            .toThrow("not the intended solution");
        expect(() => validateNthWordCover(
            "MEET",
            "people meet beside the quiet garden",
            4,
            2
        )).toThrow("at least 30 words");

        const exposedWords = buildCover("RED BLUE", 5, 2).match(/[A-Za-z]+/g) ?? [];
        exposedWords[20] = "red";
        exposedWords[21] = "blue";
        expect(() => validateNthWordCover("RED BLUE", exposedWords.join(" "), 5, 2))
            .toThrow("must not appear contiguously");
    });

    it("rejects invalid counting rules and out-of-range extraction", () => {
        expect(() => validateNthWordRule(3, 1)).toThrow("from 4 to 30");
        expect(() => validateNthWordRule(4, 4)).not.toThrow();
        expect(() => validateNthWordRule(4, 5)).toThrow("through the step");
        expect(() => validateNthWordRule(4.5, 1)).toThrow("integer");
        expect(() => extractNthWords("one two three four", 4, 2, 3))
            .toThrow("requires word");
    });

    it("rejects invalid phrases, covers, genres, and IDs", () => {
        expect(() => normalizeNthWordPhrase("MEET @ NOON"))
            .toThrow("only English letters and spaces");
        expect(() => normalizeNthWordPhrase("A".repeat(121)))
            .toThrow("must not exceed 120");
        expect(() => normalizeNthWordPhrase(
            Array.from({ length: 21 }, () => "A").join(" ")
        )).toThrow("must not exceed 20 words");
        expect(() => normalizeNthWordCover("bad\u0000cover"))
            .toThrow("printable ASCII");
        expect(() => normalizeNthWordGenre("   ")).toThrow("must not be empty");
        expect(() => createNthWordPuzzle({ ...knownSpec("   ") }))
            .toThrow("ID must not be empty");
    });
});
