import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createSingleHtmlArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";
import { assertSafeStaticHtml, escapeHtmlText } from "../html-comment/engine.js";

export type SourceCodeCarrier =
    | "html-attribute"
    | "css-custom-property"
    | "javascript-source"
    | "asset-reference"
    | "encoded-source-value";

export type SourceCodeRecognitionLevel = "explicit" | "indirect" | "contextual" | "hidden";

export interface SourceCodePuzzleSpec extends PuzzleGenerationSpec {
    visibleTitle: string;
    visibleBody: string;
    carrier: SourceCodeCarrier;
    recognitionLevel: SourceCodeRecognitionLevel;
    sourceInspectionHint?: string;
    codeLabel?: string;
    acceptedAlternatives?: string[];
}

const MAX_SOLUTION_LENGTH = 300;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1_000;
const MAX_HINT_LENGTH = 300;
const MAX_LABEL_LENGTH = 80;
const TEMPLATE_VERSION = "safe-static-source-code-v1";
const CARRIERS: readonly SourceCodeCarrier[] = [
    "html-attribute",
    "css-custom-property",
    "javascript-source",
    "asset-reference",
    "encoded-source-value"
];
const RECOGNITION_LEVELS: readonly SourceCodeRecognitionLevel[] = [
    "explicit",
    "indirect",
    "contextual",
    "hidden"
];

function normalizeInlineText(input: string, fieldName: string, maximumLength: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) throw new Error(`The ${fieldName} must not be empty.`);
    if (normalized.length > maximumLength) {
        throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    }
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(`The ${fieldName} may contain printable ASCII and common typographic punctuation.`);
    }
    return normalized;
}

export function normalizeSourceCodePayload(input: string): string {
    return normalizeInlineText(input, "source-code payload", MAX_SOLUTION_LENGTH);
}

export function normalizeVisibleTitle(input: string): string {
    return normalizeInlineText(input, "visible title", MAX_TITLE_LENGTH);
}

export function normalizeVisibleBody(input: string): string {
    return normalizeInlineText(input, "visible body", MAX_BODY_LENGTH);
}

export function normalizeSourceInspectionHint(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "source-inspection hint", MAX_HINT_LENGTH);
}

export function normalizeCodeLabel(input: string | undefined): string {
    return normalizeInlineText(input ?? "implementation-note", "code label", MAX_LABEL_LENGTH)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "implementation-note";
}

export function normalizeCarrier(input: string): SourceCodeCarrier {
    if (!CARRIERS.includes(input as SourceCodeCarrier)) {
        throw new Error(`The source-code carrier must be one of: ${CARRIERS.join(", ")}.`);
    }
    return input as SourceCodeCarrier;
}

export function normalizeRecognitionLevel(input: string): SourceCodeRecognitionLevel {
    if (!RECOGNITION_LEVELS.includes(input as SourceCodeRecognitionLevel)) {
        throw new Error(`The recognition level must be one of: ${RECOGNITION_LEVELS.join(", ")}.`);
    }
    return input as SourceCodeRecognitionLevel;
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;
    const normalized = [...new Set(alternatives.map(normalizeSourceCodePayload))];
    return normalized.length > 0 ? normalized : undefined;
}

function decodeHtmlAttribute(input: string): string {
    return input
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

function base64(input: string): string {
    return Buffer.from(input, "utf8").toString("base64");
}

function buildCarrierSource(carrier: SourceCodeCarrier, payload: string, codeLabel: string): string {
    const escapedPayload = escapeHtmlText(payload);
    const encodedPayload = base64(payload);

    switch (carrier) {
        case "html-attribute":
            return `    <meta data-puzzle-role="source-code-payload" data-${codeLabel}="${escapedPayload}">`;
        case "css-custom-property":
            return [
                "    <style data-puzzle-role=\"source-code-payload\">",
                `      :root { --${codeLabel}: "${escapedPayload}"; }`,
                "    </style>"
            ].join("\n");
        case "javascript-source":
            return [
                "    <template data-puzzle-role=\"source-code-payload\" data-source-kind=\"javascript\">",
                `      const ${codeLabel.replace(/-/g, "_")} = \"${escapedPayload}\";`,
                "      function readImplementationNote() { return null; }",
                "    </template>"
            ].join("\n");
        case "asset-reference":
            return `    <meta data-puzzle-role="source-code-payload" data-unused-asset="assets/${encodeURIComponent(payload)}.svg">`;
        case "encoded-source-value":
            return `    <meta data-puzzle-role="source-code-payload" data-encoding="base64" data-code-payload="${encodedPayload}">`;
    }
}

export function buildSourceCodeHtmlArtifact(options: {
    visibleTitle: string;
    visibleBody: string;
    payload: string;
    carrier: SourceCodeCarrier;
    recognitionLevel: SourceCodeRecognitionLevel;
    sourceInspectionHint?: string;
    codeLabel: string;
}): string {
    const hintParagraph = options.sourceInspectionHint === undefined
        ? ""
        : `\n      <p class=\"hint\">${escapeHtmlText(options.sourceInspectionHint)}</p>`;
    const carrierSource = buildCarrierSource(options.carrier, options.payload, options.codeLabel);

    return [
        "<!doctype html>",
        "<html lang=\"en\">",
        "  <head>",
        "    <meta charset=\"utf-8\">",
        `    <title>${escapeHtmlText(options.visibleTitle)}</title>`,
        carrierSource,
        "  </head>",
        "  <body>",
        "    <main>",
        `      <h1>${escapeHtmlText(options.visibleTitle)}</h1>`,
        `      <p>${escapeHtmlText(options.visibleBody)}</p>${hintParagraph}`,
        "    </main>",
        "  </body>",
        "</html>"
    ].join("\n");
}

export function extractSourceCodePayloads(source: string, carrier: SourceCodeCarrier): string[] {
    switch (carrier) {
        case "html-attribute":
            return [...source.matchAll(/<meta\b(?=[^>]*data-puzzle-role="source-code-payload")[^>]*\sdata-[a-z0-9_-]+="([^"]*)"[^>]*>/gi)]
                .map((match) => decodeHtmlAttribute(match[1]));
        case "css-custom-property":
            return [...source.matchAll(/--[a-z0-9_-]+:\s*"([^"]*)"/gi)]
                .map((match) => decodeHtmlAttribute(match[1]));
        case "javascript-source":
            return [...source.matchAll(/const\s+[a-z0-9_]+\s*=\s*"([^"]*)"/gi)]
                .map((match) => decodeHtmlAttribute(match[1]));
        case "asset-reference":
            return [...source.matchAll(/data-unused-asset="assets\/([^"/]+)\.svg"/gi)]
                .map((match) => decodeURIComponent(match[1]));
        case "encoded-source-value":
            return [...source.matchAll(/data-code-payload="([A-Za-z0-9+/=]+)"/g)]
                .map((match) => Buffer.from(match[1], "base64").toString("utf8"));
    }
}

function assertRecognitionHintPolicy(
    recognitionLevel: SourceCodeRecognitionLevel,
    sourceInspectionHint: string | undefined
): void {
    if (recognitionLevel === "explicit" && sourceInspectionHint === undefined) {
        throw new Error("Explicit source-code puzzles require a source-inspection hint.");
    }
    if (recognitionLevel === "hidden" && sourceInspectionHint !== undefined) {
        throw new Error("Hidden source-code puzzles must not include a source-inspection hint.");
    }
}

function assertSolutionNotVisible(
    solution: string,
    visibleTitle: string,
    visibleBody: string,
    sourceInspectionHint: string | undefined
): void {
    if ([visibleTitle, visibleBody, sourceInspectionHint ?? ""].join("\n").includes(solution)) {
        throw new Error("The source-code payload must not appear in visible page text.");
    }
}

export function createSourceCodePuzzle(spec: SourceCodePuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");

    const solution = normalizeSourceCodePayload(spec.intendedSolution);
    const visibleTitle = normalizeVisibleTitle(spec.visibleTitle);
    const visibleBody = normalizeVisibleBody(spec.visibleBody);
    const carrier = normalizeCarrier(spec.carrier);
    const recognitionLevel = normalizeRecognitionLevel(spec.recognitionLevel);
    const sourceInspectionHint = normalizeSourceInspectionHint(spec.sourceInspectionHint);
    const codeLabel = normalizeCodeLabel(spec.codeLabel);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);

    assertRecognitionHintPolicy(recognitionLevel, sourceInspectionHint);
    assertSolutionNotVisible(solution, visibleTitle, visibleBody, sourceInspectionHint);

    const artifactSource = buildSourceCodeHtmlArtifact({
        visibleTitle,
        visibleBody,
        payload: solution,
        carrier,
        recognitionLevel,
        sourceInspectionHint,
        codeLabel
    });
    assertSafeStaticHtml(artifactSource);

    const payloads = extractSourceCodePayloads(artifactSource, carrier);
    if (payloads.length !== 1 || payloads[0] !== solution) {
        throw new Error("Internal validation failed: HTML source must contain exactly one intended source-code payload.");
    }

    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solutionRecord = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: solution, normalization }
        : { valueType: "text" as const, canonical: solution, acceptedAlternatives, normalization };

    const inputs: PrivatePuzzleInstance["inputs"] = [
        {
            key: "visible_page_text",
            valueType: "html-visible-text",
            description: "The text visible in the rendered webpage.",
            required: true,
            value: { title: visibleTitle, body: visibleBody }
        },
        {
            key: "source_code_payload",
            valueType: "source-code-hidden-text",
            description: "The hidden message embedded in static HTML, CSS, JavaScript-like source text, or source references.",
            required: true,
            value: solution
        },
        {
            key: "source_code_carrier",
            valueType: "source-code-carrier",
            description: "The kind of source material that carries the hidden message.",
            required: true,
            value: carrier
        }
    ];

    if (sourceInspectionHint !== undefined) {
        inputs.push({
            key: "source_inspection_hint",
            valueType: "source-inspection-hint",
            description: "A visible hint suggesting source-code inspection.",
            required: false,
            value: sourceInspectionHint
        });
    }

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "source-code",
        inputs,
        outputs: [{
            key: "extracted_message",
            valueType: "plain-text",
            description: "The hidden message recovered from static source code.",
            value: solution
        }],
        artifact: createSingleHtmlArtifact(artifactSource),
        prompt: "Open the webpage artifact and recover the message hidden in the page source code.",
        solution: solutionRecord,
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: false, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            sourceCode: {
                templateVersion: TEMPLATE_VERSION,
                carrier,
                recognitionLevel,
                codeLabel,
                requiresJavaScriptExecution: false,
                liveNavigationSupported: false,
                artifactSha256: createHash("sha256").update(artifactSource, "utf8").digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
