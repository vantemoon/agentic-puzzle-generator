import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createSvgImageArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";
import { escapeHtmlText } from "../html-comment/engine.js";

export type VisualClueRecognitionLevel = "explicit" | "indirect" | "contextual" | "hidden";
export type VisualClueKind = "object" | "symbol" | "text" | "pattern" | "contradiction";

export interface VisualCluePuzzleSpec extends PuzzleGenerationSpec {
    sceneTitle: string;
    sceneTheme: string;
    sceneDescription: string;
    clueKind: VisualClueKind;
    clueLabel: string;
    recognitionLevel: VisualClueRecognitionLevel;
    observationHint?: string;
    imageCaption?: string;
    acceptedAlternatives?: string[];
}

const MAX_SOLUTION_LENGTH = 80;
const MAX_TITLE_LENGTH = 120;
const MAX_THEME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1_000;
const MAX_CLUE_LABEL_LENGTH = 80;
const MAX_HINT_LENGTH = 300;
const MAX_CAPTION_LENGTH = 300;
const TEMPLATE_VERSION = "safe-static-visual-clue-v1";
const RECOGNITION_LEVELS: readonly VisualClueRecognitionLevel[] = ["explicit", "indirect", "contextual", "hidden"];
const CLUE_KINDS: readonly VisualClueKind[] = ["object", "symbol", "text", "pattern", "contradiction"];

function normalizeInlineText(input: string, fieldName: string, maximumLength: number): string {
    const normalized = input.trim().replace(/\s+/g, " ");
    if (normalized.length === 0) throw new Error(`The ${fieldName} must not be empty.`);
    if (normalized.length > maximumLength) throw new Error(`The ${fieldName} must not exceed ${maximumLength} characters.`);
    if (/[^\x20-\x7E\u2018\u2019\u201C\u201D\u2013\u2014]/.test(normalized)) {
        throw new Error(`The ${fieldName} may contain printable ASCII and common typographic punctuation.`);
    }
    return normalized;
}

export function normalizeVisualClueSolution(input: string): string {
    return normalizeInlineText(input, "visual clue answer", MAX_SOLUTION_LENGTH);
}

export function normalizeSceneTitle(input: string): string {
    return normalizeInlineText(input, "scene title", MAX_TITLE_LENGTH);
}

export function normalizeSceneTheme(input: string): string {
    return normalizeInlineText(input, "scene theme", MAX_THEME_LENGTH);
}

export function normalizeSceneDescription(input: string): string {
    return normalizeInlineText(input, "scene description", MAX_DESCRIPTION_LENGTH);
}

export function normalizeClueLabel(input: string): string {
    return normalizeInlineText(input, "clue label", MAX_CLUE_LABEL_LENGTH);
}

export function normalizeObservationHint(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "observation hint", MAX_HINT_LENGTH);
}

export function normalizeImageCaption(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "image caption", MAX_CAPTION_LENGTH);
}

export function normalizeVisualClueRecognitionLevel(input: string): VisualClueRecognitionLevel {
    if (!RECOGNITION_LEVELS.includes(input as VisualClueRecognitionLevel)) {
        throw new Error(`The recognition level must be one of: ${RECOGNITION_LEVELS.join(", ")}.`);
    }
    return input as VisualClueRecognitionLevel;
}

export function normalizeVisualClueKind(input: string): VisualClueKind {
    if (!CLUE_KINDS.includes(input as VisualClueKind)) {
        throw new Error(`The clue kind must be one of: ${CLUE_KINDS.join(", ")}.`);
    }
    return input as VisualClueKind;
}

function normalizeAcceptedAlternatives(alternatives: string[] | undefined): string[] | undefined {
    if (alternatives === undefined) return undefined;
    const normalized = [...new Set(alternatives.map(normalizeVisualClueSolution))];
    return normalized.length > 0 ? normalized : undefined;
}

function assertRecognitionHintPolicy(recognitionLevel: VisualClueRecognitionLevel, observationHint: string | undefined): void {
    if (recognitionLevel === "explicit" && observationHint === undefined) {
        throw new Error("Explicit visual-clue puzzles require an observation hint.");
    }
    if (recognitionLevel === "hidden" && observationHint !== undefined) {
        throw new Error("Hidden visual-clue puzzles must not include an observation hint.");
    }
}

function assertSolutionNotLeaked(options: {
    solution: string;
    sceneTitle: string;
    sceneTheme: string;
    sceneDescription: string;
    observationHint?: string;
    imageCaption?: string;
}): void {
    const publicText = [
        options.sceneTitle,
        options.sceneTheme,
        options.sceneDescription,
        options.observationHint ?? "",
        options.imageCaption ?? ""
    ].join("\n");
    if (publicText.includes(options.solution)) {
        throw new Error("The visual clue answer must not appear in visible non-clue text.");
    }
}

export function assertSafeStaticSvg(source: string): void {
    const lower = source.toLowerCase();
    const forbiddenPatterns = [
        /<\s*script\b/i,
        /<\s*foreignobject\b/i,
        /<\s*iframe\b/i,
        /<\s*object\b/i,
        /<\s*embed\b/i,
        /<\s*image\b/i,
        /<\s*a\b/i,
        /<\s*use\b/i
    ];
    for (const pattern of forbiddenPatterns) {
        if (pattern.test(source)) throw new Error("SVG artifacts must be static and self-contained.");
    }
    if (/\s+on[a-z]+\s*=/i.test(source)) throw new Error("SVG artifacts must not contain event-handler attributes.");
    if (lower.includes("javascript:") || /(?:href|src)\s*=\s*[\"']?https?:\/\//i.test(source)) {
        throw new Error("SVG artifacts must not reference scripts or remote resources.");
    }
}

function hashNumber(seed: string, salt: string, modulo: number): number {
    const digest = createHash("sha256").update(seed).update(salt).digest();
    return digest.readUInt32BE(0) % modulo;
}

function themeWords(theme: string): string[] {
    return theme.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 3).slice(0, 3);
}

function fitVisibleText(input: string, maximumCharacters: number): string {
    const normalized = input.trim();
    if (normalized.length <= maximumCharacters) return normalized;
    return `${normalized.slice(0, Math.max(1, maximumCharacters - 1)).trimEnd()}…`;
}

function textFitAttributes(maxWidth: number): string {
    return ` textLength=\"${maxWidth}\" lengthAdjust=\"spacingAndGlyphs\"`;
}

function paletteForTheme(theme: string): { background: string; panel: string; accent: string; muted: string; ink: string; clue: string } {
    const palettes = [
        { background: "#e7e0d2", panel: "#f4efe5", accent: "#b7a382", muted: "#8f8068", ink: "#4f4638", clue: "#7f7668" },
        { background: "#dde7df", panel: "#eef3ec", accent: "#8fa68f", muted: "#6f876f", ink: "#3f5138", clue: "#697c69" },
        { background: "#dfe6ec", panel: "#eef2f5", accent: "#8ca0ad", muted: "#6e808c", ink: "#384852", clue: "#667782" },
        { background: "#eadfdc", panel: "#f6eeeb", accent: "#b88f86", muted: "#8e716b", ink: "#513f3b", clue: "#806961" },
        { background: "#e8e3cc", panel: "#f6f1d9", accent: "#b4aa73", muted: "#887f55", ink: "#4f4930", clue: "#7a7350" }
    ];
    return palettes[hashNumber(theme, "palette", palettes.length)];
}

function buildThemeCover(theme: string, title: string, palette: ReturnType<typeof paletteForTheme>): string[] {
    const words = themeWords(theme);
    const seed = `${theme}|${title}`;
    const motifCount = 5 + hashNumber(seed, "motif-count", 4);
    const elements = [
        `  <rect width=\"420\" height=\"220\" fill=\"${palette.background}\"/>`,
        `  <rect x=\"24\" y=\"36\" width=\"372\" height=\"142\" rx=\"12\" fill=\"${palette.panel}\" stroke=\"${palette.accent}\" opacity=\"0.95\"/>`,
        `  <text x=\"28\" y=\"24\" font-family=\"Arial, sans-serif\" font-size=\"15\" fill=\"${palette.ink}\"${textFitAttributes(250)}>${escapeHtmlText(fitVisibleText(title, 40))}</text>`,
        `  <text x=\"246\" y=\"194\" font-family=\"Arial, sans-serif\" font-size=\"9\" fill=\"${palette.muted}\" opacity=\"0.65\"${textFitAttributes(140)}>${escapeHtmlText(fitVisibleText(theme, 42))}</text>`
    ];
    for (let index = 0; index < motifCount; index += 1) {
        const x = 48 + hashNumber(seed, `x-${index}`, 280);
        const y = 58 + hashNumber(seed, `y-${index}`, 88);
        const w = 22 + hashNumber(seed, `w-${index}`, 42);
        const h = 14 + hashNumber(seed, `h-${index}`, 34);
        const opacity = (48 + hashNumber(seed, `o-${index}`, 28)) / 100;
        if (index % 3 === 0) {
            elements.push(`  <rect x=\"${x}\" y=\"${y}\" width=\"${w}\" height=\"${h}\" rx=\"5\" fill=\"${palette.accent}\" opacity=\"${opacity}\"/>`);
        } else if (index % 3 === 1) {
            elements.push(`  <circle cx=\"${x}\" cy=\"${y}\" r=\"${Math.max(6, Math.floor(w / 3))}\" fill=\"${palette.muted}\" opacity=\"${opacity}\"/>`);
        } else {
            elements.push(`  <path d=\"M${x} ${y + h} C${x + Math.floor(w / 3)} ${y} ${x + Math.floor((2 * w) / 3)} ${y + h} ${x + w} ${y}\" fill=\"none\" stroke=\"${palette.accent}\" stroke-width=\"3\" opacity=\"${opacity}\"/>`);
        }
    }
    for (const [index, word] of words.entries()) {
        elements.push(`  <text x=\"${54 + index * 82}\" y=\"${160 - index * 8}\" font-family=\"Arial, sans-serif\" font-size=\"10\" fill=\"${palette.muted}\" opacity=\"0.45\"${textFitAttributes(64)}>${escapeHtmlText(word)}</text>`);
    }
    return elements;
}

function visualElementForKind(kind: VisualClueKind, label: string, theme: string, palette: ReturnType<typeof paletteForTheme>): string[] {
    const escapedLabel = escapeHtmlText(label);
    const seed = `${theme}|${label}|${kind}`;
    const x = 226 + hashNumber(seed, "clue-x", 44);
    const y = 90 + hashNumber(seed, "clue-y", 52);
    if (kind === "symbol") {
        return [
            `  <g id=\"visual-clue\" data-puzzle-role=\"visual-clue-payload\" transform=\"translate(${x} ${y})\" opacity=\"0.66\">`,
            `    <polygon points=\"0,-9 3,-3 10,-3 4,2 6,8 0,5 -6,8 -4,2 -10,-3 -3,-3\" fill=\"${palette.clue}\"/>`,
            `    <text x=\"13\" y=\"3\" font-family=\"Arial, sans-serif\" font-size=\"7\" fill=\"${palette.clue}\"${textFitAttributes(118)}>${escapedLabel}</text>`,
            "  </g>"
        ];
    }
    if (kind === "text") {
        return [
            `  <g id=\"visual-clue\" data-puzzle-role=\"visual-clue-payload\" opacity=\"0.68\">`,
            `    <text x=\"${x}\" y=\"${y}\" font-family=\"Arial, sans-serif\" font-size=\"8\" fill=\"${palette.clue}\"${textFitAttributes(150)}>${escapedLabel}</text>`,
            "  </g>"
        ];
    }
    if (kind === "pattern") {
        return [
            `  <g id=\"visual-clue\" data-puzzle-role=\"visual-clue-payload\" opacity=\"0.64\">`,
            `    <circle cx=\"${x}\" cy=\"${y}\" r=\"2\" fill=\"${palette.clue}\"/>`,
            `    <circle cx=\"${x + 8}\" cy=\"${y}\" r=\"2\" fill=\"${palette.clue}\"/>`,
            `    <circle cx=\"${x + 16}\" cy=\"${y}\" r=\"2\" fill=\"${palette.clue}\"/>`,
            `    <circle cx=\"${x + 24}\" cy=\"${y}\" r=\"2\" fill=\"${palette.clue}\"/>`,
            `    <text x=\"${x}\" y=\"${y + 13}\" font-family=\"Arial, sans-serif\" font-size=\"7\" fill=\"${palette.clue}\"${textFitAttributes(132)}>${escapedLabel}</text>`,
            "  </g>"
        ];
    }
    if (kind === "contradiction") {
        return [
            `  <g id=\"visual-clue\" data-puzzle-role=\"visual-clue-payload\" opacity=\"0.68\">`,
            `    <rect x=\"${x - 6}\" y=\"${y - 14}\" width=\"48\" height=\"24\" rx=\"4\" fill=\"${palette.muted}\"/>`,
            `    <path d=\"M${x - 2} ${y + 7} L${x + 36} ${y - 10}\" stroke=\"${palette.panel}\" stroke-width=\"2\" opacity=\"0.7\"/>`,
            `    <text x=\"${x}\" y=\"${y}\" font-family=\"Arial, sans-serif\" font-size=\"7\" fill=\"${palette.panel}\"${textFitAttributes(112)}>${escapedLabel}</text>`,
            "  </g>"
        ];
    }
    return [
        `  <g id=\"visual-clue\" data-puzzle-role=\"visual-clue-payload\" opacity=\"0.66\">`,
        `    <circle cx=\"${x}\" cy=\"${y - 4}\" r=\"8\" fill=\"${palette.clue}\"/>`,
        `    <rect x=\"${x - 4}\" y=\"${y - 4}\" width=\"8\" height=\"14\" rx=\"2\" fill=\"${palette.muted}\"/>`,
        `    <text x=\"${x + 14}\" y=\"${y + 2}\" font-family=\"Arial, sans-serif\" font-size=\"7\" fill=\"${palette.clue}\"${textFitAttributes(120)}>${escapedLabel}</text>`,
        "  </g>"
    ];
}

export function buildVisualClueSvg(options: {
    sceneTitle: string;
    sceneTheme: string;
    sceneDescription: string;
    clueKind: VisualClueKind;
    clueLabel: string;
    observationHint?: string;
    imageCaption?: string;
}): string {
    const descriptionParts = [options.sceneTheme, options.sceneDescription, options.observationHint, options.imageCaption]
        .filter((part): part is string => part !== undefined);
    const palette = paletteForTheme(options.sceneTheme);
    const source = [
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"420\" height=\"220\" viewBox=\"0 0 420 220\" role=\"img\" aria-labelledby=\"scene-title\" aria-describedby=\"scene-desc\">",
        `  <title id=\"scene-title\">${escapeHtmlText(options.sceneTitle)}</title>`,
        `  <desc id=\"scene-desc\">${escapeHtmlText(descriptionParts.join(" "))}</desc>`,
        ...buildThemeCover(options.sceneTheme, options.sceneTitle, palette),
        ...visualElementForKind(options.clueKind, options.clueLabel, options.sceneTheme, palette),
        "</svg>"
    ].join("\n");
    assertSafeStaticSvg(source);
    return source;
}

export function extractVisualCluePayloads(source: string): string[] {
    const groups = [...source.matchAll(/<g\b(?=[^>]*data-puzzle-role=["']visual-clue-payload["'])[^>]*>([\s\S]*?)<\/g>/g)];
    return groups.map((group) => {
        const title = group[1].match(/<title>([\s\S]*?)<\/title>/);
        if (title !== null) return decodeEntities(title[1].trim());
        const text = group[1].match(/<text\b[^>]*>([\s\S]*?)<\/text>/);
        return text === null ? "" : decodeEntities(text[1].trim());
    }).filter((value) => value.length > 0);
}

function decodeEntities(input: string): string {
    return input
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

export function createVisualCluePuzzle(spec: VisualCluePuzzleSpec): PrivatePuzzleInstance {
    if (spec.id.trim().length === 0) throw new Error("The puzzle ID must not be empty.");

    const solution = normalizeVisualClueSolution(spec.intendedSolution);
    const sceneTitle = normalizeSceneTitle(spec.sceneTitle);
    const sceneTheme = normalizeSceneTheme(spec.sceneTheme);
    const sceneDescription = normalizeSceneDescription(spec.sceneDescription);
    const clueKind = normalizeVisualClueKind(spec.clueKind);
    const clueLabel = normalizeClueLabel(spec.clueLabel);
    const recognitionLevel = normalizeVisualClueRecognitionLevel(spec.recognitionLevel);
    const observationHint = normalizeObservationHint(spec.observationHint);
    const imageCaption = normalizeImageCaption(spec.imageCaption);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);

    if (clueLabel !== solution) throw new Error("The clue label must match the intended visual clue answer.");
    assertRecognitionHintPolicy(recognitionLevel, observationHint);
    assertSolutionNotLeaked({ solution, sceneTitle, sceneTheme, sceneDescription, observationHint, imageCaption });

    const svgSource = buildVisualClueSvg({ sceneTitle, sceneTheme, sceneDescription, clueKind, clueLabel, observationHint, imageCaption });
    const payloads = extractVisualCluePayloads(svgSource);
    if (payloads.length !== 1 || payloads[0] !== solution) {
        throw new Error("Internal validation failed: SVG artifact must contain exactly one intended visual clue payload.");
    }

    const artifact = createSvgImageArtifact(svgSource);
    const normalization: Array<"trim" | "collapse-whitespace"> = ["trim", "collapse-whitespace"];
    const solutionRecord = acceptedAlternatives === undefined
        ? { valueType: "text" as const, canonical: solution, normalization }
        : { valueType: "text" as const, canonical: solution, acceptedAlternatives, normalization };

    const inputs: PrivatePuzzleInstance["inputs"] = [
        {
            key: "visible_scene",
            valueType: "svg-visual-scene",
            description: "The static SVG scene containing a visible but subtle clue.",
            required: true,
            constraints: { imageFormat: "svg", clueKind, maximumClueLabelCharacters: MAX_CLUE_LABEL_LENGTH },
            value: { sceneTitle, sceneTheme, sceneDescription, imageCaption }
        },
        {
            key: "visual_clue_payload",
            valueType: "visual-clue-answer",
            description: "The answer represented by the subtle visual clue in the SVG image.",
            required: true,
            value: solution
        }
    ];
    if (observationHint !== undefined) {
        inputs.push({
            key: "observation_hint",
            valueType: "html-visible-text",
            description: "Visible hint suggesting careful image inspection.",
            required: false,
            constraints: { maximumCharacters: MAX_HINT_LENGTH },
            value: observationHint
        });
    }

    const puzzle: PrivatePuzzleInstance = {
        id: spec.id,
        puzzleType: "hidden-information",
        subtype: "visual-clue",
        inputs,
        outputs: [{
            key: "identified_clue",
            valueType: "plain-text",
            description: "The text answer identified from the visual clue.",
            value: solution
        }],
        artifact,
        prompt: "Open the SVG image artifact and inspect it to identify the hidden visual clue.",
        solution: solutionRecord,
        validator: {
            kind: "normalized-text",
            mode: "deterministic",
            options: { trim: true, caseInsensitive: false, collapseWhitespace: true }
        },
        externalKnowledge: { required: false },
        extensions: {
            visualClue: {
                templateVersion: TEMPLATE_VERSION,
                recognitionLevel,
                clueKind,
                sceneTheme,
                imageFormat: "svg",
                hasObservationHint: observationHint !== undefined,
                hasImageCaption: imageCaption !== undefined,
                artifactSha256: createHash("sha256").update(svgSource, "utf8").digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
