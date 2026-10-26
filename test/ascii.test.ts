import { describe, expect, it } from "vitest";

import {
    createAsciiPuzzle,
    decodeAscii,
    encodeAscii,
    normalizeAsciiPhrase
} from "../src/agents/ascii/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

describe("ASCII code engine", () => {
    it("encodes and decodes all supported radices", () => {
        expect(encodeAscii("Hi", "decimal")).toBe("72 105");
        expect(encodeAscii("Hi", "hexadecimal")).toBe("48 69");
        expect(encodeAscii("Hi", "binary")).toBe("01001000 01101001");
        expect(decodeAscii("72 105", "decimal")).toBe("Hi");
        expect(decodeAscii("48 69", "hexadecimal")).toBe("Hi");
        expect(decodeAscii("01001000 01101001", "binary")).toBe("Hi");
    });

    it("normalizes whitespace without changing letter case", () => {
        expect(normalizeAsciiPhrase("  Hello   World  ")).toBe("Hello World");
    });

    it("creates the expected deterministic private instance", () => {
        const spec = { id: "ascii-1", intendedSolution: "Hi!", radix: "decimal" as const };
        const first = createAsciiPuzzle(spec);
        const second = createAsciiPuzzle(spec);

        expect(first).toEqual(second);
        expect(first.id).toBe("ascii-1");
        expect(getPuzzleArtifactSource(first.artifact)).toBe("72 105 33");
        expect(first.solution.canonical).toBe("Hi!");
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses case-sensitive deterministic answer validation", () => {
        const puzzle = createAsciiPuzzle({
            id: "ascii-2",
            intendedSolution: "Open Door",
            radix: "hexadecimal"
        });

        expect(validateNormalizedTextAnswer(puzzle, " Open   Door ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "open door")).toBe(false);
        expect(validateNormalizedTextAnswer(puzzle, "Close Door")).toBe(false);
    });

    it("creates a schema-valid public projection without private values", () => {
        const puzzle = createAsciiPuzzle({
            id: "ascii-3",
            intendedSolution: "Secret",
            radix: "binary"
        });
        const publicPuzzle = toPublicPuzzle(puzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs[0]).not.toHaveProperty("value");
        expect(publicPuzzle.outputs[0]).not.toHaveProperty("value");
        const serialized = JSON.stringify(publicPuzzle);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("answer");
        expect(serialized).not.toContain("Secret");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("validator");
    });

    it("rejects unsupported characters and excessive length", () => {
        expect(() => createAsciiPuzzle({
            id: "ascii-bad",
            intendedSolution: "café",
            radix: "decimal"
        })).toThrow("printable ASCII");
        expect(() => normalizeAsciiPhrase("A".repeat(81))).toThrow("must not exceed 80");
    });

    it("rejects malformed and non-printable encoded values", () => {
        expect(() => decodeAscii("72 nope", "decimal")).toThrow("invalid decimal");
        expect(() => decodeAscii("31", "decimal")).toThrow("outside the printable range");
        expect(() => decodeAscii("0101", "binary")).toThrow("invalid binary");
    });

});
