import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createHtmlArtifact,
    type HtmlPuzzleArtifactFile,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";

export type PageVersionRecognitionLevel = "explicit" | "indirect" | "contextual" | "hidden";
export type PageVersionChangeKind = "added-section" | "changed-field" | "removed-redaction";

export interface PageVersionPuzzleSpec extends PuzzleGenerationSpec {
    pageTitle: string;
    baselineBody: string;
    currentBody: string;
    recognitionLevel: PageVersionRecognitionLevel;
    changeKind: PageVersionChangeKind;
    comparisonHint?: string;
    baselineLabel?: string;
    currentLabel?: string;
    acceptedAlternatives?: string[];
}

const MAX_SOLUTION_LENGTH = 300;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1_000;
const MAX_HINT_LENGTH = 300;
const MAX_LABEL_LENGTH = 60;
const TEMPLATE_VERSION = "safe-static-page-version-v1";
const RECOGNITION_LEVELS: readonly PageVersionRecognitionLevel[] = ["explicit", "indirect", "contextual", "hidden"];
const CHANGE_KINDS: readonly PageVersionChangeKind[] = ["added-section", "changed-field", "removed-redaction"];

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

export function normalizeComparisonHint(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "comparison hint", MAX_HINT_LENGTH);
}

export function normalizeVersionLabel(input: string | undefined, fallback: string): string {
    return normalizeInlineText(input ?? fallback, "version label", MAX_LABEL_LENGTH);
}

export function normalizePageVersionRecognitionLevel(input: string): PageVersionRecognitionLevel {
    if (!RECOGNITION_LEVELS.includes(input as PageVersionRecognitionLevel)) {
        throw new Error(`The recognition level must be one of: ${RECOGNITION_LEVELS.join(", ")}.`);
    }
    return input as PageVersionRecognitionLevel;
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

function assertRecognitionHintPolicy(recognitionLevel: PageVersionRecognitionLevel, comparisonHint: string | undefined): void {
    if (recognitionLevel === "explicit" && comparisonHint === undefined) {
        throw new Error("Explicit page-version puzzles require a comparison hint.");
    }
    if (recognitionLevel === "hidden" && comparisonHint !== undefined) {
        throw new Error("Hidden page-version puzzles must not include a comparison hint.");
    }
}

function assertSolutionNotInStableText(solution: string, values: string[]): void {
    const stableText = values.join("\n");
    if (stableText.includes(solution)) {
        throw new Error("The page-version payload must not appear in stable visible text.");
    }
}

function buildVersionBody(options: {
    label: string;
    body: string;
    payload?: string;
    changeKind: PageVersionChangeKind;
    isCurrent: boolean;
}): string {
    const bodyParagraph = `      <p>${escapeHtmlText(options.body)}</p>`;
    if (!options.isCurrent) {
        if (options.changeKind === "changed-field") {
            return [bodyParagraph, "      <dl>", "        <dt>Release marker</dt>", "        <dd>Pending review</dd>", "      </dl>"].join("\n");
        }
        if (options.changeKind === "removed-redaction") {
            return [bodyParagraph, "      <p>Access note: [redacted in this version]</p>"].join("\n");
        }
        return bodyParagraph;
    }

    const payload = escapeHtmlText(options.payload ?? "");
    if (options.changeKind === "changed-field") {
        return [bodyParagraph, "      <dl>", "        <dt>Release marker</dt>", `        <dd data-puzzle-role=\"page-version-payload\">${payload}</dd>`, "      </dl>"].join("\n");
    }
    if (options.changeKind === "removed-redaction") {
        return [bodyParagraph, `      <p>Access note: <span data-puzzle-role=\"page-version-payload\">${payload}</span></p>`].join("\n");
    }
    return [bodyParagraph, "      <section aria-label=\"Current version addition\">", "        <h2>Current update</h2>", `        <p data-puzzle-role=\"page-version-payload\">${payload}</p>`, "      </section>"].join("\n");
}

export function buildVersionPage(options: {
    title: string;
    label: string;
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
        `    <title>${escapeHtmlText(options.title)} — ${escapeHtmlText(options.label)}</title>`,
        "  </head>",
        "  <body>",
        "    <main>",
        `      <h1>${escapeHtmlText(options.title)}</h1>`,
        `      <p class=\"version-label\">Version: ${escapeHtmlText(options.label)}</p>`,
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
    comparisonHint?: string;
}): string {
    const hint = options.comparisonHint === undefined ? "" : `\n      <p class=\"hint\">${escapeHtmlText(options.comparisonHint)}</p>`;
    return [
        "<!doctype html>",
        "<html lang=\"en\">",
        "  <head>",
        "    <meta charset=\"utf-8\">",
        `    <title>${escapeHtmlText(options.title)} — version index</title>`,
        "  </head>",
        "  <body>",
        "    <main>",
        `      <h1>${escapeHtmlText(options.title)}</h1>`,
        "      <p>This artifact contains two static HTML page versions.</p>",
        `      <p>Baseline (${escapeHtmlText(options.baselineLabel)}): <code>${escapeHtmlText(options.baselinePath)}</code></p>`,
        `      <p>Current (${escapeHtmlText(options.currentLabel)}): <code>${escapeHtmlText(options.currentPath)}</code></p>${hint}`,
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
    const recognitionLevel = normalizePageVersionRecognitionLevel(spec.recognitionLevel);
    const changeKind = normalizePageVersionChangeKind(spec.changeKind);
    const comparisonHint = normalizeComparisonHint(spec.comparisonHint);
    const baselineLabel = normalizeVersionLabel(spec.baselineLabel, "baseline");
    const currentLabel = normalizeVersionLabel(spec.currentLabel, "current");
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);

    assertRecognitionHintPolicy(recognitionLevel, comparisonHint);
    assertSolutionNotInStableText(solution, [title, baselineBody, currentBody, comparisonHint ?? "", baselineLabel, currentLabel]);

    const baselinePath = "/versions/baseline.html";
    const currentPath = "/versions/current.html";
    const indexSource = buildIndexPage({ title, baselinePath, currentPath, baselineLabel, currentLabel, comparisonHint });
    const baselineSource = buildVersionPage({ title, label: baselineLabel, body: baselineBody, changeKind, isCurrent: false });
    const currentSource = buildVersionPage({ title, label: currentLabel, body: currentBody, payload: solution, changeKind, isCurrent: true });

    for (const source of [indexSource, baselineSource, currentSource]) assertSafeStaticHtml(source);
    const payloads = extractPageVersionPayloads(currentSource);
    if (payloads.length !== 1 || payloads[0] !== solution || extractPageVersionPayloads(baselineSource).length !== 0) {
        throw new Error("Internal validation failed: current version must contain exactly one intended payload.");
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
            value: { baselinePath, currentPath, baselineLabel, currentLabel }
        },
        {
            key: "version_change_payload",
            valueType: "page-version-payload",
            description: "The message revealed by comparing the static page versions.",
            required: true,
            value: solution
        }
    ];
    if (comparisonHint !== undefined) {
        inputs.push({
            key: "comparison_hint",
            valueType: "html-visible-text",
            description: "Visible hint directing the solver toward comparing page versions.",
            required: false,
            value: comparisonHint
        });
    }

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
                recognitionLevel,
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
