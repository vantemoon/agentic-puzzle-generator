import { describe, it, expect } from "vitest";

import {
    createMorsePuzzle,
    decodeMorse,
    encodeMorse,
    normalizePhrase
} from "../src/agents/morse/engine.js";
import {
    assertPrivatePuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

describe("Morse code engine", () => {
    it("encodes a known phrase", () => {
        expect(encodeMorse("HELLO WORLD")).toBe(".... . .-.. .-.. --- / .-- --- .-. .-.. -..");
    });

    it("decodes an encoded phrase", () => {
        const encoded = encodeMorse("HELLO WORLD");
        expect(decodeMorse(encoded)).toBe("HELLO WORLD");
    });

    it("normalizes lowercase and repeated spaces", () => {
        expect(normalizePhrase("  meet   at noon ")).toBe("MEET AT NOON");
    });

    it("creates a valid minimal puzzle", () => {
        const puzzle = createMorsePuzzle({
            id: "morse-minimal",
            intendedSolution: "hello world"
        });
        expect(puzzle.prompt).toBe(
            "Decode this Morse code message: .... . .-.. .-.. --- / .-- --- .-. .-.. -.."
        );
        expect(puzzle.solution.canonical).toBe("HELLO WORLD");
    });

    it("rejects unsupported characters", () => {
        expect(() => createMorsePuzzle({
            id: "morse-bad-text",
            intendedSolution: "hello@world!"
        })).toThrow("only English letters, digits, spaces, and simple punctuation");
    });

    it("round-trips a phrase", () => {
        const answer = "MEET AT NOON";
        const encoded = encodeMorse(answer);
        expect(decodeMorse(encoded)).toBe(answer);
    });

    it("creates a schema-valid private instance and safe public projection", () => {
        const puzzle = createMorsePuzzle({
            id: "morse-1",
            intendedSolution: "meet at noon"
        });

        expect(() => assertPrivatePuzzleInstance(puzzle)).not.toThrow();
        expect(puzzle.id).toBe("morse-1");
        expect(puzzle.solution.canonical).toBe("MEET AT NOON");
        expect(validateNormalizedTextAnswer(puzzle, " meet   at noon ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "meet at night")).toBe(false);

        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("answer");
        expect(serialized).not.toContain("MEET AT NOON");
    });

});
