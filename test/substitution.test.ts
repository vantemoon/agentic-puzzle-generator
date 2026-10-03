import { describe, expect, it } from "vitest";

import {
    createSubstitutionPuzzle,
    decodeSubstitution,
    encodeSubstitution,
    normalizeCipherAlphabet,
    normalizeSubstitutionPhrase
} from "../src/agents/substitution/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const CIPHER_ALPHABET = "QWERTYUIOPASDFGHJKLZXCVBNM";

describe("substitution cipher engine", () => {
    it("encodes and decodes a known phrase", () => {
        expect(encodeSubstitution("HELLO WORLD", CIPHER_ALPHABET))
            .toBe("ITSSG VGKSR");
        expect(decodeSubstitution("ITSSG VGKSR", CIPHER_ALPHABET))
            .toBe("HELLO WORLD");
    });

    it("normalizes documented phrase and alphabet equivalences", () => {
        expect(normalizeSubstitutionPhrase("  meet   at noon ")).toBe("MEET AT NOON");
        expect(normalizeCipherAlphabet("qwertyuiop asdfghjkl zxcvbnm"))
            .toBe(CIPHER_ALPHABET);
    });

    it("creates the expected deterministic private instance", () => {
        const spec = {
            id: "substitution-1",
            intendedSolution: "hello world",
            cipherAlphabet: CIPHER_ALPHABET
        };
        const first = createSubstitutionPuzzle(spec);
        const second = createSubstitutionPuzzle(spec);

        expect(first).toEqual(second);
        expect(first.id).toBe("substitution-1");
        expect(first.subtype).toBe("monoalphabetic-substitution");
        expect(first.solution.canonical).toBe("HELLO WORLD");
        expect(getPuzzleArtifactSource(first.artifact)).toContain(`Plain:  ABCDEFGHIJKLMNOPQRSTUVWXYZ`);
        expect(getPuzzleArtifactSource(first.artifact)).toContain(`Cipher: ${CIPHER_ALPHABET}`);
        expect(getPuzzleArtifactSource(first.artifact)).toContain("Message: ITSSG VGKSR");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["encoded_message", "cipher_alphabet"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["substitution-ciphertext", "substitution-alphabet"]);
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses case-insensitive deterministic answer validation", () => {
        const puzzle = createSubstitutionPuzzle({
            id: "substitution-2",
            intendedSolution: "Open Door",
            cipherAlphabet: CIPHER_ALPHABET
        });

        expect(validateNormalizedTextAnswer(puzzle, " open   door ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "close door")).toBe(false);
    });

    it("creates a schema-valid public projection without private values", () => {
        const puzzle = createSubstitutionPuzzle({
            id: "substitution-3",
            intendedSolution: "MEET AT NOON",
            cipherAlphabet: CIPHER_ALPHABET
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
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain(CIPHER_ALPHABET);
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain("Message:");
    });

    it("rejects incomplete, duplicate, and identity alphabets", () => {
        expect(() => normalizeCipherAlphabet("ABC"))
            .toThrow("exactly 26 English letters");
        expect(() => normalizeCipherAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYA"))
            .toThrow("each English letter exactly once");
        expect(() => normalizeCipherAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
            .toThrow("identity mapping");
    });

    it("rejects unsupported plaintext, excessive length, and empty IDs", () => {
        expect(() => createSubstitutionPuzzle({
            id: "substitution-bad-text",
            intendedSolution: "HELLO!",
            cipherAlphabet: CIPHER_ALPHABET
        })).toThrow("only English letters and spaces");
        expect(() => normalizeSubstitutionPhrase("A".repeat(121)))
            .toThrow("must not exceed 120");
        expect(() => createSubstitutionPuzzle({
            id: "   ",
            intendedSolution: "HELLO",
            cipherAlphabet: CIPHER_ALPHABET
        })).toThrow("ID must not be empty");
    });

});
