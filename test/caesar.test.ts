import { describe, expect, it } from "vitest";

import {
    createCaesarPuzzle,
    decodeCaesar, 
    encodeCaesar,
    normalizePhrase
} from "../src/agents/caesar/engine.js";
import {
    assertPrivatePuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

describe("Caesar cipher engine", () => {
    it("encodes a known phrase", () => {
        expect(encodeCaesar("HELLO WORLD", 3)).toBe("KHOOR ZRUOG");
    });

    it("wraps around the alphabet", () => {
        expect(encodeCaesar("ZOO", 1)).toBe("APP");
    });

    it("decodes an encoded phrase", () => {
        const encoded = encodeCaesar("HELLO WORLD", 3);
        expect(decodeCaesar(encoded, 3)).toBe("HELLO WORLD");
    });

    it("normalizes lowercase and repeated spaces", () => {
        expect(normalizePhrase("  meet   at noon ")).toBe("MEET AT NOON");
    });

    it("creates a valid minimal puzzle", () => {
        const puzzle = createCaesarPuzzle({
            id: "caesar-minimal",
            intendedSolution: "hello world",
            shift: 3
        });
        expect(puzzle.prompt).toBe("Decode this message using a Caesar shift of 3: KHOOR ZRUOG");
        expect(puzzle.solution.canonical).toBe("HELLO WORLD");
    });

    it("rejects shift zero", () => {
        expect(() => createCaesarPuzzle({
            id: "caesar-bad-shift",
            intendedSolution: "hello world",
            shift: 0
        })).toThrow("between 1 and 25");
    });

    it("rejects punctuation initially", () => {
        expect(() => createCaesarPuzzle({
            id: "caesar-bad-text",
            intendedSolution: "hello, world!",
            shift: 3
        })).toThrow("only English letters and spaces");
    });

    it("round-trips a phrase", () => {
        const answer = "MEET AT NOON";
        const shift = 17;
        const encoded = encodeCaesar(answer, shift);
        expect(decodeCaesar(encoded, shift)).toBe(answer);
    });

    it("creates a schema-valid private instance and safe public projection", () => {
        const puzzle = createCaesarPuzzle({
            id: "caesar-1",
            intendedSolution: "hello world",
            shift: 3
        });

        expect(() => assertPrivatePuzzleInstance(puzzle)).not.toThrow();
        expect(puzzle.id).toBe("caesar-1");
        expect(puzzle.solution.canonical).toBe("HELLO WORLD");
        expect(validateNormalizedTextAnswer(puzzle, " hello   world ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "goodbye")).toBe(false);

        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("answer");
        expect(serialized).not.toContain("HELLO WORLD");
    });

});
