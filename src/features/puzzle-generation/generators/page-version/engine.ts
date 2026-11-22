import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createHtmlArtifact,
    type HtmlPuzzleArtifactFile,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../../../shared/artifacts/types.js";

export type PageVersionChangeKind =
    | "added-section"
    | "changed-field"
    | "removed-content"
    | "removed-redaction";

export interface PageVersionPuzzleSpec extends PuzzleGenerationSpec {
    pageTitle: string;
    baselineBody: string;
    currentBody: string;
    changeKind: PageVersionChangeKind;
    baselineDate: string;
    currentDate: string;
    baselineLabel?: string;
    currentLabel?: string;
    acceptedAlternatives?: string[];
}

const MAX_SOLUTION_LENGTH = 300;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1_000;
const MAX_LABEL_LENGTH = 60;
const TEMPLATE_VERSION = "safe-static-page-version-v2";
const CHANGE_KINDS: readonly PageVersionChangeKind[] = [
    "added-section",
    "changed-field",
    "removed-content",
    "removed-redaction"
];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeInlineText(input: string, fieldName: string, maximumLength: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) throw new Error(`The ${fieldName} must not be empty.`);
    if (normalized.length > maximumLength) throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(`The ${fieldName} may contain printable ASCII and common typographic punctuation.`);
    }
    return normalized;
}

export function normalizePageVersionSolution(input: string): string {
    return normalizeInlineText(input, "page-version payload", MAX_SOLUTION_LENGTH);
}

export function normalizePageVersionTitle(input: string): string {
    return normalizeInlineText(input, "page title", MAX_TITLE_LENGTH);
}

export function normalizePageVersionBody(input: string, fieldName: string): string {
    return normalizeInlineText(input, fieldName, MAX_BODY_LENGTH);
}


export function normalizeVersionLabel(input: string | undefined, fallback: string): string {
    const normalized = normalizeInlineText(input ?? fallback, "version label", MAX_LABEL_LENGTH);
    if (/\b(?:baseline|current)\b/i.test(normalized)) {
        throw new Error("Player-facing version labels must not use baseline or current terminology.");
    }
    return normalized;
}

export function normalizeVersionDate(input: string, fieldName: string): string {
    const normalized = input.trim();
    if (!ISO_DATE_PATTERN.test(normalized)) {
        throw new Error(`The ${fieldName} must use YYYY-MM-DD format.`);
    }
    const [year, month, day] = normalized.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day) {
        throw new Error(`The ${fieldName} must be a real calendar date.`);
    }
    return normalized;
}

function formatVersionDate(input: string): string {
    return new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC"
    }).format(new Date(`${input}T00:00:00Z`));
}


export function normalizePageVersionChangeKind(input: string): PageVersionChangeKind {
    if (!CHANGE_KINDS.includes(input as PageVersionChangeKind)) {
        throw new Error(`The change kind must be one of: ${CHANGE_KINDS.join(", ")}.`);
    }
    return input as PageVersionChangeKind;
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;
    const normalized = [...new Set(alternatives.map(normalizePageVersionSolution))];
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

export function assertSafeStaticHtml(source: string): void {
    const lower = source.toLowerCase();
    const forbiddenTagPatterns = [
        /<\s*script\b/i,
        /<\s*iframe\b/i,
        /<\s*object\b/i,
        /<\s*embed\b/i,
        /<\s*link\b/i,
        /<\s*base\b/i,
        /<\s*a\b/i
    ];
    for (const pattern of forbiddenTagPatterns) {
        if (pattern.test(source)) throw new Error("HTML artifacts must be static and must not contain scripts, links, or external-resource tags.");
    }
    if (/\s+on[a-z]+\s*=/i.test(source)) throw new Error("HTML artifacts must not contain event-handler attributes.");
    if (lower.includes("javascript:")) throw new Error("HTML artifacts must not contain javascript: URLs.");
    if (/<[^>]+\s(?:src|href)\s*=\s*[\"']?https?:\/\//i.test(source)) throw new Error("HTML artifacts must not load remote resources.");
}


function assertSolutionNotInStableText(solution: string, values: string[]): void {
    const stableText = values.join("\n");
    if (stableText.includes(solution)) {
        throw new Error("The page-version payload must not appear in stable visible text.");
    }
}

function markedVersionBody(body: string, payload: string): string | undefined {
    const firstIndex = body.indexOf(payload);
    if (firstIndex < 0) return undefined;
    if (body.indexOf(payload, firstIndex + payload.length) >= 0) {
        throw new Error("A page-version body must contain the payload at most once.");
    }
    return [
        escapeHtmlText(body.slice(0, firstIndex)),
        `<span data-puzzle-role="page-version-payload">${escapeHtmlText(payload)}</span>`,
        escapeHtmlText(body.slice(firstIndex + payload.length))
    ].join("");
}

function buildVersionBody(options: {
    label: string;
    body: string;
    payload?: string;
    changeKind: PageVersionChangeKind;
    isCurrent: boolean;
}): string {
    const markedBody = options.payload !== undefined
        ? markedVersionBody(options.body, options.payload)
        : undefined;
    const bodyParagraph = `      <p>${markedBody ?? escapeHtmlText(options.body)}</p>`;
    if (options.changeKind === "removed-content") {
        return bodyParagraph;
    }
    if (!options.isCurrent) {
        if (options.changeKind === "changed-field") {
            return [bodyParagraph, "      <dl>", "        <dt>Release marker</dt>", "        <dd>Pending review</dd>", "      </dl>"].join("\n");
        }
        if (options.changeKind === "removed-redaction") {
            return [bodyParagraph, "      <p>Access note: [redacted in this version]</p>"].join("\n");
        }
        return bodyParagraph;
    }

    // A level blueprint may describe the complete current page and naturally
    // include the changed value. Mark that occurrence as the payload instead of
    // adding a second copy of the answer elsewhere in the document.
    if (markedBody !== undefined) return bodyParagraph;

    const payload = escapeHtmlText(options.payload ?? "");
    if (options.changeKind === "changed-field") {
        return [bodyParagraph, "      <dl>", "        <dt>Release marker</dt>", `        <dd data-puzzle-role=\"page-version-payload\">${payload}</dd>`, "      </dl>"].join("\n");
    }
    if (options.changeKind === "removed-redaction") {
        return [bodyParagraph, `      <p>Access note: <span data-puzzle-role=\"page-version-payload\">${payload}</span></p>`].join("\n");
    }
    return [bodyParagraph, "      <section aria-label=\"Added content\">", "        <h2>Revision note</h2>", `        <p data-puzzle-role=\"page-version-payload\">${payload}</p>`, "      </section>"].join("\n");
}

export function buildVersionPage(options: {
    title: string;
    label: string;
    date: string;
    body: string;
    payload?: string;
    changeKind: PageVersionChangeKind;
    isCurrent: boolean;
}): string {
    return [
        "<!doctype html>",
        "<html lang=\"en\">",
        "  <head>",
        "    <meta charset=\"utf-8\">",
        `    <title>${escapeHtmlText(options.title)} — ${escapeHtmlText(options.date)}</title>`,
        "  </head>",
        "  <body>",
        "    <main>",
        `      <h1>${escapeHtmlText(options.title)}</h1>`,
        `      <p class=\"version-label\"><time datetime=\"${escapeHtmlText(options.date)}\">${escapeHtmlText(formatVersionDate(options.date))}</time> — ${escapeHtmlText(options.label)}</p>`,
        buildVersionBody(options),
        "    </main>",
        "  </body>",
        "</html>"
    ].join("\n");
}

export function buildIndexPage(options: {
    title: string;
    baselinePath: string;
    currentPath: string;
    baselineLabel: string;
    currentLabel: string;
    baselineDate: string;
    currentDate: string;
}): string {
    return [
        "<!doctype html>",
        "<html lang=\"en\">",
        "  <head>",
        "    <meta charset=\"utf-8\">",
        `    <title>${escapeHtmlText(options.title)} — page history</title>`,
        "  </head>",
        "  <body>",
        "    <main>",
        `      <h1>${escapeHtmlText(options.title)} page history</h1>`,
        "      <p>Two dated snapshots are available for comparison.</p>",
        `      <p><time datetime=\"${escapeHtmlText(options.currentDate)}\">${escapeHtmlText(formatVersionDate(options.currentDate))}</time> — ${escapeHtmlText(options.currentLabel)}: <code>${escapeHtmlText(options.currentPath)}</code></p>`,
        `      <p><time datetime=\"${escapeHtmlText(options.baselineDate)}\">${escapeHtmlText(formatVersionDate(options.baselineDate))}</time> — ${escapeHtmlText(options.baselineLabel)}: <code>${escapeHtmlText(options.baselinePath)}</code></p>`,
        "    </main>",
        "  </body>",
        "</html>"
    ].join("\n");
}

export function extractPageVersionPayloads(source: string): string[] {
    const pattern = /<[^>]+data-puzzle-role=["']page-version-payload["'][^>]*>([\s\S]*?)<\/[^>]+>/g;
    return [...source.matchAll(pattern)]
        .map((match) => match[1].replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim());
}

export function createPageVersionPuzzle(spec: PageVersionPuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");

    const solution = normalizePageVersionSolution(spec.intendedSolution);
    const title = normalizePageVersionTitle(spec.pageTitle);
    const baselineBody = normalizePageVersionBody(spec.baselineBody, "baseline body");
    const currentBody = normalizePageVersionBody(spec.currentBody, "current body");
    const changeKind = normalizePageVersionChangeKind(spec.changeKind);
    if (changeKind === "removed-content" && !baselineBody.includes(solution)) {
        throw new Error("For removed-content, the older version body must contain the page-version payload exactly once.");
    }
    const baselineDate = normalizeVersionDate(spec.baselineDate, "older version date");
    const currentDate = normalizeVersionDate(spec.currentDate, "newer version date");
    if (baselineDate >= currentDate) {
        throw new Error("The older version date must be earlier than the newer version date.");
    }
    const baselineLabel = normalizeVersionLabel(spec.baselineLabel, "Archived snapshot");
    const currentLabel = normalizeVersionLabel(spec.currentLabel, "Updated snapshot");
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);
    assertSolutionNotInStableText(solution, [
        title,
        changeKind === "removed-content" ? currentBody : baselineBody,
        baselineLabel,
        currentLabel
    ]);

    const baselinePath = `/versions/${baselineDate}.html`;
    const currentPath = `/versions/${currentDate}.html`;
    const indexSource = buildIndexPage({
        title, baselinePath, currentPath, baselineLabel, currentLabel, baselineDate, currentDate
    });
    const payloadWasRemoved = changeKind === "removed-content";
    const baselineSource = buildVersionPage({
        title,
        label: baselineLabel,
        date: baselineDate,
        body: baselineBody,
        ...(payloadWasRemoved ? { payload: solution } : {}),
        changeKind,
        isCurrent: false
    });
    const currentSource = buildVersionPage({
        title,
        label: currentLabel,
        date: currentDate,
        body: currentBody,
        ...(payloadWasRemoved ? {} : { payload: solution }),
        changeKind,
        isCurrent: true
    });

    for (const source of [indexSource, baselineSource, currentSource]) assertSafeStaticHtml(source);
    const payloads = extractPageVersionPayloads(currentSource);
    const baselinePayloads = extractPageVersionPayloads(baselineSource);
    const allPayloads = [...baselinePayloads, ...payloads];
    if (allPayloads.length !== 1
        || allPayloads[0] !== solution
        || (payloadWasRemoved ? payloads.length !== 0 : baselinePayloads.length !== 0)) {
        throw new Error("Internal validation failed: exactly one dated version must contain the intended payload.");
    }

    const files: HtmlPuzzleArtifactFile[] = [
        { path: "/index.html", mediaType: "text/html", source: indexSource },
        { path: baselinePath, mediaType: "text/html", source: baselineSource },
        { path: currentPath, mediaType: "text/html", source: currentSource }
    ];

    const artifact = createHtmlArtifact({ entryPath: "/index.html", files });
    const artifactSourceForHash = files.map((file) => `${file.path}\n${file.source}`).join("\n---\n");
    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solutionRecord = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: solution, normalization }
        : { valueType: "text" as const, canonical: solution, acceptedAlternatives, normalization };

    const inputs: PrivatePuzzleInstance["inputs"] = [
        {
            key: "page_version_pair",
            valueType: "html-page-version-pair",
            description: "Two static HTML page versions that should be compared.",
            required: true,
            value: { baselinePath, currentPath, baselineLabel, currentLabel, baselineDate, currentDate }
        },
        {
            key: "version_change_payload",
            valueType: "page-version-payload",
            description: "The message revealed by comparing the static page versions.",
            required: true,
            value: solution
        }
    ];

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "page-version",
        inputs,
        outputs: [{
            key: "revealed_message",
            valueType: "plain-text",
            description: "The text recovered from the meaningful difference between page versions.",
            value: solution
        }],
        artifact,
        prompt: "Open the webpage artifact and compare the included page versions to recover the hidden message.",
        solution: solutionRecord,
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: false, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            pageVersion: {
                templateVersion: TEMPLATE_VERSION,
                changeKind,
                baselinePath,
                currentPath,
                comparisonMode: "static-file-comparison",
                requiresJavaScriptExecution: false,
                liveNavigationSupported: false,
                artifactSha256: createHash("sha256").update(artifactSourceForHash).digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
