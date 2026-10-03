import { describe, expect, it } from "vitest";

import {
    buildAnomalousDocument,
    createAnomalousPhrasePuzzle,
    normalizeAnomalousPhrase,
    normalizeAnomalousPhraseGenre,
    normalizeAnomalousPhraseSolution,
    normalizeDocumentTemplate,
    normalizeNormalityContext,
    normalizePlaceholder,
    normalizeSolverInstruction
} from "../src/agents/anomalous-phrase/engine.js";
import {
    assertPrivatePuzzleInstance,
    getPuzzleArtifactSource,
    assertPublicPuzzleInstance,
    toPublicPuzzle,
    validateNormalizedTextAnswer
} from "../src/core/types.js";

const template = [
    "Subject: Final lobby checklist",
    "The reception desk has fresh badges, the west doors are locked, and the evening guard will arrive at 18:00.",
    "Please leave the courier log beside {{ANOMALY}} before closing.",
    "Nothing else should be moved from the supply cabinet today."
].join("\n");

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "THE BLUE LANTERN",
    documentTemplate: template,
    anomalousPhrase: "the blue lantern",
    normalityContext: "This office memo is about ordinary lobby closing tasks; no lanterns are part of the building equipment.",
    genre: "office memo",
    anomalyKind: "out-of-context-entity" as const,
    solverInstruction: "Identify the object that does not belong in the memo.",
    acceptedAlternatives: ["blue lantern"]
});

describe("anomalous phrase engine", () => {
    it("normalizes only documented text equivalences", () => {
        expect(normalizeAnomalousPhraseSolution("  the   blue lantern ")).toBe("THE BLUE LANTERN");
        expect(normalizeDocumentTemplate("  first line\r\nsecond line  "))
            .toBe("first line\nsecond line");
        expect(normalizeAnomalousPhrase("  blue   lantern ")).toBe("blue lantern");
        expect(normalizeNormalityContext("  office   memo ")).toBe("office memo");
        expect(normalizeAnomalousPhraseGenre("  incident   report ")).toBe("incident report");
        expect(normalizeSolverInstruction(undefined)).toContain("Read the document closely");
        expect(normalizePlaceholder(undefined)).toBe("{{ANOMALY}}");
    });

    it("builds a document by replacing exactly one anomaly placeholder", () => {
        const document = buildAnomalousDocument(template, "the blue lantern");

        expect(document).toContain("the blue lantern");
        expect(document).not.toContain("{{ANOMALY}}");
        expect(document.match(/the blue lantern/g)).toHaveLength(1);
    });

    it("creates deterministic schema-valid private instances", () => {
        const first = createAnomalousPhrasePuzzle(knownSpec("anomalous-1"));
        const second = createAnomalousPhrasePuzzle(knownSpec("anomalous-1"));
        const metadata = first.extensions.anomalousPhrase as {
            genre: string;
            anomalyKind: string;
            placeholder: string;
            ruleVersion: string;
            anomalousPhrase: string;
            documentSha256: string;
        };

        expect(first).toEqual(second);
        expect(first.id).toBe("anomalous-1");
        expect(first.puzzleType).toBe("hidden-information");
        expect(first.subtype).toBe("anomalous-phrase");
        expect(first.inputs.map((port) => port.key))
            .toEqual(["document_template", "anomalous_phrase", "normality_context"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual([
                "natural-language-document-template",
                "semantic-anomaly",
                "document-context"
            ]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(first.prompt).toContain("Identify the object");
        expect(first.prompt).toContain("Context:");
        expect(first.prompt).toContain("the blue lantern");
        expect(getPuzzleArtifactSource(first.artifact)).toContain("the blue lantern");
        expect(metadata.genre).toBe("office memo");
        expect(metadata.anomalyKind).toBe("out-of-context-entity");
        expect(metadata.placeholder).toBe("{{ANOMALY}}");
        expect(metadata.ruleVersion).toBe("single-semantic-anomaly-v1");
        expect(metadata.anomalousPhrase).toBe("the blue lantern");
        expect(metadata.documentSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(first.solution.canonical).toBe("THE BLUE LANTERN");
        expect(first.solution.acceptedAlternatives).toEqual(["BLUE LANTERN"]);
        expect(first.externalKnowledge).toEqual({ required: false });
        expect(() => assertPrivatePuzzleInstance(first)).not.toThrow();
    });

    it("uses case-insensitive normalized-text answer validation and alternatives", () => {
        const puzzle = createAnomalousPhrasePuzzle(knownSpec("anomalous-2"));

        expect(validateNormalizedTextAnswer(puzzle, " the   blue lantern ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, " blue lantern ")).toBe(true);
        expect(validateNormalizedTextAnswer(puzzle, "red lantern")).toBe(false);
    });

    it("creates a safe schema-valid public projection", () => {
        const puzzle = createAnomalousPhrasePuzzle(knownSpec("anomalous-3"));
        const publicPuzzle = toPublicPuzzle(puzzle);
        const serialized = JSON.stringify(publicPuzzle);

        expect(() => assertPublicPuzzleInstance(publicPuzzle)).not.toThrow();
        expect(publicPuzzle.inputs.every((port) => !("value" in port))).toBe(true);
        expect(publicPuzzle.outputs.every((port) => !("value" in port))).toBe(true);
        expect(serialized).not.toContain("solution");
        expect(serialized).not.toContain("validator");
        expect(serialized).not.toContain("extensions");
        expect(serialized).not.toContain("documentSha256");
        expect(serialized).not.toContain("THE BLUE LANTERN");
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toBe(getPuzzleArtifactSource(puzzle.artifact));
        expect(getPuzzleArtifactSource(publicPuzzle.artifact)).toContain("the blue lantern");
    });

    it("records required external-knowledge provenance", () => {
        const puzzle = createAnomalousPhrasePuzzle({
            ...knownSpec("anomalous-external"),
            anomalyKind: "factual-inconsistency",
            externalKnowledgeRequired: true,
            externalKnowledgeProvenance: [{
                sourceId: "fixture/company-timeline.json",
                retrievedValue: { founded: 1998 },
                retrievedAt: "2024-01-01T00:00:00Z"
            }]
        });

        expect(puzzle.externalKnowledge).toEqual({
            required: true,
            provenance: [{
                sourceId: "fixture/company-timeline.json",
                retrievedValue: { founded: 1998 },
                retrievedAt: "2024-01-01T00:00:00Z"
            }]
        });
    });

    it("rejects invalid placeholders and accidental duplicate anomalies", () => {
        expect(() => buildAnomalousDocument("No placeholder here", "blue lantern"))
            .toThrow("exactly one");
        expect(() => buildAnomalousDocument("{{ANOMALY}} and {{ANOMALY}}", "blue lantern"))
            .toThrow("exactly one");
        expect(() => buildAnomalousDocument(
            "The blue lantern is stored near {{ANOMALY}}.",
            "blue lantern"
        )).toThrow("must not already appear");
        expect(() => normalizePlaceholder(" bad ")).toThrow("without surrounding whitespace");
    });

    it("rejects invalid IDs, text fields, anomaly kinds, and missing provenance", () => {
        expect(() => createAnomalousPhrasePuzzle({ ...knownSpec("   ") }))
            .toThrow("ID must not be empty");
        expect(() => normalizeAnomalousPhraseSolution("   ")).toThrow("must not be empty");
        expect(() => normalizeAnomalousPhraseSolution("A".repeat(161)))
            .toThrow("must not exceed 160");
        expect(() => normalizeDocumentTemplate("bad\u0000template"))
            .toThrow("printable ASCII");
        expect(() => createAnomalousPhrasePuzzle({
            ...knownSpec("bad-kind"),
            anomalyKind: "typo" as "unusual-phrase"
        })).toThrow("anomaly kind");
        expect(() => createAnomalousPhrasePuzzle({
            ...knownSpec("missing-provenance"),
            externalKnowledgeRequired: true
        })).toThrow("provenance");
    });
});
