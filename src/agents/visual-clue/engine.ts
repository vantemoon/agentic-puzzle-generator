import { createHash } from "node:crypto";

import {
    assertPrivatePuzzleInstance,
    createSvgImageArtifact,
    type PrivatePuzzleInstance,
    type PuzzleGenerationSpec
} from "../../core/types.js";
import { escapeHtmlText } from "../html-comment/engine.js";

export type VisualClueKind = "object" | "symbol" | "text" | "pattern" | "contradiction";

export interface VisualCluePuzzleSpec extends PuzzleGenerationSpec {
    sceneTitle: string;
    sceneTheme: string;
    sceneDescription: string;
    backgroundElements: string[];
    clueElements: string[];
    showClueLabel: boolean;
    clueKind: VisualClueKind;
    clueLabel: string;
    imageCaption?: string;
    acceptedAlternatives?: string[];
}

const MAX_SOLUTION_LENGTH = 80;
const MAX_TITLE_LENGTH = 120;
const MAX_THEME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1_000;
const MAX_CLUE_LABEL_LENGTH = 80;
const MAX_CAPTION_LENGTH = 300;
// These are abuse/memory guards, not visual-complexity targets. The compact drawing
// language and model output-token budget provide the normal practical limits.
const MAX_BACKGROUND_ELEMENTS = 250;
const MAX_CLUE_ELEMENTS = 80;
const MAX_DRAWING_INSTRUCTION_LENGTH = 700;
const TEMPLATE_VERSION = "llm-drawing-visual-clue-v4";
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


export function normalizeImageCaption(input: string | undefined): string | undefined {
    if (input === undefined) return undefined;
    return normalizeInlineText(input, "image caption", MAX_CAPTION_LENGTH);
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


function assertSolutionNotLeaked(options: {
    solution: string;
    sceneTitle: string;
    sceneTheme: string;
    sceneDescription: string;
    imageCaption?: string;
}): void {
    const publicText = [
        options.sceneTitle,
        options.sceneTheme,
        options.sceneDescription,

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
        /<\s*use\b/i,
        /<\s*style\b/i,
        /<\s*(?:animate|animatemotion|animatetransform|set|discard)\b/i,
        /<\s*(?:audio|video|canvas|link|meta|base)\b/i
    ];
    for (const pattern of forbiddenPatterns) {
        if (pattern.test(source)) throw new Error("SVG artifacts must be static and self-contained.");
    }
    if (/\s+on[a-z]+\s*=/i.test(source)) throw new Error("SVG artifacts must not contain event-handler attributes.");
    if (/\s+style\s*=/i.test(source)) throw new Error("SVG artifacts must not contain CSS style attributes.");
    if (
        lower.includes("javascript:") ||
        /(?:href|src)\s*=/i.test(source) ||
        /\burl\s*\(/i.test(source) ||
        /<!doctype|<!entity|<\?|<!--/i.test(source)
    ) {
        throw new Error("SVG artifacts must not reference scripts or remote resources.");
    }

    const allowedElements = new Set([
        "svg", "title", "desc", "g", "rect", "circle", "ellipse", "line", "polyline",
        "polygon", "path", "text", "tspan"
    ]);
    for (const match of source.matchAll(/<\/?\s*([a-z][a-z0-9:-]*)\b/gi)) {
        if (!allowedElements.has(match[1].toLowerCase())) {
            throw new Error(`SVG element <${match[1]}> is not allowed in a static scene.`);
        }
    }
}

function drawingNumber(value: string, field: string, minimum = -1_000, maximum = 1_000): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`Drawing instruction ${field} must be a number from ${minimum} to ${maximum}.`);
    }
    return parsed;
}

function drawingColor(value: string, field: string): string {
    if (value !== "none" && !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(value)) {
        throw new Error(`Drawing instruction ${field} must be none or a hexadecimal color.`);
    }
    return value;
}

function paintAttributes(fill: string, stroke: string, strokeWidth: string, opacity: string): string {
    return `fill="${drawingColor(fill, "fill")}" stroke="${drawingColor(stroke, "stroke")}" stroke-width="${drawingNumber(strokeWidth, "stroke width", 0, 50)}" opacity="${drawingNumber(opacity, "opacity", 0, 1)}"`;
}

function instructionParts(instruction: string): string[] {
    const normalized = instruction.trim();
    if (normalized.length === 0 || normalized.length > MAX_DRAWING_INSTRUCTION_LENGTH) {
        throw new Error(`Drawing instructions must contain 1 to ${MAX_DRAWING_INSTRUCTION_LENGTH} characters.`);
    }
    if (/[^\x20-\x7E‘’“”–—]/.test(normalized)) {
        throw new Error("Drawing instructions may contain printable ASCII and common typographic punctuation.");
    }
    return normalized.split("|");
}

function requirePartCount(parts: string[], expected: number): void {
    if (parts.length !== expected) {
        throw new Error(`Drawing instruction ${parts[0] || "unknown"} requires ${expected - 1} fields.`);
    }
}

export function compileDrawingInstructions(instructions: string[], fieldName: string, maximumElements: number): string {
    if (instructions.length === 0 || instructions.length > maximumElements) {
        throw new Error(`The ${fieldName} must contain 1 to ${maximumElements} drawing instructions.`);
    }
    return instructions.map((instruction) => {
        const parts = instructionParts(instruction);
        const kind = parts[0];
        if (kind === "rect") {
            requirePartCount(parts, 11);
            const [, x, y, width, height, fill, stroke, strokeWidth, opacity, rx, ry] = parts;
            return `<rect x="${drawingNumber(x, "x")}" y="${drawingNumber(y, "y")}" width="${drawingNumber(width, "width", 0)}" height="${drawingNumber(height, "height", 0)}" ${paintAttributes(fill, stroke, strokeWidth, opacity)} rx="${drawingNumber(rx, "rx", 0)}" ry="${drawingNumber(ry, "ry", 0)}"/>`;
        }
        if (kind === "circle") {
            requirePartCount(parts, 8);
            const [, cx, cy, radius, fill, stroke, strokeWidth, opacity] = parts;
            return `<circle cx="${drawingNumber(cx, "cx")}" cy="${drawingNumber(cy, "cy")}" r="${drawingNumber(radius, "radius", 0)}" ${paintAttributes(fill, stroke, strokeWidth, opacity)}/>`;
        }
        if (kind === "ellipse") {
            requirePartCount(parts, 9);
            const [, cx, cy, rx, ry, fill, stroke, strokeWidth, opacity] = parts;
            return `<ellipse cx="${drawingNumber(cx, "cx")}" cy="${drawingNumber(cy, "cy")}" rx="${drawingNumber(rx, "rx", 0)}" ry="${drawingNumber(ry, "ry", 0)}" ${paintAttributes(fill, stroke, strokeWidth, opacity)}/>`;
        }
        if (kind === "line") {
            requirePartCount(parts, 8);
            const [, x1, y1, x2, y2, stroke, strokeWidth, opacity] = parts;
            return `<line x1="${drawingNumber(x1, "x1")}" y1="${drawingNumber(y1, "y1")}" x2="${drawingNumber(x2, "x2")}" y2="${drawingNumber(y2, "y2")}" stroke="${drawingColor(stroke, "stroke")}" stroke-width="${drawingNumber(strokeWidth, "stroke width", 0, 50)}" opacity="${drawingNumber(opacity, "opacity", 0, 1)}"/>`;
        }
        if (kind === "polygon" || kind === "polyline") {
            requirePartCount(parts, 6);
            const [, points, fill, stroke, strokeWidth, opacity] = parts;
            if (!/^[0-9.,\s-]+$/.test(points)) throw new Error(`Drawing instruction ${kind} points are invalid.`);
            return `<${kind} points="${points}" ${paintAttributes(fill, stroke, strokeWidth, opacity)}/>`;
        }
        if (kind === "path") {
            requirePartCount(parts, 6);
            const [, pathData, fill, stroke, strokeWidth, opacity] = parts;
            if (!/^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/.test(pathData)) {
                throw new Error("Drawing instruction path data is invalid.");
            }
            return `<path d="${pathData}" ${paintAttributes(fill, stroke, strokeWidth, opacity)}/>`;
        }
        if (kind === "text") {
            requirePartCount(parts, 8);
            const [, x, y, fontSize, fill, anchor, family, content] = parts;
            if (!["start", "middle", "end"].includes(anchor)) throw new Error("Drawing instruction text anchor is invalid.");
            if (!["sans-serif", "serif", "monospace"].includes(family)) throw new Error("Drawing instruction font family is invalid.");
            return `<text x="${drawingNumber(x, "x")}" y="${drawingNumber(y, "y")}" font-size="${drawingNumber(fontSize, "font size", 1, 100)}" fill="${drawingColor(fill, "fill")}" text-anchor="${anchor}" font-family="${family}">${escapeHtmlText(content)}</text>`;
        }
        throw new Error(`Unsupported drawing instruction: ${kind}.`);
    }).join("\n");
}

function visibleSvgText(source: string): string[] {
    return [...source.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map((match) =>
        decodeEntities(match[1].replace(/<[^>]+>/g, " ")).trim().replace(/\s+/g, " ")
    );
}

export function assertClueLabelIsVisible(clueSvg: string, clueLabel: string): void {
    if (!visibleSvgText(clueSvg).some((text) => text.includes(clueLabel))) {
        throw new Error("The LLM-generated clue SVG must show the exact clue label in a visible text element.");
    }
}

export function assertClueLabelIsHidden(clueSvg: string, clueLabel: string): void {
    if (visibleSvgText(clueSvg).some((text) => text.includes(clueLabel))) {
        throw new Error("The LLM-generated clue SVG must omit the visible clue label when showClueLabel is false.");
    }
}

export function buildVisualClueSvg(options: {
    sceneTitle: string;
    sceneTheme: string;
    sceneDescription: string;
    backgroundElements: string[];
    clueElements: string[];
    clueKind: VisualClueKind;
    clueLabel: string;
    imageCaption?: string;
}): string {
    const backgroundSvg = compileDrawingInstructions(options.backgroundElements, "background", MAX_BACKGROUND_ELEMENTS);
    const clueSvg = compileDrawingInstructions(options.clueElements, "clue", MAX_CLUE_ELEMENTS);
    const source = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220" viewBox="0 0 420 220" role="img">',
        `  <title>${escapeHtmlText(options.sceneTitle)}</title>`,
        `  <desc>${escapeHtmlText(options.sceneDescription)}</desc>`,
        backgroundSvg,
        '  <g id="visual-clue" data-puzzle-role="visual-clue-payload">',
        `    <title>${escapeHtmlText(options.clueLabel)}</title>`,
        clueSvg,
        "  </g>",
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
        .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
        .replace(/&#([0-9]+);/g, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 10)))
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
    const backgroundSvg = compileDrawingInstructions(spec.backgroundElements, "background", MAX_BACKGROUND_ELEMENTS);
    const clueSvg = compileDrawingInstructions(spec.clueElements, "clue", MAX_CLUE_ELEMENTS);
    const clueKind = normalizeVisualClueKind(spec.clueKind);
    const clueLabel = normalizeClueLabel(spec.clueLabel);
    const imageCaption = normalizeImageCaption(spec.imageCaption);
    const acceptedAlternatives = normalizeAcceptedAlternatives(spec.acceptedAlternatives);

    if (clueLabel !== solution) throw new Error("The clue label must match the intended visual clue answer.");
    assertSolutionNotLeaked({ solution, sceneTitle, sceneTheme, sceneDescription, imageCaption });
    if (decodeEntities(backgroundSvg).includes(solution)) {
        throw new Error("The visual clue answer must not appear in the LLM-generated background SVG.");
    }
    if (spec.showClueLabel) {
        assertClueLabelIsVisible(clueSvg, clueLabel);
    } else {
        assertClueLabelIsHidden(clueSvg, clueLabel);
    }

    const svgSource = buildVisualClueSvg({ sceneTitle, sceneTheme, sceneDescription, backgroundElements: spec.backgroundElements, clueElements: spec.clueElements, clueKind, clueLabel, imageCaption });
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
            value: { sceneTitle, sceneTheme, sceneDescription, imageCaption, showClueLabel: spec.showClueLabel, backgroundRenderer: "llm-authored-drawing-plan", clueRenderer: "llm-authored-drawing-plan" }
        },
        {
            key: "visual_clue_payload",
            valueType: "visual-clue-answer",
            description: "The answer represented by the subtle visual clue in the SVG image.",
            required: true,
            value: solution
        }
    ];

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
                clueKind,
                sceneTheme,
                backgroundRenderer: "llm-authored-drawing-plan",
                clueRenderer: "llm-authored-drawing-plan",
                showClueLabel: spec.showClueLabel,
                imageFormat: "svg",
                hasImageCaption: imageCaption !== undefined,
                artifactSha256: createHash("sha256").update(svgSource, "utf8").digest("hex")
            }
        }
    };

    assertPrivatePuzzleInstance(puzzle);
    return puzzle;
}
