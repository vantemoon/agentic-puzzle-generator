import { describe, expect, it } from "vitest";

import {
    createNthCharacterPuzzle,
    extractNthCharacters,
    normalizeNthCharacterCarrier,
    normalizeNthCharacterGenre,
    normalizeNthCharacterSolution,
    validateNthCharacterCarrier,
    validateNthCharacterRule
} from "../src/agents/nth-character/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

function buildCarrier(
    solution: string,
    step: number,
    startIndex: number,
    filler = "x"
): string {
    const target = [...solution.replace(/[^A-Za-z]/g, "")];
    const length = startIndex + (target.length - 1) * step + 8;
    const codePoints = Array.from({ length }, () => filler);
    target.forEach((character, index) => {
        codePoints[startIndex - 1 + index * step] = character;
    });
    return codePoints.join("");
}

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "MEET AT NOON",
    carrierText: buildCarrier("MEET AT NOON", 8, 2),
    genre: "field note",
    step: 8,
    startIndex: 2
});

describe("every-nth-character engine", () => {
    it("extracts a known one-based periodic letter sequence", () => {
        expect(extractNthCharacters(buildCarrier("MEET", 8, 2), 8, 2, 4)).toBe("MEET");
    });

    it("ignores spaces, punctuation, digits, and non-ASCII characters", () => {
        const carrier = "A 😀 xx-xx 42 xxx! B\n😀xxx_xxxx?C";
        expect(extractNthCharacters(carrier, 8, 1, 3)).toBe("ABC");
    });

    it("normalizes line endings without counting them", () => {
        expect(extractNthCharacters("a\r\nxx-xx 42 xxx!b", 8, 1, 2)).toBe("ab");
        expect(normalizeNthCharacterCarrier("  first\r\nsecond  "))
            .toBe("first\nsecond");
    });

    it("normalizes only documented solution and genre equivalences", () => {
        expect(normalizeNthCharacterSolution("  Meet   At Noon  ")).toBe("MEET AT NOON");
        expect(normalizeNthCharacterGenre("  travel   note ")).toBe("travel note");
    });

    it("creates deterministic schema-valid private instances", () => {
        const first = createNthCharacterPuzzle(knownSpec("nth-character-1"));
        const second = createNthCharacterPuzzle(knownSpec("nth-character-1"));
        const metadata = first.extensions.nthCharacter as {
            ruleVersion: string;
            selectedLetterIndices: number[];
            selectedCodePointOffsets: number[];
            extractedLetters: string;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("nth-character-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("periodic-letter-extraction");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["carrier_text", "extraction_rule"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual([
                "periodic-character-carrier-text",
                "periodic-letter-extraction-rule"
            ]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(first.prompt).toContain("letter 2");
        expect(first.prompt).toContain("every 8th letter");
        expect(first.prompt).toContain("word lengths 4-2-4");
        expect(metadata.ruleVersion).toBe("ascii-letter-periodic-v2");
        expect(metadata.selectedLetterIndices[0]).toBe(1);
        expect(metadata.selectedCodePointOffsets[0]).toBe(1);
        expect(metadata.extractedLetters).toBe("MEETATNOON");
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses case-insensitive normalized-text answer validation", () => {
        const puzzle = createNthCharacterPuzzle(knownSpec("nth-character-2"));

        expect(validateNormalizedTextAnswer(puzzle, "  MEET   AT NOON ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "meet at noon")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "MEET AT NIGHT")).toBe(false);
    });

    it("accepts lowercase carrier characters and stores an uppercase canonical answer", () => {
        const puzzle = createNthCharacterPuzzle({
            id: "nth-character-lowercase",
            intendedSolution: "beacon",
            carrierText: buildCarrier("beacon", 8, 1),
            genre: "harbor note",
            step: 8,
            startIndex: 1
        });

        expect(extractNthCharacters(getPuzzleArtifactSource(puzzle.artifact), 8, 1, 6)).toBe("beacon");
        expect(puzzle.solution.canonical).toBe("BEACON");
        expect(validateNormalizedTextAnswer(puzzle, "beacon")).toBe(true);
    });

    it("allows natural formatting and ignores text after the final selected letter", () => {
        const encoded = buildCarrier("BEACON", 8, 1)
            .split("")
            .join(" - ");
        const extended = `${encoded} Additional ordinary prose may continue afterward.`;

        expect(extractNthCharacters(extended, 8, 1, 6).toUpperCase()).toBe("BEACON");
        expect(() => validateNthCharacterCarrier("BEACON", extended, 8, 1))
            .not.toThrow();
    });

    it("creates a safe schema-valid public projection", () => {
        const puzzle = createNthCharacterPuzzle(knownSpec("nth-character-3"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("selectedCodePointOffsets");
        expect(serialized).not.toContain("MEET AT NOON");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toBe(getPuzzleArtifactSource(puzzle.artifact));
    });

    it("rejects incorrect and too-short carriers", () => {
        expect(() => validateNthCharacterCarrier(
            "MEET",
            buildCarrier("MAET", 8, 2),
            8,
            2
        ))
            .toThrow("not the intended solution");
        expect(() => extractNthCharacters("short", 8, 2, 3))
            .toThrow("requires letter");
    });

    it("rejects visible answers and invalid counting rules", () => {
        expect(() => validateNthCharacterCarrier("MEET", "MEET in the lobby", 8, 1))
            .toThrow("must not appear contiguously");
        expect(() => validateNthCharacterRule(7, 1)).toThrow("from 8 to 50");
        expect(() => validateNthCharacterRule(8, 8)).not.toThrow();
        expect(() => validateNthCharacterRule(8, 9)).toThrow("through the step");
        expect(() => validateNthCharacterRule(8.5, 1)).toThrow("integer");
    });

    it("rejects invalid solutions, carriers, genres, and IDs", () => {
        expect(() => normalizeNthCharacterSolution("line\nbreak"))
            .not.toThrow();
        expect(() => normalizeNthCharacterSolution("café"))
            .toThrow("English letters and spaces");
        expect(() => normalizeNthCharacterSolution("A".repeat(121)))
            .toThrow("must not exceed 120");
        expect(() => normalizeNthCharacterCarrier("bad\u0000carrier"))
            .toThrow("control characters");
        expect(() => normalizeNthCharacterGenre("   ")).toThrow("must not be empty");
        expect(() => createNthCharacterPuzzle({ ...knownSpec("   ") }))
            .toThrow("ID must not be empty");
    });
});
