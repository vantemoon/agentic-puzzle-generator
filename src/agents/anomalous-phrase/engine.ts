import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export type AnomalyKind =
    | "unusual-phrase"
    | "factual-inconsistency"
    | "out-of-context-entity"
    | "timeline-inconsistency"
    | "location-inconsistency";

export interface ExternalKnowledgeProvenance {
    sourceId: string;
    retrievedValue: unknown;
    retrievedAt?: string;
}

export interface AnomalousPhrasePuzzleSpec extends PuzzleGenerationSpec {
    documentTemplate: string;
    anomalousPhrase: string;
    normalityContext: string;
    genre: string;
    anomalyKind: AnomalyKind;
    solverInstruction?: string;
    placeholder?: string;
    acceptedAlternatives?: string[];
    externalKnowledgeRequired?: boolean;
    externalKnowledgeProvenance?: ExternalKnowledgeProvenance[];
}

const MAX_SOLUTION_LENGTH = 160;
const MAX_DOCUMENT_TEMPLATE_LENGTH = 12_000;
const MAX_ANOMALOUS_PHRASE_LENGTH = 240;
const MAX_CONTEXT_LENGTH = 2_000;
const MAX_GENRE_LENGTH = 80;
const MAX_INSTRUCTION_LENGTH = 400;
const DEFAULT_PLACEHOLDER = "{{ANOMALY}}";
const RULE_VERSION = "single-semantic-anomaly-v1";
const ALLOWED_ANOMALY_KINDS: readonly AnomalyKind[] = [
    "unusual-phrase",
    "factual-inconsistency",
    "out-of-context-entity",
    "timeline-inconsistency",
    "location-inconsistency"
];

function normalizeHumanText(
    input: string,
    fieldName: string,
    maximumLength: number,
    options: { uppercase?: boolean; allowLineBreaks?: boolean } = {}
): string {
    const lineNormalized = options.allowLineBreaks
        ? input.replace(/\r\n?/g, "\n").trim()
        : input.trim().replace(/\s+/g, " ");
    const normalized = options.uppercase ? lineNormalized.toUpperCase() : lineNormalized;

    if (normalized.length === 0) {
        throw new Error(`The ${fieldName} must not be empty.`);
    }
    if (normalized.length > maximumLength) {
        throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    }
    if (/[^\x09\x0A\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(
            `The ${fieldName} may contain printable ASCII, tabs, line breaks, and common typographic punctuation.`
        );
    }

    return normalized;
}

export function normalizeAnomalousPhraseSolution(input: string): string {
    return normalizeHumanText(input, "intended solution", MAX_SOLUTION_LENGTH, {
        uppercase: true
    });
}

export function normalizeDocumentTemplate(input: string): string {
    return normalizeHumanText(input, "document template", MAX_DOCUMENT_TEMPLATE_LENGTH, {
        allowLineBreaks: true
    });
}

export function normalizeAnomalousPhrase(input: string): string {
    return normalizeHumanText(input, "anomalous phrase", MAX_ANOMALOUS_PHRASE_LENGTH);
}

export function normalizeNormalityContext(input: string): string {
    return normalizeHumanText(input, "normality context", MAX_CONTEXT_LENGTH);
}

export function normalizeAnomalousPhraseGenre(input: string): string {
    return normalizeHumanText(input, "genre", MAX_GENRE_LENGTH);
}

export function normalizeSolverInstruction(input: string | undefined): string {
    if (input === undefined) {
        return "Read the document closely and submit the anomalous phrase or fact that does not fit its context.";
    }
    return normalizeHumanText(input, "solver instruction", MAX_INSTRUCTION_LENGTH);
}

export function normalizePlaceholder(input: string | undefined): string {
    const placeholder = input ?? DEFAULT_PLACEHOLDER;

    if (placeholder.trim() !== placeholder || placeholder.length === 0) {
        throw new Error("The anomaly placeholder must be a nonempty string without surrounding whitespace.");
    }
    if (placeholder.length > 80) {
        throw new Error("The anomaly placeholder must not exceed 80 characters.");
    }
    if (/[^\x21-\x7E]/.test(placeholder)) {
        throw new Error("The anomaly placeholder must contain only visible printable ASCII characters.");
    }

    return placeholder;
}

export function normalizeAnomalyKind(input: string): AnomalyKind {
    if (!ALLOWED_ANOMALY_KINDS.includes(input as AnomalyKind)) {
        throw new Error(
            `The anomaly kind must be one of: ${ALLOWED_ANOMALY_KINDS.join(", ")}.`
        );
    }
    return input as AnomalyKind;
}

function countOccurrences(input: string, search: string): number {
    if (search.length === 0) return 0;
    let count = 0;
    let index = 0;
    while ((index = input.indexOf(search, index)) !== -1) {
        count += 1;
        index += search.length;
    }
    return count;
}

function assertExternalKnowledge(
    required: boolean,
    provenance: ExternalKnowledgeProvenance[] | undefined
): void {
    if (!required) return;
    if (provenance === undefined || provenance.length === 0) {
        throw new Error("External-knowledge anomalies require at least one provenance record.");
    }
    for (const [index, record] of provenance.entries()) {
        if (record.sourceId.trim().length === 0) {
            throw new Error(`External-knowledge provenance record ${index + 1} has an empty source ID.`);
        }
    }
}

export function buildAnomalousDocument(
    templateInput: string,
    anomalousPhraseInput: string,
    placeholderInput?: string
): string {
    const template = normalizeDocumentTemplate(templateInput);
    const anomalousPhrase = normalizeAnomalousPhrase(anomalousPhraseInput);
    const placeholder = normalizePlaceholder(placeholderInput);
    const placeholderCount = countOccurrences(template, placeholder);

    if (placeholderCount !== 1) {
        throw new Error(
            `The document template must contain exactly one ${JSON.stringify(placeholder)} placeholder.`
        );
    }
    if (template.replace(placeholder, "").includes(anomalousPhrase)) {
        throw new Error("The anomalous phrase must not already appear outside the placeholder.");
    }

    return template.replace(placeholder, anomalousPhrase);
}

export function createAnomalousPhrasePuzzle(
    spec: AnomalousPhrasePuzzleSpec
): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const solution = normalizeAnomalousPhraseSolution(spec.intendedSolution);
    const genre = normalizeAnomalousPhraseGenre(spec.genre);
    const normalityContext = normalizeNormalityContext(spec.normalityContext);
    const anomalousPhrase = normalizeAnomalousPhrase(spec.anomalousPhrase);
    const anomalyKind = normalizeAnomalyKind(spec.anomalyKind);
    const solverInstruction = normalizeSolverInstruction(spec.solverInstruction);
    const placeholder = normalizePlaceholder(spec.placeholder);
    const documentText = buildAnomalousDocument(
        spec.documentTemplate,
        anomalousPhrase,
        placeholder
    );
    const acceptedAlternatives = spec.acceptedAlternatives?.map(normalizeAnomalousPhraseSolution);
    const externalKnowledgeRequired = spec.externalKnowledgeRequired ?? false;
    assertExternalKnowledge(externalKnowledgeRequired, spec.externalKnowledgeProvenance);

    const documentHash = createHash("sha256").update(documentText, "utf8").digest("hex");
    const prompt = [
        solverInstruction,
        `Context: ${normalityContext}`,
        "Document:",
        documentText
    ].join("\n\n");

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "anomalous-phrase",
        inputs: [
            {
                key: "document_template",
                valueType: "natural-language-document-template",
                description: "The normal-looking document template containing one anomaly placeholder.",
                required: true,
                constraints: {
                    genre,
                    placeholder,
                    maximumCharacters: MAX_DOCUMENT_TEMPLATE_LENGTH,
                    ruleVersion: RULE_VERSION
                },
                value: normalizeDocumentTemplate(spec.documentTemplate)
            },
            {
                key: "anomalous_phrase",
                valueType: "semantic-anomaly",
                description: "The phrase, fact, entity, date, or location inserted as the semantic anomaly.",
                required: true,
                constraints: {
                    anomalyKind,
                    maximumCharacters: MAX_ANOMALOUS_PHRASE_LENGTH
                },
                value: anomalousPhrase
            },
            {
                key: "normality_context",
                valueType: "document-context",
                description: "Context needed to judge why the inserted phrase is anomalous.",
                required: true,
                constraints: { maximumCharacters: MAX_CONTEXT_LENGTH },
                value: normalityContext
            }
        ],
        outputs: [{
            key: "discovered_clue",
            valueType: "plain-text",
            description: "The text recovered by identifying the anomalous phrase or fact.",
            value: solution
        }],
        artifact: { kind: "text", mediaType: "text/plain", source: documentText },
        prompt,
        solution: {
            valueType: "text",
            canonical: solution,
            acceptedAlternatives,
            normalization: ["trim", "case-insensitive", "collapse-whitespace"]
        },
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: true, collapseWhitespace: true }
        },
        externalKnowledge: externalKnowledgeRequired
            ? { required: true, provenance: spec.externalKnowledgeProvenance! }
            : { required: false },
        extensions: {
            anomalousPhrase: {
                genre,
                anomalyKind,
                placeholder,
                ruleVersion: RULE_VERSION,
                solverInstruction,
                normalityContext,
                anomalousPhrase,
                documentSha256: documentHash
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    if (!documentText.includes(anomalousPhrase)) {
        throw new Error("Internal validation failed: document does not contain the anomaly.");
    }

    return puzzle;
}
