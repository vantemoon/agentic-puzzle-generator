import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createSingleHtmlArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";
import { assertSafeStaticHtml, escapeHtmlText } from "../html-comment/engine.js";
export { assertSafeStaticHtml, escapeHtmlText } from "../html-comment/engine.js";

export type AltTextRecognitionLevel =
    | "explicit"
    | "indirect"
    | "contextual"
    | "hidden";

export interface AltTextPuzzleSpec extends PuzzleGenerationSpec {
    visibleTitle: string;
    visibleBody: string;
    imageLabel: string;
    recognitionLevel: AltTextRecognitionLevel;
    altInspectionHint?: string;
    imageCaption?: string;
    acceptedAlternatives?: string[];
}

const MAX_SOLUTION_LENGTH = 300;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1_000;
const MAX_IMAGE_LABEL_LENGTH = 120;
const MAX_HINT_LENGTH = 300;
const MAX_CAPTION_LENGTH = 300;
const TEMPLATE_VERSION = "safe-static-alt-text-v1";
const PAYLOAD_ROLE = "alt-text-payload";
const RECOGNITION_LEVELS: readonly AltTextRecognitionLevel[] = [
    "explicit",
    "indirect",
    "contextual",
    "hidden"
];

function normalizeInlineText(input: string, fieldName: string, maximumLength: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");

    if (normalized.length === 0) {
        throw new Error(`The ${fieldName} must not be empty.`);
    }
    if (normalized.length > maximumLength) {
        throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    }
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(
            `The ${fieldName} may contain printable ASCII and common typographic punctuation.`
        );
    }

    return normalized;
}

export function normalizeAltTextPayload(input: string): string {
    return normalizeInlineText(input, "image alt-text payload", MAX_SOLUTION_LENGTH);
}

export function normalizeVisibleTitle(input: string): string {
    return normalizeInlineText(input, "visible title", MAX_TITLE_LENGTH);
}

export function normalizeVisibleBody(input: string): string {
    return normalizeInlineText(input, "visible body", MAX_BODY_LENGTH);
}

export function normalizeImageLabel(input: string): string {
    return normalizeInlineText(input, "image label", MAX_IMAGE_LABEL_LENGTH);
}

export function normalizeAltInspectionHint(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "alt-text inspection hint", MAX_HINT_LENGTH);
}

export function normalizeImageCaption(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "image caption", MAX_CAPTION_LENGTH);
}

export function normalizeRecognitionLevel(input: string): AltTextRecognitionLevel {
    if (!RECOGNITION_LEVELS.includes(input as AltTextRecognitionLevel)) {
        throw new Error(
            `The recognition level must be one of: ${RECOGNITION_LEVELS.join(", ")}.`
        );
    }
    return input as AltTextRecognitionLevel;
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;

    const normalized = [...new Set(alternatives.map(normalizeAltTextPayload))];
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

function buildSvgDataUrl(imageLabel: string): string {
    const svg = [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"420\" height=\"180\" role=\"img\">",
        "  <rect width=\"100%\" height=\"100%\" rx=\"18\" fill=\"#f5f5f5\"/>",
        "  <rect x=\"18\" y=\"18\" width=\"384\" height=\"144\" rx=\"12\" fill=\"#ffffff\" stroke=\"#999999\"/>",
        `  <text x=\"210\" y=\"96\" text-anchor=\"middle\" font-family=\"Arial, sans-serif\" font-size=\"24\" fill=\"#333333\">${escapeHtmlText(imageLabel)}</text>`,
        "</svg>"
    ].join("");

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function buildAltTextHtmlArtifact(options: {
    visibleTitle: string;
    visibleBody: string;
    imageLabel: string;
    hiddenPayload: string;
    recognitionLevel: AltTextRecognitionLevel;
    altInspectionHint?: string;
    imageCaption?: string;
}): string {
    const hintParagraph = options.altInspectionHint === undefined
        ? ""
        : `\n      <p class=\"hint\">${escapeHtmlText(options.altInspectionHint)}</p>`;
    const caption = options.imageCaption === undefined
        ? ""
        : `\n        <figcaption>${escapeHtmlText(options.imageCaption)}</figcaption>`;
    const imageSource = buildSvgDataUrl(options.imageLabel);

    return [
        "<!doctype html>",
        "<html lang=\"en\">",
        "  <head>",
        "    <meta charset=\"utf-8\">",
        `    <title>${escapeHtmlText(options.visibleTitle)}</title>`,
        "  </head>",
        "  <body>",
        "    <main>",
        `      <h1>${escapeHtmlText(options.visibleTitle)}</h1>`,
        `      <p>${escapeHtmlText(options.visibleBody)}</p>${hintParagraph}`,
        "      <figure>",
        `        <img data-puzzle-role=\"${PAYLOAD_ROLE}\" src=\"${imageSource}\" alt=\"${escapeHtmlText(options.hiddenPayload)}\">${caption}`,
        "      </figure>",
        "    </main>",
        "  </body>",
        "</html>"
    ].join("\n");
}

export function extractAltTextPayloads(source: string): string[] {
    const pattern = new RegExp(
        `<img\\b(?=[^>]*data-puzzle-role=\\"${PAYLOAD_ROLE}\\")[^>]*\\salt=\\"([^\\"]*)\\"[^>]*>`,
        "gi"
    );

    return [...source.matchAll(pattern)].map((match) => decodeHtmlAttribute(match[1]));
}

function assertRecognitionHintPolicy(
    recognitionLevel: AltTextRecognitionLevel,
    altInspectionHint: string | undefined
): void {
    if (recognitionLevel === "explicit" && altInspectionHint === undefined) {
        throw new Error("Explicit alt-text puzzles require an alt-text inspection hint.");
    }
    if (recognitionLevel === "hidden" && altInspectionHint !== undefined) {
        throw new Error("Hidden alt-text puzzles must not include an alt-text inspection hint.");
    }
}

function assertSolutionNotVisible(options: {
    solution: string;
    visibleTitle: string;
    visibleBody: string;
    imageLabel: string;
    altInspectionHint?: string;
    imageCaption?: string;
}): void {
    const visibleText = [
        options.visibleTitle,
        options.visibleBody,
        options.imageLabel,
        options.altInspectionHint ?? "",
        options.imageCaption ?? ""
    ].join("\n");
    if (visibleText.includes(options.solution)) {
        throw new Error("The alt-text payload must not appear in visible page or image text.");
    }
}

const CONSISTENCY_STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "in",
    "into", "is", "it", "its", "of", "on", "one", "or", "page", "the", "this", "to",
    "with"
]);

function contentTokens(input: string): Set<string> {
    const tokens = input.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    return new Set(tokens.filter((token) => token.length > 2 && !CONSISTENCY_STOPWORDS.has(token)));
}

export function assertImageContextConsistency(options: {
    visibleTitle: string;
    visibleBody: string;
    imageLabel: string;
    imageCaption?: string;
}): void {
    const imageTokens = contentTokens(options.imageLabel);
    const contextTokens = contentTokens([
        options.visibleTitle,
        options.visibleBody,
        options.imageCaption ?? ""
    ].join(" "));

    const hasSharedToken = [...imageTokens].some((token) => contextTokens.has(token));
    if (!hasSharedToken) {
        throw new Error(
            "The image label must share at least one meaningful word with the visible title, body, or caption."
        );
    }
}

export function createAltTextPuzzle(spec: AltTextPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const solution = normalizeAltTextPayload(spec.intendedSolution);
    const visibleTitle = normalizeVisibleTitle(spec.visibleTitle);
    const visibleBody = normalizeVisibleBody(spec.visibleBody);
    const imageLabel = normalizeImageLabel(spec.imageLabel);
    const recognitionLevel = normalizeRecognitionLevel(spec.recognitionLevel);
    const altInspectionHint = normalizeAltInspectionHint(spec.altInspectionHint);
    const imageCaption = normalizeImageCaption(spec.imageCaption);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);

    assertRecognitionHintPolicy(recognitionLevel, altInspectionHint);
    assertSolutionNotVisible({
        solution,
        visibleTitle,
        visibleBody,
        imageLabel,
        altInspectionHint,
        imageCaption
    });
    assertImageContextConsistency({ visibleTitle, visibleBody, imageLabel, imageCaption });

    const artifactSource = buildAltTextHtmlArtifact({
        visibleTitle,
        visibleBody,
        imageLabel,
        hiddenPayload: solution,
        recognitionLevel,
        altInspectionHint,
        imageCaption
    });

    assertSafeStaticHtml(artifactSource);

    const payloads = extractAltTextPayloads(artifactSource);
    if (payloads.length !== 1 || payloads[0] !== solution) {
        throw new Error(
            "Internal validation failed: HTML artifact must contain exactly one intended alt-text payload."
        );
    }

    const prompt = "Open the webpage artifact and recover the image alt-text message.";
    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solutionRecord = acceptedAlternatives === undefined
        ? {
            valueType: "text" as const,
            canonical: solution,
            normalization
        }
        : {
            valueType: "text" as const,
            canonical: solution,
            acceptedAlternatives,
            normalization
        };

    const inputs: PrivatePuzzleInstance["inputs"] = [
        {
            key: "visible_page_text",
            valueType: "html-visible-text",
            description: "The text and image label visible in the rendered webpage.",
            required: true,
            constraints: {
                maximumTitleCharacters: MAX_TITLE_LENGTH,
                maximumBodyCharacters: MAX_BODY_LENGTH,
                maximumImageLabelCharacters: MAX_IMAGE_LABEL_LENGTH,
                htmlEscaped: true
            },
            value: { title: visibleTitle, body: visibleBody, imageLabel, imageCaption }
        },
        {
            key: "image_alt_payload",
            valueType: "image-alt-text",
            description: "The message stored in the image alt attribute.",
            required: true,
            constraints: { maximumCharacters: MAX_SOLUTION_LENGTH, htmlAttributeEscaped: true },
            value: solution
        }
    ];

    if (altInspectionHint !== undefined) {
        inputs.push({
            key: "alt_inspection_hint",
            valueType: "alt-text-inspection-hint",
            description: "A visible hint suggesting image metadata, accessibility text, or alt-text inspection.",
            required: false,
            constraints: { maximumCharacters: MAX_HINT_LENGTH },
            value: altInspectionHint
        });
    }

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "alt-text",
        inputs,
        outputs: [{
            key: "extracted_message",
            valueType: "plain-text",
            description: "The hidden message recovered from the image alt text.",
            value: solution
        }],
        artifact: createSingleHtmlArtifact(artifactSource),
        prompt,
        solution: solutionRecord,
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: false, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            altText: {
                templateVersion: TEMPLATE_VERSION,
                payloadRole: PAYLOAD_ROLE,
                recognitionLevel,
                hasAltInspectionHint: altInspectionHint !== undefined,
                hasImageCaption: imageCaption !== undefined,
                imageSourceKind: "inline-svg-data-url",
                artifactSha256: createHash("sha256").update(artifactSource, "utf8").digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
