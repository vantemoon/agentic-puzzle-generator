import { describe, expect, it } from "vitest";

import {
    buildDeterministicAnagramLetters,
    createAnagramPuzzle,
    lettersOnly,
    normalizeAnagramAnswer,
    normalizeAnagramClue,
    normalizeScrambleSeed
} from "../src/agents/anagram/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "SILENT",
    clue: "Not making noise",
    scrambleSeed: "seed-1"
});

const sortedLetters = (input: string) => [...lettersOnly(input)].sort().join("");

describe("anagram engine", () => {
    it("normalizes only documented answer, clue, and seed equivalences", () => {
        expect(normalizeAnagramAnswer("  silent   planet ")).toBe("SILENT PLANET");
        expect(normalizeAnagramClue("  A   quiet world  ")).toBe("A quiet world");
        expect(normalizeScrambleSeed("  seeded shuffle  ")).toBe("seeded shuffle");
        expect(normalizeScrambleSeed(undefined)).toBe("default");
    });

    it("creates a deterministic private instance without a word-length input", () => {
        const first = createAnagramPuzzle(knownSpec("anagram-1"));
        const second = createAnagramPuzzle(knownSpec("anagram-1"));
        const metadata = first.extensions.anagram as {
            scrambleSeed: string;
            shuffleVersion: string;
            letterBankSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("anagram-1");
        expect(first.puzzleType).toBe("reconstruction");
        expect(first.subtype).toBe("anagram");
        expect(first.inputs.map((port) => port.key)).toEqual(["letter_bank", "clue"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["anagram-letter-bank", "semantic-clue"]);
        expect(first.inputs.some((port) => port.key.includes("word_length"))).toBe(false);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(first.inputs[0].value).toBe("SENTIL");
        expect(first.inputs[0].constraints?.spacesPreserved).toBe(true);
        expect(metadata.scrambleSeed).toBe("seed-1");
        expect(metadata.shuffleVersion).toBe("sha256-xorshift32-fisher-yates-preserve-spaces-v1");
        expect(metadata.letterBankSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("deterministically scrambles the exact solution letter multiset", () => {
        const seedOne = buildDeterministicAnagramLetters("SILENT", "seed-1");
        const seedTwo = buildDeterministicAnagramLetters("SILENT", "seed-2");

        expect(seedOne).toBe("SENTIL");
        expect(seedTwo).toBe("LSITNE");
        expect(seedOne).not.toBe(seedTwo);
        expect(seedOne).not.toBe("SILENT");
        expect(sortedLetters(seedOne)).toBe(sortedLetters("SILENT"));
        expect(sortedLetters(seedTwo)).toBe(sortedLetters("SILENT"));
    });

    it("uses normalized deterministic answer validation", () => {
        const puzzle = createAnagramPuzzle(knownSpec("anagram-2"));

        expect(validateNormalizedTextAnswer(puzzle, " silent ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "listen")).toBe(false);
    });

    it("supports intentional accepted alternatives with the same letter multiset", () => {
        const puzzle = createAnagramPuzzle({
            ...knownSpec("anagram-3"),
            acceptedAlternatives: ["LISTEN", "ENLIST"]
        });

        expect(validateNormalizedTextAnswer(puzzle, "listen")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "enlist")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "tinsel")).toBe(false);
    });

    it("creates a safe schema-valid public projection", () => {
        const puzzle = createAnagramPuzzle(knownSpec("anagram-4"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("SILENT");
        expect(publicPuzzle.artifact.kind).toBe("text");
        expect(publicPuzzle.artifact.mediaType).toBe("text/plain");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain("Clue: Not making noise");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain("Letters: SENTIL");
    });

    it("rejects invalid answers, clues, seeds, alternatives, and puzzle IDs", () => {
        expect(() => normalizeAnagramAnswer("ABC")).toThrow("at least 4 letters");
        expect(() => normalizeAnagramAnswer("AAAA")).toThrow("at least two distinct letters");
        expect(() => normalizeAnagramAnswer("MEET @ NOON"))
            .toThrow("only English letters and spaces");
        expect(() => normalizeAnagramAnswer(`${"A".repeat(81)}`))
            .toThrow("no more than 80 letters");
        expect(() => normalizeAnagramAnswer(`${"A".repeat(121)}`))
            .toThrow("must not exceed 120");
        expect(() => normalizeAnagramClue("   ")).toThrow("must not be empty");
        expect(() => normalizeAnagramClue("C".repeat(401))).toThrow("must not exceed 400");
        expect(() => normalizeAnagramClue("bad\u0000clue")).toThrow("printable ASCII");
        expect(() => normalizeScrambleSeed("   ")).toThrow("must not be empty");
        expect(() => normalizeScrambleSeed("bad\u0000seed")).toThrow("printable ASCII");
        expect(() => createAnagramPuzzle({
            ...knownSpec("   ")
        })).toThrow("ID must not be empty");
        expect(() => createAnagramPuzzle({
            ...knownSpec("bad-alt"),
            acceptedAlternatives: ["QUIET"]
        })).toThrow("exactly the same letters");
    });

    it("preserves original spaces in the displayed anagram without a word-length parameter", () => {
        const puzzle = createAnagramPuzzle({
            id: "anagram-no-word-lengths",
            intendedSolution: "SILENT PLANET",
            clue: "A quiet world",
            scrambleSeed: "planet-seed"
        });

        expect(puzzle.inputs[0].value).toBe("PTSLEI LEATNN");
        expect(puzzle.prompt).toContain("Letters: PTSLEI LEATNN");
        expect(puzzle.prompt).not.toMatch(/word lengths?/i);
        expect(getPuzzleArtifactSource(puzzle.artifact)).not.toMatch(/word lengths?/i);
        expect(puzzle.inputs.map((port) => port.key)).not.toContain("word_lengths");
    });
});
