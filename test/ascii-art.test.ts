import { describe, expect, it } from "vitest";

import {
    createAsciiArtPuzzle,
    extractAsciiArtMessage,
    extractAsciiObject,
    normalizeAsciiArtMessage,
    normalizeAsciiArtSubjectKind,
    normalizeAsciiArtRecognitionLevel,
    normalizeAsciiArtStyle,
    renderAsciiArt,
    renderAsciiObject
} from "../src/agents/ascii-art/engine.js";
import { createAsciiArtPuzzleTool } from "../src/agents/ascii-art/tool.js";
import { assertPrivatePuzzleInstance, assertPublicPuzzleInstance, getPuzzleArtifactSource, toPublicPuzzle, validateNormalizedTextAnswer } from "../src/core/types.js";

const spec = (id: string) => ({
    id,
    intendedSolution: "OPEN 7",
    recognitionLevel: "contextual" as const,
    artStyle: "block" as const
});

describe("ascii-art engine", () => {
    it("normalizes fields", () => {
        expect(normalizeAsciiArtMessage(" open   7 ")).toBe("OPEN 7");
        expect(normalizeAsciiArtRecognitionLevel("hidden")).toBe("hidden");
        expect(normalizeAsciiArtStyle(undefined)).toBe("block");
        expect(normalizeAsciiArtStyle("outline")).toBe("outline");
        expect(normalizeAsciiArtSubjectKind(undefined)).toBe("text");
        expect(normalizeAsciiArtSubjectKind("object")).toBe("object");
    });

    it("renders and extracts block ASCII art", () => {
        const art = renderAsciiArt("HI 5", "block");
        expect(art.split("\n")).toHaveLength(5);
        expect(art).toContain("#");
        expect(extractAsciiArtMessage(art)).toBe("HI 5");
    });

    it("renders and extracts alternate ASCII-art styles", () => {
        const outline = renderAsciiArt("AZ", "outline");
        const shadow = renderAsciiArt("AZ", "shadow");
        const texture = renderAsciiArt("AZ", "texture", "+=%");
        expect(outline).toContain("@");
        expect(shadow).toContain("$");
        expect(texture).toMatch(/[+=%]/);
        expect(extractAsciiArtMessage(outline)).toBe("AZ");
        expect(extractAsciiArtMessage(shadow)).toBe("AZ");
        expect(extractAsciiArtMessage(texture)).toBe("AZ");
    });

    it("renders and extracts object silhouettes", () => {
        const art = renderAsciiObject("key", "texture", "+=%");
        expect(art).toMatch(/[+=%]/);
        expect(extractAsciiObject(art)).toBe("KEY");
    });

    it("creates deterministic private puzzles", () => {
        const first = createAsciiArtPuzzle(spec("ascii-art-1"));
        const second = createAsciiArtPuzzle(spec("ascii-art-1"));

        expect(first).toEqual(second);
        expect(first.puzzleType).toBe("visual-recognition");
        expect(first.subtype).toBe("ascii-art");
        expect(first.artifact.kind).toBe("text");
        expect(first.artifact.mediaType).toBe("text/plain");
        expect(extractAsciiArtMessage(getPuzzleArtifactSource(first.artifact))).toBe("OPEN 7");
        expect(validateNormalizedTextAnswer(first, " open   7 ")).toBe(true);
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("creates object-subject private puzzles", () => {
        const puzzle = createAsciiArtPuzzle({ id: "ascii-art-object", intendedSolution: "star", subjectKind: "object", recognitionLevel: "contextual", artStyle: "texture", artCharacters: "+=%" });

        expect(puzzle.solution.canonical).toBe("STAR");
        expect(extractAsciiObject(getPuzzleArtifactSource(puzzle.artifact))).toBe("STAR");
        expect(puzzle.inputs[0].constraints).toMatchObject({ subjectKind: "object", artCharacters: "+=%" });
    });

    it("supports accepted alternatives and public projection", () => {
        const puzzle = createAsciiArtPuzzle({ ...spec("ascii-art-alt"), intendedSolution: "CODE", acceptedAlternatives: ["PASS"] });
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(validateNormalizedTextAnswer(puzzle, "pass")).toBe(true);
        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(serialized).not.toContain("CODE");
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
    });

    it("enforces hint policy, leak checks, supported characters, and length", () => {
        expect(() => createAsciiArtPuzzle({ ...spec("explicit"), recognitionLevel: "explicit" })).toThrow("require a reading hint");
        expect(() => createAsciiArtPuzzle({ ...spec("hidden"), recognitionLevel: "hidden", readingHint: "Read the letters." })).toThrow("must not include");
        expect(() => createAsciiArtPuzzle({ ...spec("leak"), readingHint: "The answer is OPEN 7." })).toThrow("must not appear");
        expect(() => normalizeAsciiArtMessage("café")).toThrow("may contain only");
        expect(() => normalizeAsciiArtMessage("A".repeat(33))).toThrow("must not exceed");
        expect(() => normalizeAsciiArtStyle("neon")).toThrow("style");
        expect(() => normalizeAsciiArtSubjectKind("animal")).toThrow("subject kind");
        expect(() => createAsciiArtPuzzle({ ...spec("bad-object"), subjectKind: "object", intendedSolution: "dragon" })).toThrow("ASCII-art object");
    });

    it("tool creates validated artifacts", async () => {
        const result = await createAsciiArtPuzzleTool.execute("tool", { mode: "demo", id: "ascii-art-tool", intendedSolution: "OPEN 7", recognitionLevel: "explicit", artStyle: "outline", subjectKind: "text", artCharacters: "@&", readingHint: "Read the large monospace letters." });
        const text = result.content[0];
        if (text.type !== "text") throw new Error("Expected text content.");
        const payload = JSON.parse(text.text) as { artifact: string; answer: string };

        expect(payload.answer).toBe("OPEN 7");
        expect(extractAsciiArtMessage(payload.artifact)).toBe("OPEN 7");
    });
});
