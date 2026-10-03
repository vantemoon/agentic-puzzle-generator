import { describe, expect, it } from "vitest";

import {
    createVigenerePuzzle,
    decodeVigenere,
    encodeVigenere,
    normalizeVigenereKey,
    normalizeVigenerePhrase
} from "../src/agents/vigenere/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

describe("Vigenere cipher engine", () => {
    it("encodes and decodes a standard known vector", () => {
        expect(encodeVigenere("ATTACK AT DAWN", "LEMON"))
            .toBe("LXFOPV EF RNHR");
        expect(decodeVigenere("LXFOPV EF RNHR", "LEMON"))
            .toBe("ATTACK AT DAWN");
    });

    it("repeats the key, wraps the alphabet, and advances only on letters", () => {
        expect(encodeVigenere("Z ZZZZ", "B C"))
            .toBe("A BABA");
        expect(decodeVigenere("A BABA", "BC"))
            .toBe("Z ZZZZ");
    });

    it("normalizes only documented phrase and key equivalences", () => {
        expect(normalizeVigenerePhrase("  meet   at noon "))
            .toBe("MEET AT NOON");
        expect(normalizeVigenereKey(" blue  moon "))
            .toBe("BLUEMOON");
    });

    it("creates the expected deterministic private instance", () => {
        const spec = {
            id: "vigenere-1",
            intendedSolution: "attack at dawn",
            key: "lemon"
        };
        const first = createVigenerePuzzle(spec);
        const second = createVigenerePuzzle(spec);

        expect(first).toEqual(second);
        expect(first.id).toBe("vigenere-1");
        expect(first.subtype).toBe("vigenere-cipher");
        expect(first.solution.canonical).toBe("ATTACK AT DAWN");
        expect(getPuzzleArtifactSource(first.artifact)).toBe("Key: LEMON\nMessage: LXFOPV EF RNHR");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["encoded_message", "key"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["vigenere-ciphertext", "vigenere-key"]);
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses case-insensitive deterministic answer validation", () => {
        const puzzle = createVigenerePuzzle({
            id: "vigenere-2",
            intendedSolution: "Open Door",
            key: "ORBIT"
        });

        expect(validateNormalizedTextAnswer(puzzle, " open   door ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "close door")).toBe(false);
    });

    it("creates a schema-valid public projection without private output values", () => {
        const puzzle = createVigenerePuzzle({
            id: "vigenere-3",
            intendedSolution: "MEET AT NOON",
            key: "LEMON"
        });
        const publicPuzzle = toPublicPuzzle(puzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);

        const serialized = JSON.stringify(publicPuzzle);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("MEET AT NOON");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain("Key: LEMON");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain("Message:");
    });

    it("rejects empty, overlong, and unsupported keys", () => {
        expect(() => normalizeVigenereKey("   "))
            .toThrow("key must not be empty");
        expect(() => normalizeVigenereKey("A".repeat(65)))
            .toThrow("must not exceed 64");
        expect(() => normalizeVigenereKey("KEY-2"))
            .toThrow("only English letters and whitespace");
    });

    it("rejects unsupported plaintext, excessive length, and empty IDs", () => {
        expect(() => createVigenerePuzzle({
            id: "vigenere-bad-text",
            intendedSolution: "HELLO!",
            key: "LEMON"
        })).toThrow("only English letters and spaces");
        expect(() => normalizeVigenerePhrase("A".repeat(121)))
            .toThrow("must not exceed 120");
        expect(() => createVigenerePuzzle({
            id: "   ",
            intendedSolution: "HELLO",
            key: "LEMON"
        })).toThrow("ID must not be empty");
    });

    it("accepts the documented phrase and key boundaries", () => {
        expect(normalizeVigenerePhrase("A".repeat(120)))
            .toHaveLength(120);
        expect(normalizeVigenereKey("B".repeat(64)))
            .toHaveLength(64);
    });

});
