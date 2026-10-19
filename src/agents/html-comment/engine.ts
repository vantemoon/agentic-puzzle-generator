import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createSingleHtmlArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";


export interface HtmlCommentPuzzleSpec extends PuzzleGenerationSpec {
    visibleTitle: string;
    visibleBody: string;
    commentPrefix?: string;
    acceptedAlternatives?: string[];
}

const MAX_SOLUTION_LENGTH = 300;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1_000;
const MAX_COMMENT_PREFIX_LENGTH = 40;
const DEFAULT_COMMENT_PREFIX = "DEV NOTE";
const TEMPLATE_VERSION = "safe-static-html-comment-v1";

function normalizeInlineText(
    input: string,
    fieldName: string,
    maximumLength: number
): string {
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

export function normalizeHtmlCommentSolution(input: string): string {
    const normalized = normalizeInlineText(input, "hidden comment payload", MAX_SOLUTION_LENGTH);

    if (normalized.includes("--") || normalized.includes(">")) {
        throw new Error("The hidden comment payload must not contain '--' or '>'.");
    }

    return normalized;
}

export function normalizeVisibleTitle(input: string): string {
    return normalizeInlineText(input, "visible title", MAX_TITLE_LENGTH);
}

export function normalizeVisibleBody(input: string): string {
    return normalizeInlineText(input, "visible body", MAX_BODY_LENGTH);
}


export function normalizeCommentPrefix(input: string | undefined): string {
    const normalized = normalizeInlineText(
        input ?? DEFAULT_COMMENT_PREFIX,
        "comment prefix",
        MAX_COMMENT_PREFIX_LENGTH
    ).toUpperCase();

    if (normalized.includes("--") || normalized.includes(">")) {
        throw new Error("The comment prefix must not contain '--' or '>'.");
    }

    return normalized;
}


function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;

    const normalized = [...new Set(alternatives.map(normalizeHtmlCommentSolution))];
    return normalized.length > 0 ? normalized : undefined;
}

export function escapeHtmlText(input: string): string {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function buildHtmlCommentArtifact(options: {
    visibleTitle: string;
    visibleBody: string;
    hiddenPayload: string;
    commentPrefix: string;
}): string {

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
        `      <p>${escapeHtmlText(options.visibleBody)}</p>`,
        "    </main>",
        `    <!-- ${options.commentPrefix}: ${options.hiddenPayload} -->`,
        "  </body>",
        "</html>"
    ].join("\n");
}

export function extractHtmlComments(source: string): string[] {
    return [...source.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1].trim());
}

export function assertSafeStaticHtml(source: string): void {
    const lower = source.toLowerCase();

    const forbiddenTagPatterns = [
        /<\s*script\b/i,
        /<\s*iframe\b/i,
        /<\s*object\b/i,
        /<\s*embed\b/i,
        /<\s*link\b/i,
        /<\s*base\b/i
    ];
    for (const pattern of forbiddenTagPatterns) {
        if (pattern.test(source)) {
            throw new Error("HTML artifacts must be static and must not contain scripts or external-resource tags.");
        }
    }
    if (/\s+on[a-z]+\s*=/i.test(source)) {
        throw new Error("HTML artifacts must not contain event-handler attributes.");
    }
    if (lower.includes("javascript:")) {
        throw new Error("HTML artifacts must not contain javascript: URLs.");
    }
    if (/<[^>]+\s(?:src|href)\s*=\s*[\"']?https?:\/\//i.test(source)) {
        throw new Error("HTML artifacts must not load remote resources.");
    }
}


function assertSolutionNotVisible(
    solution: string,
    visibleTitle: string,
    visibleBody: string,
): void {
    const visibleText = [visibleTitle, visibleBody].join("\n");
    if (visibleText.includes(solution)) {
        throw new Error("The hidden comment payload must not appear in visible page text.");
    }
}

export function createHtmlCommentPuzzle(spec: HtmlCommentPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) {
        throw new Error("The puzzle ID must not be empty.");
    }

    const solution = normalizeHtmlCommentSolution(spec.intendedSolution);
    const visibleTitle = normalizeVisibleTitle(spec.visibleTitle);
    const visibleBody = normalizeVisibleBody(spec.visibleBody);
    const commentPrefix = normalizeCommentPrefix(spec.commentPrefix);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);
    assertSolutionNotVisible(solution, visibleTitle, visibleBody);

    const artifactSource = buildHtmlCommentArtifact({
        visibleTitle,
        visibleBody,
        hiddenPayload: solution,
        commentPrefix
    });

    assertSafeStaticHtml(artifactSource);

    const comments = extractHtmlComments(artifactSource);
    const expectedComment = `${commentPrefix}: ${solution}`;
    if (comments.length !== 1 || comments[0] !== expectedComment) {
        throw new Error("Internal validation failed: HTML artifact must contain exactly one intended comment.");
    }

    const prompt = "Open the webpage artifact and recover the hidden message.";

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
            key: "html_comment_payload",
            valueType: "html-comment-payload",
            description: "The message hidden in an HTML source comment.",
            required: true,
            constraints: {
                maximumCharacters: MAX_SOLUTION_LENGTH,
                disallows: ["--", ">"]
            },
            value: solution
        }
    ];

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "html-comment",
        inputs,
        outputs: [{
            key: "extracted_message",
            valueType: "plain-text",
            description: "The hidden message recovered from the HTML comment.",
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
            htmlComment: {
                templateVersion: TEMPLATE_VERSION,
                commentPrefix,
                artifactSha256: createHash("sha256").update(artifactSource, "utf8").digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
