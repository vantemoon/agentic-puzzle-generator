import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createSingleHtmlArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";
import { assertSafeStaticHtml, escapeHtmlText } from "../html-comment/engine.js";
export { assertSafeStaticHtml, escapeHtmlText } from "../html-comment/engine.js";

export type DomElementRecognitionLevel =
    | "explicit"
    | "indirect"
    | "contextual"
    | "hidden";

export type DomElementHideStrategy =
    | "hidden-attribute"
    | "display-none"
    | "visually-hidden"
    | "color-match";

export type DomElementTag = "p" | "span" | "div";

export interface DomElementPuzzleSpec extends PuzzleGenerationSpec {
    visibleTitle: string;
    visibleBody: string;
    recognitionLevel: DomElementRecognitionLevel;
    hideStrategy: DomElementHideStrategy;
    domInspectionHint?: string;
    elementTag?: DomElementTag;
    acceptedAlternatives?: string[];
}

const MAX_SOLUTION_LENGTH = 300;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1_000;
const MAX_HINT_LENGTH = 300;
const TEMPLATE_VERSION = "safe-static-hidden-dom-element-v1";
const PAYLOAD_ROLE = "hidden-payload";
const RECOGNITION_LEVELS: readonly DomElementRecognitionLevel[] = [
    "explicit",
    "indirect",
    "contextual",
    "hidden"
];
const HIDE_STRATEGIES: readonly DomElementHideStrategy[] = [
    "hidden-attribute",
    "display-none",
    "visually-hidden",
    "color-match"
];
const ELEMENT_TAGS: readonly DomElementTag[] = ["p", "span", "div"];

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

export function normalizeDomElementPayload(input: string): string {
    return normalizeInlineText(input, "hidden DOM payload", MAX_SOLUTION_LENGTH);
}

export function normalizeVisibleTitle(input: string): string {
    return normalizeInlineText(input, "visible title", MAX_TITLE_LENGTH);
}

export function normalizeVisibleBody(input: string): string {
    return normalizeInlineText(input, "visible body", MAX_BODY_LENGTH);
}

export function normalizeDomInspectionHint(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "DOM-inspection hint", MAX_HINT_LENGTH);
}

export function normalizeRecognitionLevel(input: string): DomElementRecognitionLevel {
    if (!RECOGNITION_LEVELS.includes(input as DomElementRecognitionLevel)) {
        throw new Error(
            `The recognition level must be one of: ${RECOGNITION_LEVELS.join(", ")}.`
        );
    }
    return input as DomElementRecognitionLevel;
}

export function normalizeHideStrategy(input: string): DomElementHideStrategy {
    if (!HIDE_STRATEGIES.includes(input as DomElementHideStrategy)) {
        throw new Error(`The hide strategy must be one of: ${HIDE_STRATEGIES.join(", ")}.`);
    }
    return input as DomElementHideStrategy;
}

export function normalizeElementTag(input: string | undefined): DomElementTag {
    if (input === undefined) return "p";
    if (!ELEMENT_TAGS.includes(input as DomElementTag)) {
        throw new Error(`The element tag must be one of: ${ELEMENT_TAGS.join(", ")}.`);
    }
    return input as DomElementTag;
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;

    const normalized = [...new Set(alternatives.map(normalizeDomElementPayload))];
    return normalized.length > 0 ? normalized : undefined;
}

function decodeHtmlText(input: string): string {
    return input
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

function cssForStrategy(strategy: DomElementHideStrategy): string {
    switch (strategy) {
        case "hidden-attribute":
            return "";
        case "display-none":
            return [
                "    <style>",
                "      .hidden-payload { display: none; }",
                "    </style>"
            ].join("\n");
        case "visually-hidden":
            return [
                "    <style>",
                "      .hidden-payload {",
                "        position: absolute;",
                "        left: -10000px;",
                "        width: 1px;",
                "        height: 1px;",
                "        overflow: hidden;",
                "      }",
                "    </style>"
            ].join("\n");
        case "color-match":
            return [
                "    <style>",
                "      .hidden-payload { color: #ffffff; background-color: #ffffff; }",
                "    </style>"
            ].join("\n");
    }
}

function hiddenElementAttributes(strategy: DomElementHideStrategy): string {
    const shared = `data-puzzle-role=\"${PAYLOAD_ROLE}\"`;
    switch (strategy) {
        case "hidden-attribute":
            return `hidden ${shared}`;
        case "display-none":
        case "visually-hidden":
        case "color-match":
            return `class=\"hidden-payload\" ${shared}`;
    }
}

export function buildDomElementHtmlArtifact(options: {
    visibleTitle: string;
    visibleBody: string;
    hiddenPayload: string;
    recognitionLevel: DomElementRecognitionLevel;
    hideStrategy: DomElementHideStrategy;
    domInspectionHint?: string;
    elementTag: DomElementTag;
}): string {
    const styleBlock = cssForStrategy(options.hideStrategy);
    const styleLines = styleBlock.length === 0 ? [] : [styleBlock];
    const hintParagraph = options.domInspectionHint === undefined
        ? ""
        : `\n      <p class=\"hint\">${escapeHtmlText(options.domInspectionHint)}</p>`;
    const attributes = hiddenElementAttributes(options.hideStrategy);
    const hiddenElement = `    <${options.elementTag} ${attributes}>${escapeHtmlText(options.hiddenPayload)}</${options.elementTag}>`;

    return [
        "<!doctype html>",
        "<html lang=\"en\">",
        "  <head>",
        "    <meta charset=\"utf-8\">",
        `    <title>${escapeHtmlText(options.visibleTitle)}</title>`,
        ...styleLines,
        "  </head>",
        "  <body>",
        "    <main>",
        `      <h1>${escapeHtmlText(options.visibleTitle)}</h1>`,
        `      <p>${escapeHtmlText(options.visibleBody)}</p>${hintParagraph}`,
        "    </main>",
        hiddenElement,
        "  </body>",
        "</html>"
    ].join("\n");
}

export function extractHiddenDomPayloads(source: string): string[] {
    const pattern = new RegExp(
        `<(?:p|span|div)\\b(?=[^>]*data-puzzle-role=\\"${PAYLOAD_ROLE}\\")[^>]*>([\\s\\S]*?)<\\/(?:p|span|div)>`,
        "gi"
    );

    return [...source.matchAll(pattern)].map((match) => decodeHtmlText(match[1].trim()));
}

function assertRecognitionHintPolicy(
    recognitionLevel: DomElementRecognitionLevel,
    domInspectionHint: string | undefined
): void {
    if (recognitionLevel === "explicit" && domInspectionHint === undefined) {
        throw new Error("Explicit DOM-element puzzles require a DOM-inspection hint.");
    }
    if (recognitionLevel === "hidden" && domInspectionHint !== undefined) {
        throw new Error("Hidden DOM-element puzzles must not include a DOM-inspection hint.");
    }
}

function assertSolutionNotVisible(
    solution: string,
    visibleTitle: string,
    visibleBody: string,
    domInspectionHint: string | undefined
): void {
    const visibleText = [visibleTitle, visibleBody, domInspectionHint ?? ""].join("\n");
    if (visibleText.includes(solution)) {
        throw new Error("The hidden DOM payload must not appear in visible page text.");
    }
}

export function createDomElementPuzzle(spec: DomElementPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const solution = normalizeDomElementPayload(spec.intendedSolution);
    const visibleTitle = normalizeVisibleTitle(spec.visibleTitle);
    const visibleBody = normalizeVisibleBody(spec.visibleBody);
    const recognitionLevel = normalizeRecognitionLevel(spec.recognitionLevel);
    const hideStrategy = normalizeHideStrategy(spec.hideStrategy);
    const domInspectionHint = normalizeDomInspectionHint(spec.domInspectionHint);
    const elementTag = normalizeElementTag(spec.elementTag);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);

    assertRecognitionHintPolicy(recognitionLevel, domInspectionHint);
    assertSolutionNotVisible(solution, visibleTitle, visibleBody, domInspectionHint);

    const artifactSource = buildDomElementHtmlArtifact({
        visibleTitle,
        visibleBody,
        hiddenPayload: solution,
        recognitionLevel,
        hideStrategy,
        domInspectionHint,
        elementTag
    });

    assertSafeStaticHtml(artifactSource);

    const payloads = extractHiddenDomPayloads(artifactSource);
    if (payloads.length !== 1 || payloads[0] !== solution) {
        throw new Error(
            "Internal validation failed: HTML artifact must contain exactly one intended hidden DOM payload."
        );
    }

    const prompt = "Open the webpage artifact and recover the hidden DOM message.";
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
            description: "The text visible in the rendered webpage.",
            required: true,
            constraints: {
                maximumTitleCharacters: MAX_TITLE_LENGTH,
                maximumBodyCharacters: MAX_BODY_LENGTH,
                htmlEscaped: true
            },
            value: { title: visibleTitle, body: visibleBody }
        },
        {
            key: "hidden_dom_payload",
            valueType: "hidden-dom-text",
            description: "The message stored in a DOM element that is not normally visible.",
            required: true,
            constraints: { maximumCharacters: MAX_SOLUTION_LENGTH, htmlEscaped: true },
            value: solution
        },
        {
            key: "hide_strategy",
            valueType: "dom-hide-strategy",
            description: "The static HTML or CSS mechanism used to hide the payload.",
            required: true,
            constraints: { supportedStrategies: [...HIDE_STRATEGIES] },
            value: hideStrategy
        }
    ];

    if (domInspectionHint !== undefined) {
        inputs.push({
            key: "dom_inspection_hint",
            valueType: "dom-inspection-hint",
            description: "A visible hint suggesting that the solver should inspect the DOM or page structure.",
            required: false,
            constraints: { maximumCharacters: MAX_HINT_LENGTH },
            value: domInspectionHint
        });
    }

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "dom-element",
        inputs,
        outputs: [{
            key: "extracted_message",
            valueType: "plain-text",
            description: "The hidden message recovered from the hidden DOM element.",
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
            domElement: {
                templateVersion: TEMPLATE_VERSION,
                payloadRole: PAYLOAD_ROLE,
                recognitionLevel,
                hideStrategy,
                elementTag,
                hasDomInspectionHint: domInspectionHint !== undefined,
                artifactSha256: createHash("sha256").update(artifactSource, "utf8").digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
