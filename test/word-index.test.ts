import { describe, expect, it } from "vitest";

import {
    createWordIndexPuzzle,
    decodeWordIndices,
    encodeWordIndices,
    normalizeCoverGenre,
    normalizeCoverText,
    normalizeWordIndexPhrase,
    tokenizeCoverText
} from "../src/agents/word-index/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const KNOWN_COVER_TEXT = [
    "Yesterday the community garden opened after weeks of rain.",
    "Volunteers arranged seed packets, repaired the wooden fence, and prepared tables for visitors.",
    "By midday, families began to meet near the fountain while musicians performed.",
    "At the information booth, a coordinator scheduled noon workshops on composting and native plants."
].join(" ");

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "MEET AT NOON",
    coverText: KNOWN_COVER_TEXT,
    genre: "community news brief"
});

const filler = (words: string[]): string => [
    ...words,
    "garden", "volunteers", "prepared", "several", "tables", "before", "visitors",
    "arrived", "for", "the", "annual", "community", "festival", "near", "the", "river",
    "musicians", "performed", "while", "families", "explored", "local", "craft", "displays",
    "throughout", "the", "quiet", "afternoon", "under", "clear", "skies"
].join(" ");

describe("cover-text word-index engine", () => {
    it("encodes and decodes a known word-index vector", () => {
        const coordinates = encodeWordIndices("MEET AT NOON", KNOWN_COVER_TEXT);

        expect(coordinates).toEqual([28, 35, 42]);
        expect(decodeWordIndices(KNOWN_COVER_TEXT, coordinates)).toBe("MEET AT NOON");
    });

    it("uses one-based punctuation-independent tokenization across line breaks", () => {
        const tokens = tokenizeCoverText("Hello, world!\nIt's a fine day.");

        expect(tokens.map((token) => [token.index, token.normalized])).toEqual([
            [1, "HELLO"],
            [2, "WORLD"],
            [3, "IT'S"],
            [4, "A"],
            [5, "FINE"],
            [6, "DAY"]
        ]);
    });

    it("normalizes only documented message, genre, and line-ending equivalences", () => {
        expect(normalizeWordIndexPhrase("  meet   at noon ")).toBe("MEET AT NOON");
        expect(normalizeCoverGenre("  first-person   travel blog "))
            .toBe("first-person travel blog");
        expect(normalizeCoverText("  First line.\r\nSecond line.  "))
            .toBe("First line.\nSecond line.");
    });

    it("creates a deterministic private instance with typed ports and genre metadata", () => {
        const first = createWordIndexPuzzle(knownSpec("word-index-1"));
        const second = createWordIndexPuzzle(knownSpec("word-index-1"));
        const metadata = first.extensions.wordIndex as {
            genre: string;
            coordinates: number[];
            selectedTokens: string[];
            coverTextSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("word-index-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("cover-text-word-index-cipher");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["cover_text", "coordinate_sequence"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["indexed-cover-text", "word-index-sequence"]);
        expect(first.inputs[0].constraints?.genre).toBe("community news brief");
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(metadata.genre).toBe("community news brief");
        expect(metadata.coordinates).toEqual([28, 35, 42]);
        expect(metadata.selectedTokens).toEqual(["MEET", "AT", "NOON"]);
        expect(metadata.coverTextSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses normalized deterministic answer validation", () => {
        const puzzle = createWordIndexPuzzle(knownSpec("word-index-2"));

        expect(validateNormalizedTextAnswer(puzzle, " meet   at noon ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "meet after noon")).toBe(false);
    });

    it("creates a safe schema-valid public projection", () => {
        const puzzle = createWordIndexPuzzle(knownSpec("word-index-3"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("MEET AT NOON");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain("28, 35, 42");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain(KNOWN_COVER_TEXT);
    });

    it("selects distinct, sufficiently separated occurrences for repeated words", () => {
        const coverText = filler([
            "Blue", "birds", "circle", "above", "the", "harbor", "as", "workers", "stack",
            "crates", "beside", "a", "warehouse", "painted", "bright", "blue"
        ]);

        const coordinates = encodeWordIndices("BLUE BLUE", coverText);
        expect(coordinates).toEqual([1, 16]);
        expect(decodeWordIndices(coverText, coordinates)).toBe("BLUE BLUE");
    });

    it("rejects missing, crowded, and plainly exposed message words", () => {
        expect(() => encodeWordIndices("MISSING WORD", filler(["A", "quiet", "report"])))
            .toThrow('occurrence of "MISSING"');

        expect(() => encodeWordIndices(
            "RED BLUE",
            filler(["A", "red", "small", "blue", "notice"])
        )).toThrow("at least 3 word positions");

        expect(() => encodeWordIndices(
            "OPEN DOOR",
            filler(["The", "open", "door", "stood", "beside", "a", "painted", "wall"])
        )).toThrow("must not appear contiguously");
    });

    it("rejects malformed and out-of-range coordinate sequences", () => {
        expect(() => decodeWordIndices(KNOWN_COVER_TEXT, [])).toThrow("must not be empty");
        expect(() => decodeWordIndices(KNOWN_COVER_TEXT, [0])).toThrow("outside");
        expect(() => decodeWordIndices(KNOWN_COVER_TEXT, [10_000])).toThrow("outside");
        expect(() => decodeWordIndices(KNOWN_COVER_TEXT, [1.5])).toThrow("outside");
    });

    it("rejects invalid messages, genres, cover text, and puzzle IDs", () => {
        expect(() => normalizeWordIndexPhrase("MEET @ NOON"))
            .toThrow("only English letters and spaces");
        expect(() => normalizeWordIndexPhrase("A".repeat(121)))
            .toThrow("must not exceed 120");
        expect(() => normalizeCoverGenre("   ")).toThrow("must not be empty");
        expect(() => normalizeCoverGenre("G".repeat(81))).toThrow("must not exceed 80");
        expect(() => normalizeCoverGenre("poem\u0000memo"))
            .toThrow("must not contain control characters");
        expect(() => normalizeCoverText("A".repeat(8_001)))
            .toThrow("must not exceed 8000");
        expect(() => normalizeCoverText("Invalid\u0000text"))
            .toThrow("printable ASCII");
        expect(() => createWordIndexPuzzle({
            ...knownSpec("   ")
        })).toThrow("ID must not be empty");
    });

    it("requires enough content to form a meaningful cover text", () => {
        expect(() => encodeWordIndices("MEET", "People meet beside the garden."))
            .toThrow("at least 30 words");
    });

    it("changes the stored source hash when the exact cover text changes", () => {
        const first = createWordIndexPuzzle(knownSpec("hash-1"));
        const second = createWordIndexPuzzle({
            ...knownSpec("hash-2"),
            coverText: `${KNOWN_COVER_TEXT} Today.`
        });
        const firstMetadata = first.extensions.wordIndex as { coverTextSha256: string };
        const secondMetadata = second.extensions.wordIndex as { coverTextSha256: string };

        expect(firstMetadata.coverTextSha256).not.toBe(secondMetadata.coverTextSha256);
    });

});
