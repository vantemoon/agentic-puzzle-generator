import { describe, expect, it } from "vitest";

import {
    createTelestichPuzzle,
    extractTelestich,
    normalizeTelestichCoverText,
    normalizeTelestichGenre,
    normalizeTelestichPhrase,
    validateTelestichCover
} from "../src/agents/telestich/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const KNOWN_COVER_TEXT = `Morning traffic slowed near the museum
while rain softened the glare
and inspectors reviewed the bridge
before reopening it
to commuters waiting across the plaza
after crews completed one final test
and removed the last caution
sign beside the temporary patio
so buses could resume the route to
downtown before noon`;

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "MEET AT NOON",
    coverText: KNOWN_COVER_TEXT,
    genre: "community news brief"
});

describe("cover-text line telestich engine", () => {
    it("extracts a known multi-word line-final telestich", () => {
        expect(extractTelestich(KNOWN_COVER_TEXT)).toBe("MEETATNOON");
        expect(validateTelestichCover("MEET AT NOON", KNOWN_COVER_TEXT))
            .toBe("MEET AT NOON");
    });

    it("uses the last ASCII letter before trailing nonletters", () => {
        const coverText = [
            "Quiet visitors gathered inside the museum... 2026",
            "Soft rain drifted over the lake!)",
            "Workers secured every gate!!!"
        ].join("\n");

        expect(extractTelestich(coverText)).toBe("MEE");
    });

    it("supports difficult terminal letters without changing the extraction rule", () => {
        const coverText = [
            "Pilgrims quietly prepared for hajj",
            "The archived map identified Iraq",
            "The actors practiced unscripted improv",
            "Workers stored supplies inside the box",
            "The evening program concluded with jazz"
        ].join("\n");

        expect(extractTelestich(coverText)).toBe("JQVXZ");
    });

    it("normalizes only documented solution, genre, and line-ending equivalences", () => {
        expect(normalizeTelestichPhrase("  meet   at noon ")).toBe("MEET AT NOON");
        expect(normalizeTelestichGenre("  first-person   travel blog "))
            .toBe("first-person travel blog");
        expect(normalizeTelestichCoverText("  Alpha words remain.\r\nBeta words follow.  "))
            .toBe("Alpha words remain.\nBeta words follow.");
    });

    it("creates a deterministic private instance with consistent type names", () => {
        const first = createTelestichPuzzle(knownSpec("telestich-1"));
        const second = createTelestichPuzzle(knownSpec("telestich-1"));
        const metadata = first.extensions.telestich as {
            genre: string;
            ruleVersion: string;
            extractedLetters: string;
            validatedMessage: string;
            coverTextSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("telestich-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("cover-text-line-telestich");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["cover_text", "extraction_rule"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual(["telestich-cover-text", "telestich-extraction-rule"]);
        expect(first.inputs[0].constraints?.minimumPlainWraps).toBe(1);
        expect(first.inputs[0].constraints).not.toHaveProperty("minimumPlainWrapRatio");
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(getPuzzleArtifactSource(first.artifact)).toBe(KNOWN_COVER_TEXT);
        expect(first.prompt).toContain("last letter on each nonblank line");
        expect(first.prompt).toContain("recover the original phrase");
        expect(JSON.stringify(first)).not.toContain("wordLengths");
        expect(metadata.genre).toBe("community news brief");
        expect(metadata.ruleVersion).toBe("line-final-ascii-v2");
        expect(metadata.extractedLetters).toBe("MEETATNOON");
        expect(metadata.validatedMessage).toBe("MEET AT NOON");
        expect(metadata.coverTextSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("requires the player to infer the phrase segmentation", () => {
        const puzzle = createTelestichPuzzle(knownSpec("telestich-2"));

        expect(validateNormalizedTextAnswer(puzzle, " meet   at noon ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "meetatnoon")).toBe(false);
        expect(validateNormalizedTextAnswer(puzzle, "meet after noon")).toBe(false);
    });

    it("creates a safe schema-valid public projection", () => {
        const puzzle = createTelestichPuzzle(knownSpec("telestich-3"));
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
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toBe(KNOWN_COVER_TEXT);
    });

    it("rejects extraction mismatches and plainly exposed answers", () => {
        expect(() => validateTelestichCover("MEET AT DAWN", KNOWN_COVER_TEXT))
            .toThrow('extracts to "MEETATNOON"');

        const exposed = [
            "Neighbors will meet at noon inside the museum",
            "while volunteers arrange chairs beside the lake",
            "and staff members prepare the welcome table",
            "before guests arrive for the public event"
        ].join("\n");
        expect(() => validateTelestichCover("MEET", exposed))
            .toThrow("must not appear contiguously");
    });

    it("ignores blank lines and rejects malformed carrier lines", () => {
        expect(extractTelestich(
            "Several visitors entered the museum\n\n\nRain softened the lake"
        )).toBe("ME");
        expect(() => extractTelestich(
            "Several visitors entered the museum\n\n123 --- !!!"
        )).toThrow("must contain an ASCII letter");
        expect(() => extractTelestich(
            "Several visitors entered the museum\nBrief lake."
        )).toThrow("at least 3 words");
    });

    it("rejects artificial sentence-per-line and capitalized continuations", () => {
        const sentencePerLine = [
            "Workers inspected the tram.",
            "Rain softened the glare.",
            "Crews repaired the bridge."
        ].join("\n");
        expect(() => validateTelestichCover("MEE", sentencePerLine))
            .toThrow("natural mid-sentence line break");

        const capitalizedContinuation = [
            "Workers gathered beside the tram",
            "Even as rain softened the glare",
            "engineers continued inspecting the bridge"
        ].join("\n");
        expect(() => validateTelestichCover("MEE", capitalizedContinuation))
            .toThrow("normal lowercase capitalization");
    });

    it("accepts one genuine mid-sentence wrap without requiring a ratio", () => {
        const coverText = [
            "Workers gathered beside the tram",
            "and waited quietly beside the lake.",
            "Crews repaired the bridge."
        ].join("\n");

        expect(validateTelestichCover("MEE", coverText)).toBe("MEE");
    });

    it("rejects invalid messages, genres, cover text, and puzzle IDs", () => {
        expect(() => normalizeTelestichPhrase("MEET @ NOON"))
            .toThrow("only English letters and spaces");
        expect(() => normalizeTelestichPhrase("A".repeat(121)))
            .toThrow("must not exceed 120");
        expect(() => normalizeTelestichGenre("   ")).toThrow("must not be empty");
        expect(() => normalizeTelestichGenre("G".repeat(81))).toThrow("must not exceed 80");
        expect(() => normalizeTelestichGenre("poem\u0000memo"))
            .toThrow("must not contain control characters");
        expect(() => normalizeTelestichCoverText("A".repeat(8_001)))
            .toThrow("must not exceed 8000");
        expect(() => normalizeTelestichCoverText("Invalid\u0000text"))
            .toThrow("printable ASCII");
        expect(() => createTelestichPuzzle({
            ...knownSpec("   ")
        })).toThrow("ID must not be empty");
    });

    it("changes the stored source hash when the exact cover text changes", () => {
        const first = createTelestichPuzzle(knownSpec("hash-1"));
        const changedCover = KNOWN_COVER_TEXT.replace(
            "Morning traffic slowed near the museum",
            "Morning traffic slowed beside the museum"
        );
        const second = createTelestichPuzzle({
            ...knownSpec("hash-2"),
            coverText: changedCover
        });
        const firstMetadata = first.extensions.telestich as { coverTextSha256: string };
        const secondMetadata = second.extensions.telestich as { coverTextSha256: string };

        expect(firstMetadata.coverTextSha256).not.toBe(secondMetadata.coverTextSha256);
    });
});
