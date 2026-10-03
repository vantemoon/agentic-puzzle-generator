import { describe, expect, it } from "vitest";

import {
    applyCapitalizationPattern,
    createBinaryCapitalizationPuzzle,
    decodeCapitalizationPattern,
    encodeCapitalizationBits,
    extractCapitalizationBits,
    normalizeCapitalizationCarrier,
    normalizeCapitalizationGenre,
    normalizeCapitalizationSolution
} from "../src/agents/binary-capitalization/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const CARRIER_TEXT = [
    "quiet rivers cross the valley while lanterns glow beside the old stone road.",
    "travelers pause near the bridge and listen as evening birds settle in the trees.",
    "a cool wind moves through the grass before the last train reaches the village."
].join(" ");

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "Hi!",
    carrierText: CARRIER_TEXT,
    genre: "travel journal"
});

describe("binary capitalization pattern engine", () => {
    it("encodes printable ASCII plus a null terminator", () => {
        expect(encodeCapitalizationBits("A")).toBe("0100000100000000");
    });

    it("applies and decodes a known capitalization pattern", () => {
        const artifact = applyCapitalizationPattern("abcdefghijklmnop", "A");

        expect(artifact).toBe("aBcdefgHijklmnop");
        expect(extractCapitalizationBits(artifact)).toBe("0100000100000000");
        expect(decodeCapitalizationPattern(artifact)).toBe("A");
    });

    it("ignores nonletters and stops at the null byte", () => {
        const artifact = applyCapitalizationPattern(
            "ab-cd ef!gh ij,kl mn.op QRST remains after the payload.",
            "A"
        );

        expect(decodeCapitalizationPattern(artifact)).toBe("A");
        expect(artifact).toContain("-");
        expect(artifact).toContain("!");
    });

    it("normalizes only documented equivalences", () => {
        expect(normalizeCapitalizationSolution("  Meet   at noon  ")).toBe("Meet at noon");
        expect(normalizeCapitalizationCarrier("  first line\r\nsecond line  "))
            .toBe("first line\nsecond line");
        expect(normalizeCapitalizationGenre("  personal   note ")).toBe("personal note");
    });

    it("creates a deterministic schema-valid private instance", () => {
        const first = createBinaryCapitalizationPuzzle(knownSpec("binary-capitalization-1"));
        const second = createBinaryCapitalizationPuzzle(knownSpec("binary-capitalization-1"));
        const metadata = first.extensions.capitalization as {
            ruleVersion: string;
            encodedLetterCount: number;
            carrierLetterCount: number;
            decodedMessage: string;
            artifactSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("binary-capitalization-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("binary-capitalization-pattern");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["carrier_text", "extraction_rule"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["case-bit-carrier-text", "capitalization-bit-rule"]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(first.prompt).toContain("lowercase as 0 and uppercase as 1");
        expect(first.prompt).toContain("00000000 null byte");
        expect(decodeCapitalizationPattern(getPuzzleArtifactSource(first.artifact))).toBe("Hi!");
        expect(metadata.ruleVersion).toBe("ascii-letter-case-bits-v1");
        expect(metadata.encodedLetterCount).toBe(32);
        expect(metadata.carrierLetterCount).toBeGreaterThanOrEqual(32);
        expect(metadata.decodedMessage).toBe("Hi!");
        expect(metadata.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses case-sensitive normalized-text answer validation", () => {
        const puzzle = createBinaryCapitalizationPuzzle(knownSpec("binary-capitalization-2"));

        expect(validateNormalizedTextAnswer(puzzle, "  Hi!  ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "hi!")).toBe(false);
        expect(validateNormalizedTextAnswer(puzzle, "Bye!")).toBe(false);
    });

    it("creates a safe schema-valid public projection without private values", () => {
        const puzzle = createBinaryCapitalizationPuzzle(knownSpec("binary-capitalization-3"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("decodedMessage");
        expect(serialized).not.toContain("Hi!");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toBe(getPuzzleArtifactSource(puzzle.artifact));
    });

    it("rejects insufficient carriers and missing terminators", () => {
        expect(() => applyCapitalizationPattern("too short", "A"))
            .toThrow("require at least 16");
        expect(() => decodeCapitalizationPattern("aBcdefgH"))
            .toThrow("complete null terminator");
    });

    it("rejects exposed answers, invalid values, and excessive lengths", () => {
        expect(() => applyCapitalizationPattern(
            "This carrier says hidden word directly and then continues with many letters.",
            "hidden word"
        )).toThrow("must not appear contiguously");
        expect(() => normalizeCapitalizationSolution("café"))
            .toThrow("printable ASCII");
        expect(() => normalizeCapitalizationSolution("A".repeat(81)))
            .toThrow("must not exceed 80");
        expect(() => normalizeCapitalizationCarrier("bad\u0000carrier"))
            .toThrow("printable ASCII");
        expect(() => normalizeCapitalizationGenre("   ")).toThrow("must not be empty");
        expect(() => createBinaryCapitalizationPuzzle({
            ...knownSpec("   ")
        })).toThrow("ID must not be empty");
    });
});
