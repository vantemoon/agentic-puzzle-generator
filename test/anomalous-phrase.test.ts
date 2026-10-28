import { describe, expect, it } from "vitest";

import {
    buildAnomalousDocument,
    createAnomalousPhrasePuzzle,
    normalizeAnomalousPhrase,
    normalizeAnomalousPhraseGenre,
    normalizeAnomalousPhraseSolution,
    normalizeDocumentTemplate,
    normalizeNormalityContext,
    normalizeNormalPatternEvidence,
    normalizePlaceholder
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
    "Routine placements:",
    "Visitor badges: reception desk",
    "Courier log: west door shelf",
    "Spare key: security cabinet",
    "Tonight's exception: place the courier log beside {{ANOMALY}} before closing."
].join("\n");

const knownSpec = (id: string) => ({
    id,
    intendedSolution: "THE BLUE LANTERN",
    documentTemplate: template,
    anomalousPhrase: "the blue lantern",
    normalityContext: "The checklist establishes ordinary named storage locations; the exception introduces an object absent from that pattern.",
    normalPatternEvidence: [
        "Visitor badges: reception desk",
        "Courier log: west door shelf",
        "Spare key: security cabinet"
    ],
    genre: "office memo",
    anomalyKind: "out-of-context-entity" as const,
    acceptedAlternatives: ["blue lantern"]
});

describe("anomalous phrase engine", () => {
    it("normalizes only documented text equivalences", () => {
        expect(normalizeAnomalousPhraseSolution("  the   blue lantern ")).toBe("THE BLUE LANTERN");
        expect(normalizeDocumentTemplate("  first line\r\nsecond line  "))
            .toBe("first line\nsecond line");
        expect(normalizeAnomalousPhrase("  blue   lantern ")).toBe("blue lantern");
        expect(normalizeNormalityContext("  office   memo ")).toBe("office memo");
        expect(normalizeNormalPatternEvidence(["  first normal row  ", "second normal row"]))
            .toEqual(["first normal row", "second normal row"]);
        expect(normalizeAnomalousPhraseGenre("  incident   report ")).toBe("incident report");
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
            .toEqual(["document_template", "anomalous_phrase", "normality_context", "normal_pattern_evidence"]);
        expect(first.inputs.map((port) => port.valueType))
            .toEqual([
                "natural-language-document-template",
                "semantic-anomaly",
                "document-context",
                "document-excerpts"
            ]);
        expect(first.outputs[0].valueType).toBe("plain-text");
        expect(first.prompt).toContain("supported by evidence in the document");
        expect(first.prompt).not.toContain(knownSpec("unused").normalityContext);
        expect(first.prompt).toContain("the blue lantern");
        expect(getPuzzleArtifactSource(first.artifact)).toContain("the blue lantern");
        expect(metadata.genre).toBe("office memo");
        expect(metadata.anomalyKind).toBe("out-of-context-entity");
        expect(metadata.placeholder).toBe("{{ANOMALY}}");
        expect(metadata.ruleVersion).toBe("artifact-grounded-semantic-anomaly-v2");
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

    it("requires the answer and normal-pattern evidence to be grounded in the artifact", () => {
        expect(() => createAnomalousPhrasePuzzle({
            ...knownSpec("unrelated-answer"),
            intendedSolution: "RED UMBRELLA"
        })).toThrow("intended solution must appear in the anomalous phrase");
        expect(() => createAnomalousPhrasePuzzle({
            ...knownSpec("missing-evidence"),
            normalPatternEvidence: [
                "Visitor badges: reception desk",
                "This excerpt is not in the document"
            ]
        })).toThrow("must appear in the document outside the anomaly");
        expect(() => createAnomalousPhrasePuzzle({
            ...knownSpec("insufficient-evidence"),
            normalPatternEvidence: ["Visitor badges: reception desk"]
        })).toThrow("must contain from 2 to 8 distinct examples");
        expect(() => createAnomalousPhrasePuzzle({
            ...knownSpec("duplicate-evidence"),
            normalPatternEvidence: [
                "Visitor badges: reception desk",
                "Visitor badges: reception desk"
            ]
        })).toThrow("must contain from 2 to 8 distinct examples");
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
        expect(() => createAnomalousPhrasePuzzle({
            ...knownSpec("missing-retrieval-time"),
            externalKnowledgeRequired: true,
            externalKnowledgeProvenance: [{
                sourceId: "fixture/company-timeline.json",
                retrievedValue: { founded: 1998 },
                retrievedAt: ""
            }]
        })).toThrow("retrieval timestamp");
    });
});
