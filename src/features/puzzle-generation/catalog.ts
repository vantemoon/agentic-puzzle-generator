import type { TSchema } from "typebox";

import {
    authoredContentForPuzzle,
    type AuthoredContentDefinition
} from "../../shared/utilities/authored-content.js";
import { normalizeAcrosticPhrase } from "./generators/cover-text-line-acrostic/engine.js";
import { createAcrosticPuzzleTool } from "./generators/cover-text-line-acrostic/tool.js";
import { createAlphaChannelPuzzleTool } from "./generators/alpha-channel/tool.js";
import { normalizeAndValidateAltTextCopy } from "./generators/alt-text/engine.js";
import { createAltTextPuzzleTool } from "./generators/alt-text/tool.js";
import { normalizeAnagramAnswer } from "./generators/anagram/engine.js";
import { createAnagramPuzzleTool } from "./generators/anagram/tool.js";
import { createAnomalousPhrasePuzzle } from "./generators/anomalous-phrase/engine.js";
import { createAnomalousPhrasePuzzleTool } from "./generators/anomalous-phrase/tool.js";
import { createAsciiArtPuzzleTool } from "./generators/ascii-art/tool.js";
import { createAsciiPuzzle } from "./generators/ascii-code/engine.js";
import { createAsciiPuzzleTool } from "./generators/ascii-code/tool.js";
import { createBinaryCapitalizationPuzzleTool } from "./generators/binary-capitalization-pattern/tool.js";
import { createCaesarPuzzle } from "./generators/caesar-cipher/engine.js";
import { createCaesarPuzzleTool } from "./generators/caesar-cipher/tool.js";
import { normalizeCapitalLetterSolution } from "./generators/capital-letter-extraction/engine.js";
import { createCapitalLetterExtractionPuzzleTool } from "./generators/capital-letter-extraction/tool.js";
import { createColorChannelPuzzleTool } from "./generators/color-channel/tool.js";
import { createDomElementPuzzle } from "./generators/dom-element/engine.js";
import { createDomElementPuzzleTool } from "./generators/dom-element/tool.js";
import { createHtmlCommentPuzzle } from "./generators/html-comment/engine.js";
import { createHtmlCommentPuzzleTool } from "./generators/html-comment/tool.js";
import { createMorseAudioPuzzleTool } from "./generators/morse-audio/tool.js";
import { createMorsePuzzle } from "./generators/morse-code/engine.js";
import { createMorsePuzzleTool } from "./generators/morse-code/tool.js";
import { normalizeNthCharacterSolution } from "./generators/periodic-letter-extraction/engine.js";
import { createNthCharacterPuzzleTool } from "./generators/periodic-letter-extraction/tool.js";
import { normalizeNthWordPhrase } from "./generators/periodic-word-extraction/engine.js";
import { createNthWordPuzzleTool } from "./generators/periodic-word-extraction/tool.js";
import { createPageVersionPuzzle } from "./generators/page-version/engine.js";
import { createPageVersionPuzzleTool } from "./generators/page-version/tool.js";
import { createQrCodePuzzle, MAX_QR_PAYLOAD_BYTES } from "./generators/qr-code/engine.js";
import { createQrCodePuzzleTool } from "./generators/qr-code/tool.js";
import { createReverseAudioPuzzleTool } from "./generators/reverse-audio/tool.js";
import { createSecureRelayPuzzleTool } from "./generators/asymmetric-sealed-relay/tool.js";
import { createSourceCodePuzzle } from "./generators/html-source-inspection/engine.js";
import { createSourceCodePuzzleTool } from "./generators/html-source-inspection/tool.js";
import { createStaticUrlPuzzleTool } from "./generators/static-url/tool.js";
import { createSteganographyPuzzleTool } from "./generators/steganography/tool.js";
import { normalizeSubstitutionPhrase } from "./generators/monoalphabetic-substitution/engine.js";
import { createSubstitutionPuzzleTool } from "./generators/monoalphabetic-substitution/tool.js";
import { normalizeTelestichPhrase } from "./generators/cover-text-line-telestich/engine.js";
import { createTelestichPuzzleTool } from "./generators/cover-text-line-telestich/tool.js";
import { normalizeVigenerePhrase } from "./generators/vigenere/engine.js";
import { createVigenerePuzzleTool } from "./generators/vigenere/tool.js";
import { createVisualCluePuzzleTool } from "./generators/visual-clue/tool.js";
import { normalizeWordIndexPhrase } from "./generators/cover-text-word-index-cipher/engine.js";
import { createWordIndexPuzzleTool } from "./generators/cover-text-word-index-cipher/tool.js";
import type { PrivatePuzzleInstance, PuzzleGenerationSpec } from "../../shared/artifacts/types.js";
import type { ScalarDataType } from "../level-design/types.js";

export interface CatalogPort {
    key: string;
    dataType: ScalarDataType;
    valueType: string;
    description: string;
    required?: boolean;
}

export type BundlePlacementStrategy =
    | "page-body"
    | "native-html"
    | "media-viewer"
    | "downloadable-file"
    | "version-set";

export type BundleIntegrityRequirement =
    | "text-content"
    | "html-source"
    | "exact-file";

export interface PuzzleBundleCapabilities {
    placements: BundlePlacementStrategy[];
    integrity: BundleIntegrityRequirement;
}

export interface PuzzleCatalogEntry {
    puzzleType: string;
    subtype: string;
    displayName: string;
    description: string;
    generatorTool: string;
    generationSpecSchema: TSchema;
    inputs: CatalogPort[];
    outputs: CatalogPort[];
    narrativeTags: string[];
    difficultyControls: string[];
    authoredContent?: AuthoredContentDefinition;
    generationSpecConstraints?: string[];
    validateGenerationSpec?: (spec: Record<string, unknown>) => string[];
    compileGenerationSpec?: (spec: Record<string, unknown>) => PrivatePuzzleInstance;
    bundle: PuzzleBundleCapabilities;
}

export interface PuzzleCatalog {
    version: string;
    entries: PuzzleCatalogEntry[];
}

interface ToolLike {
    name: string;
    description: string;
    parameters: TSchema;
}

function productionSchema(schema: TSchema): TSchema {
    const variants = (schema as TSchema & { anyOf?: TSchema[] }).anyOf;
    if (variants === undefined) return schema;

    return variants.find((variant) => {
        const properties = (variant as TSchema & {
            properties?: Record<string, { const?: unknown }>;
        }).properties;
        return properties?.mode?.const === "production";
    }) ?? schema;
}

function omitSchemaProperties(schema: TSchema, names: string[]): TSchema {
    if (names.length === 0) return schema;
    const objectSchema = schema as TSchema & {
        properties?: Record<string, TSchema>;
        required?: string[];
    };
    if (objectSchema.properties === undefined) return schema;
    const omitted = new Set(names);
    return {
        ...objectSchema,
        properties: Object.fromEntries(
            Object.entries(objectSchema.properties).filter(([name]) => !omitted.has(name))
        ),
        ...(objectSchema.required === undefined
            ? {}
            : { required: objectSchema.required.filter((name) => !omitted.has(name)) })
    };
}

function textPuzzleEntry<Spec extends PuzzleGenerationSpec>(options: {
    tool: ToolLike;
    puzzleType: string;
    subtype: string;
    displayName: string;
    narrativeTags: string[];
    difficultyControls?: string[];
    generationSpecConstraints?: string[];
    validateGenerationSpec?: (spec: Record<string, unknown>) => string[];
    compile?: (spec: Spec) => PrivatePuzzleInstance;
    bundle?: PuzzleBundleCapabilities;
}): PuzzleCatalogEntry {
    const authoredContent = authoredContentForPuzzle(options.subtype);
    const compile = options.compile;
    return {
        puzzleType: options.puzzleType,
        subtype: options.subtype,
        displayName: options.displayName,
        description: options.tool.description,
        generatorTool: options.tool.name,
        generationSpecSchema: omitSchemaProperties(
            productionSchema(options.tool.parameters),
            authoredContent?.fields ?? []
        ),
        inputs: [{
            key: "intendedSolution",
            dataType: "string",
            valueType: "text",
            description: "The upstream answer around which the puzzle artifact is generated.",
            required: true
        }],
        outputs: [{
            key: "solution",
            dataType: "string",
            valueType: "text",
            description: "The value recovered by solving the puzzle."
        }],
        narrativeTags: options.narrativeTags,
        difficultyControls: options.difficultyControls ?? [],
        ...(authoredContent === undefined ? {} : { authoredContent }),
        ...(options.generationSpecConstraints === undefined
            ? {}
            : { generationSpecConstraints: options.generationSpecConstraints }),
        ...(options.validateGenerationSpec === undefined
            ? {}
            : { validateGenerationSpec: options.validateGenerationSpec }),
        ...(compile === undefined ? {} : {
            compileGenerationSpec: (spec: Record<string, unknown>) => compile(spec as unknown as Spec)
        }),
        bundle: options.bundle ?? {
            placements: ["page-body", "downloadable-file"],
            integrity: "text-content"
        }
    };
}

function alphabeticAnswer(normalize: (answer: string) => string): Pick<
    PuzzleCatalogEntry, "generationSpecConstraints" | "validateGenerationSpec"
> {
    return {
        generationSpecConstraints: [
            "intendedSolution must contain English letters and spaces only. Choose a different subtype when the exact required answer contains digits or punctuation."
        ],
        validateGenerationSpec(spec) {
            // The generator's schema has already checked that intendedSolution is a string.
            try {
                normalize(spec.intendedSolution as string);
                return [];
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return [`has an incompatible generationSpec.intendedSolution: ${message} Choose a subtype that preserves the exact required answer.`];
            }
        }
    };
}

const altTextGenerationSpecConstraints = [
    "altText must be a natural image description containing intendedSolution exactly.",
    "Keep intendedSolution out of visibleTitle, visibleBody, imageLabel, and imageCaption.",
    "Give imageLabel a meaningful word in common with the title, body, or caption. Use visible control labels for ordinary navigation; an alt-text answer should be evidence that only the image description reveals."
];

function validateAltTextGenerationSpec(spec: Record<string, unknown>): string[] {
    // The generation schema validates all copy fields before this hook runs.
    try {
        normalizeAndValidateAltTextCopy(spec as unknown as Parameters<typeof normalizeAndValidateAltTextCopy>[0]);
        return [];
    } catch (error) {
        return [`alt-text generationSpec failed: ${error instanceof Error ? error.message : String(error)} `
            + "Revise the upstream copy without changing required values, or choose a mechanic that fits how the evidence is presented."];
    }
}

const visualClueGenerationSpecConstraints = [
    "clueLabel must exactly equal intendedSolution after whitespace normalization.",
    "The exact intendedSolution must not appear in sceneTitle, sceneTheme, sceneDescription, or imageCaption; reserve it for the clue artwork and clue-specific metadata."
];

const anomalousPhraseGenerationSpecConstraints = [
    "documentTemplate must contain exactly one anomaly placeholder ({{ANOMALY}} unless placeholder supplies another exact token).",
    "Every normalPatternEvidence item must be a distinct exact excerpt already present in documentTemplate outside the anomaly placeholder; do not write abstract descriptions of evidence.",
    "normalPatternEvidence must not contain intendedSolution, and anomalousPhrase must contain intendedSolution."
];

const pageVersionGenerationSpecConstraints = [
    "Both dated snapshots must be credible states of the same webpage; the meaningful evidence must come from added, removed, revealed, or altered content.",
    "Do not claim that a page changes after another puzzle is solved unless the runtime supplies an enforceable trigger.",
    "For removed-content, baselineBody must contain intendedSolution exactly once and currentBody must omit it.",
    "baselineDate and currentDate must be real YYYY-MM-DD publication dates, and baselineDate must be earlier than currentDate.",
    "Optional baselineLabel and currentLabel must be site-native descriptions; never use Baseline or Current as player-facing labels."
];

function validatePageVersionGenerationSpec(spec: Record<string, unknown>): string[] {
    const baselineDate = typeof spec.baselineDate === "string" ? spec.baselineDate : "";
    const currentDate = typeof spec.currentDate === "string" ? spec.currentDate : "";
    const validDate = (value: string): boolean => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const [year, month, day] = value.split("-").map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return parsed.getUTCFullYear() === year
            && parsed.getUTCMonth() === month - 1
            && parsed.getUTCDate() === day;
    };
    const errors: string[] = [];
    if (!validDate(baselineDate) || !validDate(currentDate) || baselineDate >= currentDate) {
        errors.push("page-version generationSpec requires real chronological baselineDate and currentDate values in YYYY-MM-DD format.");
    }
    for (const field of ["baselineLabel", "currentLabel"] as const) {
        const label = spec[field];
        if (typeof label === "string" && /\b(?:baseline|current)\b/i.test(label.trim())) {
            errors.push(`page-version generationSpec.${field} must use a site-native description, not ${label.trim()}.`);
        }
    }
    if (spec.changeKind === "removed-content") {
        const solution = typeof spec.intendedSolution === "string" ? spec.intendedSolution.trim() : "";
        const baselineBody = typeof spec.baselineBody === "string" ? spec.baselineBody : "";
        const currentBody = typeof spec.currentBody === "string" ? spec.currentBody : "";
        const occurrences = solution.length === 0 ? 0 : baselineBody.split(solution).length - 1;
        if (occurrences !== 1 || currentBody.includes(solution)) {
            errors.push("page-version removed-content requires baselineBody to contain intendedSolution exactly once and currentBody to omit it.");
        }
    }
    return errors;
}

function validateVisualClueGenerationSpec(spec: Record<string, unknown>): string[] {
    const normalized = (value: unknown): string => typeof value === "string"
        ? value.trim().replace(/\s+/g, " ")
        : "";
    const solution = normalized(spec.intendedSolution);
    const clueLabel = normalized(spec.clueLabel);
    const errors: string[] = [];
    if (clueLabel !== solution) {
        errors.push("visual-clue generationSpec.clueLabel must exactly match intendedSolution.");
    }
    for (const field of ["sceneTitle", "sceneTheme", "sceneDescription", "imageCaption"] as const) {
        const value = normalized(spec[field]);
        if (solution.length > 0 && value.includes(solution)) {
            errors.push(`visual-clue generationSpec.${field} must not contain intendedSolution; place the exact answer only in clueLabel.`);
        }
    }
    return errors;
}

export const repositoryPuzzleCatalog: PuzzleCatalog = {
    version: "repository-puzzles-2.0.0",
    entries: [
        textPuzzleEntry({ tool: createAcrosticPuzzleTool, puzzleType: "hidden-information", subtype: "cover-text-line-acrostic", displayName: "Acrostic", narrativeTags: ["document", "text", "investigation"], ...alphabeticAnswer(normalizeAcrosticPhrase) }),
        textPuzzleEntry({ tool: createAlphaChannelPuzzleTool, puzzleType: "hidden-information", subtype: "alpha-channel", displayName: "Alpha channel", narrativeTags: ["image", "forensics", "hidden-data"], bundle: { placements: ["media-viewer", "downloadable-file"], integrity: "exact-file" } }),
        textPuzzleEntry({
            tool: createAltTextPuzzleTool,
            puzzleType: "hidden-information",
            subtype: "alt-text",
            displayName: "Alt text",
            narrativeTags: ["web", "image", "accessibility", "hidden-data"],
            generationSpecConstraints: altTextGenerationSpecConstraints,
            validateGenerationSpec: validateAltTextGenerationSpec,
            bundle: { placements: ["native-html"], integrity: "html-source" }
        }),
        textPuzzleEntry({ tool: createAnagramPuzzleTool, puzzleType: "reconstruction", subtype: "anagram", displayName: "Anagram", narrativeTags: ["text", "reconstruction"], ...alphabeticAnswer(normalizeAnagramAnswer) }),
        textPuzzleEntry({
            tool: createAnomalousPhrasePuzzleTool,
            puzzleType: "hidden-information",
            subtype: "anomalous-phrase",
            displayName: "Anomalous phrase",
            narrativeTags: ["document", "research", "investigation"],
            generationSpecConstraints: anomalousPhraseGenerationSpecConstraints,
            compile: createAnomalousPhrasePuzzle
        }),
        textPuzzleEntry({ tool: createAsciiArtPuzzleTool, puzzleType: "visual-recognition", subtype: "ascii-art", displayName: "ASCII art", narrativeTags: ["terminal", "visual", "text"] }),
        textPuzzleEntry({ tool: createAsciiPuzzleTool, compile: createAsciiPuzzle, puzzleType: "encoding", subtype: "ascii-code", displayName: "ASCII code", narrativeTags: ["encoding", "terminal", "text"], difficultyControls: ["radix"] }),
        textPuzzleEntry({ tool: createBinaryCapitalizationPuzzleTool, puzzleType: "hidden-information", subtype: "binary-capitalization-pattern", displayName: "Binary capitalization", narrativeTags: ["document", "binary", "hidden-data"] }),
        textPuzzleEntry({ tool: createCaesarPuzzleTool, compile: createCaesarPuzzle, puzzleType: "encoding", subtype: "caesar-cipher", displayName: "Caesar cipher", narrativeTags: ["cipher", "message", "text"], difficultyControls: ["shift"] }),
        textPuzzleEntry({ tool: createCapitalLetterExtractionPuzzleTool, puzzleType: "hidden-information", subtype: "capital-letter-extraction", displayName: "Capital-letter extraction", narrativeTags: ["document", "text", "hidden-data"], ...alphabeticAnswer(normalizeCapitalLetterSolution) }),
        textPuzzleEntry({ tool: createColorChannelPuzzleTool, puzzleType: "hidden-information", subtype: "color-channel", displayName: "Color channel", narrativeTags: ["image", "forensics", "hidden-data"], difficultyControls: ["channel"], bundle: { placements: ["media-viewer", "downloadable-file"], integrity: "exact-file" } }),
        textPuzzleEntry({ tool: createDomElementPuzzleTool, compile: createDomElementPuzzle, puzzleType: "hidden-information", subtype: "dom-element", displayName: "DOM element", narrativeTags: ["web", "source", "hidden-data"], difficultyControls: ["hideStrategy"], bundle: { placements: ["native-html"], integrity: "html-source" } }),
        textPuzzleEntry({ tool: createHtmlCommentPuzzleTool, compile: createHtmlCommentPuzzle, puzzleType: "hidden-information", subtype: "html-comment", displayName: "HTML comment", narrativeTags: ["web", "source", "hidden-data"], bundle: { placements: ["native-html"], integrity: "html-source" } }),
        textPuzzleEntry({ tool: createMorseAudioPuzzleTool, puzzleType: "hidden-information", subtype: "morse-audio", displayName: "Morse audio", narrativeTags: ["audio", "encoding", "message"], difficultyControls: ["unitDurationMs"], bundle: { placements: ["media-viewer", "downloadable-file"], integrity: "exact-file" } }),
        textPuzzleEntry({ tool: createMorsePuzzleTool, compile: createMorsePuzzle, puzzleType: "encoding", subtype: "morse-code", displayName: "Morse code", narrativeTags: ["encoding", "message", "text"] }),
        textPuzzleEntry({ tool: createNthCharacterPuzzleTool, puzzleType: "hidden-information", subtype: "periodic-letter-extraction", displayName: "Periodic letter extraction", narrativeTags: ["document", "text", "hidden-data"], difficultyControls: ["step", "startIndex"], ...alphabeticAnswer(normalizeNthCharacterSolution) }),
        textPuzzleEntry({ tool: createNthWordPuzzleTool, puzzleType: "hidden-information", subtype: "periodic-word-extraction", displayName: "Periodic word extraction", narrativeTags: ["document", "text", "hidden-data"], difficultyControls: ["step", "startIndex"], ...alphabeticAnswer(normalizeNthWordPhrase) }),
        textPuzzleEntry({
            tool: createPageVersionPuzzleTool,
            puzzleType: "hidden-information",
            subtype: "page-version",
            displayName: "Page version",
            narrativeTags: ["web", "comparison", "investigation"],
            difficultyControls: ["changeKind"],
            generationSpecConstraints: pageVersionGenerationSpecConstraints,
            validateGenerationSpec: validatePageVersionGenerationSpec,
            compile: createPageVersionPuzzle,
            bundle: { placements: ["version-set"], integrity: "html-source" }
        }),
        textPuzzleEntry({
            tool: createQrCodePuzzleTool,
            puzzleType: "encoding",
            subtype: "qr-code",
            displayName: "QR code",
            narrativeTags: ["image", "encoding", "identifier"],
            generationSpecConstraints: [`The QR payload must fit in ${MAX_QR_PAYLOAD_BYTES} UTF-8 bytes. Use another mechanic if the exact required value is longer.`],
            compile: createQrCodePuzzle,
            bundle: { placements: ["media-viewer", "downloadable-file"], integrity: "exact-file" }
        }),
        textPuzzleEntry({ tool: createReverseAudioPuzzleTool, puzzleType: "hidden-information", subtype: "reverse-audio", displayName: "Reverse audio", narrativeTags: ["audio", "forensics", "message"], bundle: { placements: ["media-viewer", "downloadable-file"], integrity: "exact-file" } }),
        textPuzzleEntry({ tool: createSecureRelayPuzzleTool, puzzleType: "secure-communication", subtype: "asymmetric-sealed-relay", displayName: "Secure relay", narrativeTags: ["communication", "cryptography", "identity"] }),
        textPuzzleEntry({ tool: createSourceCodePuzzleTool, compile: createSourceCodePuzzle, puzzleType: "hidden-information", subtype: "html-source-inspection", displayName: "HTML source inspection", narrativeTags: ["web", "source", "hidden-data"], difficultyControls: ["carrier"], bundle: { placements: ["native-html"], integrity: "html-source" } }),
        textPuzzleEntry({ tool: createStaticUrlPuzzleTool, puzzleType: "hidden-information", subtype: "static-url", displayName: "Static URL", narrativeTags: ["web", "url", "investigation"], difficultyControls: ["manipulationKind"] }),
        textPuzzleEntry({ tool: createSteganographyPuzzleTool, puzzleType: "hidden-information", subtype: "steganography", displayName: "Steganography", narrativeTags: ["image", "forensics", "hidden-data"], bundle: { placements: ["media-viewer", "downloadable-file"], integrity: "exact-file" } }),
        textPuzzleEntry({ tool: createSubstitutionPuzzleTool, puzzleType: "encoding", subtype: "monoalphabetic-substitution", displayName: "Substitution cipher", narrativeTags: ["cipher", "message", "text"], ...alphabeticAnswer(normalizeSubstitutionPhrase) }),
        textPuzzleEntry({ tool: createTelestichPuzzleTool, puzzleType: "hidden-information", subtype: "cover-text-line-telestich", displayName: "Telestich", narrativeTags: ["document", "text", "hidden-data"], ...alphabeticAnswer(normalizeTelestichPhrase) }),
        textPuzzleEntry({ tool: createVigenerePuzzleTool, puzzleType: "encoding", subtype: "vigenere-cipher", displayName: "Vigenere cipher", narrativeTags: ["cipher", "message", "text"], difficultyControls: ["key"], ...alphabeticAnswer(normalizeVigenerePhrase) }),
        textPuzzleEntry({
            tool: createVisualCluePuzzleTool,
            puzzleType: "hidden-information",
            subtype: "visual-clue",
            displayName: "Visual clue",
            narrativeTags: ["image", "observation", "investigation"],
            difficultyControls: ["clueKind"],
            generationSpecConstraints: visualClueGenerationSpecConstraints,
            validateGenerationSpec: validateVisualClueGenerationSpec,
            bundle: { placements: ["media-viewer", "downloadable-file"], integrity: "exact-file" }
        }),
        textPuzzleEntry({ tool: createWordIndexPuzzleTool, puzzleType: "hidden-information", subtype: "cover-text-word-index-cipher", displayName: "Word index", narrativeTags: ["document", "text", "hidden-data"], ...alphabeticAnswer(normalizeWordIndexPhrase) })
    ]
};

export function assertPuzzleCatalog(catalog: PuzzleCatalog): void {
    if (catalog.version.trim().length === 0) throw new Error("Catalog version must not be empty.");
    const seen = new Set<string>();
    for (const entry of catalog.entries) {
        if (seen.has(entry.subtype)) throw new Error(`Duplicate puzzle subtype in catalog: ${entry.subtype}.`);
        seen.add(entry.subtype);
        if (entry.bundle.placements.length === 0) {
            throw new Error(`Puzzle subtype ${entry.subtype} has no bundle placement strategy.`);
        }
        if (new Set(entry.bundle.placements).size !== entry.bundle.placements.length) {
            throw new Error(`Puzzle subtype ${entry.subtype} has duplicate bundle placement strategies.`);
        }
    }
}

export function getPuzzleCatalogEntry(catalog: PuzzleCatalog, subtype: string): PuzzleCatalogEntry | undefined {
    return catalog.entries.find((entry) => entry.subtype === subtype);
}

export function catalogForPrompt(catalog: PuzzleCatalog): unknown {
    return {
        version: catalog.version,
        entries: catalog.entries.map((entry) => ({
            puzzleType: entry.puzzleType,
            subtype: entry.subtype,
            displayName: entry.displayName,
            description: entry.description,
            generationSpecSchema: entry.generationSpecSchema,
            outputCapabilities: entry.outputs,
            levelInputGuidance: "Declare only data materially used by the puzzle. Sources and optional transformations are defined by the level blueprint.",
            narrativeTags: entry.narrativeTags,
            difficultyControls: entry.difficultyControls,
            ...(entry.authoredContent === undefined
                ? {}
                : { authoredContent: entry.authoredContent }),
            ...(entry.generationSpecConstraints === undefined
                ? {}
                : { generationSpecConstraints: entry.generationSpecConstraints })
        }))
    };
}
