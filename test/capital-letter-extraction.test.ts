import { describe, expect, it } from "vitest";

import {
    applyCapitalLetterExtraction,
    createCapitalLetterExtractionPuzzle,
    extractCapitalLetters,
    normalizeCapitalLetterCarrier,
    normalizeCapitalLetterGenre,
    normalizeCapitalLetterSolution
} from "../src/agents/capital-letter-extraction/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const CARRIER_TEXT = [
    "many evenings ease toward a tranquil northern overlook near sunset.",
    "visitors follow the winding path while quiet birds settle beside the lake."
].join(" ");

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "MEET AT NOON",
    carrierText: CARRIER_TEXT,
    genre: "travel journal"
});

describe("capital-letter extraction engine", () => {
    it("capitalizes an ordered subsequence that directly spells the message", () => {
        const artifact = applyCapitalLetterExtraction(CARRIER_TEXT, "MEET AT NOON");
        const capitalCountsByWord = artifact.match(/[A-Za-z]+/g)?.map(
            (word) => word.match(/[A-Z]/g)?.length ?? 0
        ) ?? [];

        expect(extractCapitalLetters(artifact)).toBe("MEETATNOON");
        expect(artifact).toContain("M");
        expect(capitalCountsByWord.every((count) => count <= 1)).toBe(true);
    });

    it("lowercases unrelated preexisting capital letters", () => {
        const artifact = applyCapitalLetterExtraction(
            "Many Evenings ease toward the quiet valley after sunset.",
            "MEET"
        );

        expect(extractCapitalLetters(artifact)).toBe("MEET");
    });

    it("normalizes only documented equivalences", () => {
        expect(normalizeCapitalLetterSolution("  meet   at noon ")).toBe("MEET AT NOON");
        expect(normalizeCapitalLetterCarrier("  first line\r\nsecond line  "))
            .toBe("first line\nsecond line");
        expect(normalizeCapitalLetterGenre("  personal   note ")).toBe("personal note");
    });

    it("creates a deterministic schema-valid private instance", () => {
        const first = createCapitalLetterExtractionPuzzle(knownSpec("capital-extract-1"));
        const second = createCapitalLetterExtractionPuzzle(knownSpec("capital-extract-1"));
        const metadata = first.extensions.capitalLetterExtraction as {
            ruleVersion: string;
            wordLengths: number[];
            extractedLetters: string;
            selectedCharacterOffsets: number[];
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("capital-extract-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("capital-letter-extraction");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["carrier_text", "extraction_rule"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["capital-letter-carrier-text", "capital-letter-extraction-rule"]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(first.prompt).toContain("capitalized ASCII letters");
        expect(extractCapitalLetters(getPuzzleArtifactSource(first.artifact))).toBe("MEETATNOON");
        expect(metadata.ruleVersion).toBe("uppercase-ascii-extraction-v2");
        expect(metadata.wordLengths).toEqual([4, 2, 4]);
        expect(metadata.extractedLetters).toBe("MEETATNOON");
        expect(metadata.selectedCharacterOffsets).toHaveLength(10);
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses case-insensitive normalized-text validation", () => {
        const puzzle = createCapitalLetterExtractionPuzzle(knownSpec("capital-extract-2"));

        expect(validateNormalizedTextAnswer(puzzle, " meet   at noon ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "meetatnoon")).toBe(false);
        expect(validateNormalizedTextAnswer(puzzle, "meet at night")).toBe(false);
    });

    it("creates a safe schema-valid public projection", () => {
        const puzzle = createCapitalLetterExtractionPuzzle(knownSpec("capital-extract-3"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("wordLengths");
        expect(serialized).not.toContain("MEET AT NOON");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toBe(getPuzzleArtifactSource(puzzle.artifact));
    });

    it("rejects carriers that do not contain the message letters in order", () => {
        expect(() => applyCapitalLetterExtraction("a quiet blue lake", "ZEBRA"))
            .toThrow('missing suffix "ZEBRA"');
    });

    it("rejects plainly exposed answers", () => {
        expect(() => applyCapitalLetterExtraction(
            "Visitors will meet at noon beside the station before walking onward.",
            "MEET AT NOON"
        )).toThrow("must not appear contiguously");
    });

    it("rejects an answer word embedded in a larger carrier word", () => {
        expect(() => applyCapitalLetterExtraction(
            [
                "the weather turned chilly so i promised myself to remain warm by the window.",
                "curiously, the rain softened by noon and a robin came close to the glass."
            ].join(" "),
            "STAY CURIOUS"
        )).toThrow('answer word "CURIOUS" must not appear within a carrier word');
    });

    it("rejects invalid values and excessive lengths", () => {
        expect(() => normalizeCapitalLetterSolution("MEET @ NOON"))
            .toThrow("only English letters and spaces");
        expect(() => normalizeCapitalLetterSolution("A".repeat(121)))
            .toThrow("must not exceed 120");
        expect(() => normalizeCapitalLetterCarrier("bad\u0000carrier"))
            .toThrow("printable ASCII");
        expect(() => normalizeCapitalLetterGenre("   ")).toThrow("must not be empty");
        expect(() => createCapitalLetterExtractionPuzzle({
            ...knownSpec("   ")
        })).toThrow("ID must not be empty");
    });
});
