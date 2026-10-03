import Type, { type TSchema } from "typebox";

import { createAcrosticPuzzleTool } from "../agents/acrostic/tool.js";
import { createAlphaChannelPuzzleTool } from "../agents/alpha-channel/tool.js";
import { createAltTextPuzzleTool } from "../agents/alt-text/tool.js";
import { createAnagramPuzzleTool } from "../agents/anagram/tool.js";
import { createAnomalousPhrasePuzzleTool } from "../agents/anomalous-phrase/tool.js";
import { createAsciiArtPuzzleTool } from "../agents/ascii-art/tool.js";
import { createAsciiPuzzleTool } from "../agents/ascii/tool.js";
import { createBinaryCapitalizationPuzzleTool } from "../agents/binary-capitalization/tool.js";
import { createCaesarPuzzleTool } from "../agents/caesar/tool.js";
import { createCapitalLetterExtractionPuzzleTool } from "../agents/capital-letter-extraction/tool.js";
import { createColorChannelPuzzleTool } from "../agents/color-channel/tool.js";
import { createDomElementPuzzleTool } from "../agents/dom-element/tool.js";
import { createHtmlCommentPuzzleTool } from "../agents/html-comment/tool.js";
import { createMorseAudioPuzzleTool } from "../agents/morse-audio/tool.js";
import { createMorsePuzzleTool } from "../agents/morse/tool.js";
import { createNthCharacterPuzzleTool } from "../agents/nth-character/tool.js";
import { createNthWordPuzzleTool } from "../agents/nth-word/tool.js";
import { createPageVersionPuzzleTool } from "../agents/page-version/tool.js";
import { createQrCodePuzzleTool } from "../agents/qr-code/tool.js";
import { createReverseAudioPuzzleTool } from "../agents/reverse-audio/tool.js";
import { createSecureRelayPuzzleTool } from "../agents/secure-relay/tool.js";
import { createSourceCodePuzzleTool } from "../agents/source-code/tool.js";
import { createStaticUrlPuzzleTool } from "../agents/static-url/tool.js";
import { createSteganographyPuzzleTool } from "../agents/steganography/tool.js";
import { createSubstitutionPuzzleTool } from "../agents/substitution/tool.js";
import { createTelestichPuzzleTool } from "../agents/telestich/tool.js";
import { createVigenerePuzzleTool } from "../agents/vigenere/tool.js";
import { createVisualCluePuzzleTool } from "../agents/visual-clue/tool.js";
import { createWordIndexPuzzleTool } from "../agents/word-index/tool.js";
import type { ScalarDataType } from "./types.js";

export interface CatalogPort {
    key: string;
    dataType: ScalarDataType;
    valueType: string;
    description: string;
    required?: boolean;
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
    supportedHintPolicies: Array<"explicit" | "contextual" | "hidden">;
    difficultyControls: string[];
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

function textPuzzleEntry(options: {
    tool: ToolLike;
    puzzleType: string;
    subtype: string;
    displayName: string;
    narrativeTags: string[];
    difficultyControls?: string[];
}): PuzzleCatalogEntry {
    return {
        puzzleType: options.puzzleType,
        subtype: options.subtype,
        displayName: options.displayName,
        description: options.tool.description,
        generatorTool: options.tool.name,
        generationSpecSchema: productionSchema(options.tool.parameters),
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
        supportedHintPolicies: ["explicit", "contextual", "hidden"],
        difficultyControls: options.difficultyControls ?? []
    };
}

export const repositoryPuzzleCatalog: PuzzleCatalog = {
    version: "repository-puzzles-2.0.0",
    entries: [
        textPuzzleEntry({ tool: createAcrosticPuzzleTool, puzzleType: "hidden-information", subtype: "cover-text-line-acrostic", displayName: "Acrostic", narrativeTags: ["document", "text", "investigation"] }),
        textPuzzleEntry({ tool: createAlphaChannelPuzzleTool, puzzleType: "hidden-information", subtype: "alpha-channel", displayName: "Alpha channel", narrativeTags: ["image", "forensics", "hidden-data"], difficultyControls: ["recognitionLevel"] }),
        textPuzzleEntry({ tool: createAltTextPuzzleTool, puzzleType: "hidden-information", subtype: "alt-text", displayName: "Alt text", narrativeTags: ["web", "image", "accessibility", "hidden-data"], difficultyControls: ["recognitionLevel"] }),
        textPuzzleEntry({ tool: createAnagramPuzzleTool, puzzleType: "reconstruction", subtype: "anagram", displayName: "Anagram", narrativeTags: ["text", "reconstruction"] }),
        textPuzzleEntry({ tool: createAnomalousPhrasePuzzleTool, puzzleType: "hidden-information", subtype: "anomalous-phrase", displayName: "Anomalous phrase", narrativeTags: ["document", "research", "investigation"] }),
        textPuzzleEntry({ tool: createAsciiArtPuzzleTool, puzzleType: "visual-recognition", subtype: "ascii-art", displayName: "ASCII art", narrativeTags: ["terminal", "visual", "text"] }),
        textPuzzleEntry({ tool: createAsciiPuzzleTool, puzzleType: "encoding", subtype: "ascii-code", displayName: "ASCII code", narrativeTags: ["encoding", "terminal", "text"], difficultyControls: ["radix"] }),
        textPuzzleEntry({ tool: createBinaryCapitalizationPuzzleTool, puzzleType: "hidden-information", subtype: "binary-capitalization-pattern", displayName: "Binary capitalization", narrativeTags: ["document", "binary", "hidden-data"] }),
        textPuzzleEntry({ tool: createCaesarPuzzleTool, puzzleType: "encoding", subtype: "caesar-cipher", displayName: "Caesar cipher", narrativeTags: ["cipher", "message", "text"], difficultyControls: ["shift"] }),
        textPuzzleEntry({ tool: createCapitalLetterExtractionPuzzleTool, puzzleType: "hidden-information", subtype: "capital-letter-extraction", displayName: "Capital-letter extraction", narrativeTags: ["document", "text", "hidden-data"] }),
        textPuzzleEntry({ tool: createColorChannelPuzzleTool, puzzleType: "hidden-information", subtype: "color-channel", displayName: "Color channel", narrativeTags: ["image", "forensics", "hidden-data"], difficultyControls: ["recognitionLevel", "channel"] }),
        textPuzzleEntry({ tool: createDomElementPuzzleTool, puzzleType: "hidden-information", subtype: "dom-element", displayName: "DOM element", narrativeTags: ["web", "source", "hidden-data"], difficultyControls: ["recognitionLevel", "hideStrategy"] }),
        textPuzzleEntry({ tool: createHtmlCommentPuzzleTool, puzzleType: "hidden-information", subtype: "html-comment", displayName: "HTML comment", narrativeTags: ["web", "source", "hidden-data"], difficultyControls: ["recognitionLevel"] }),
        textPuzzleEntry({ tool: createMorseAudioPuzzleTool, puzzleType: "hidden-information", subtype: "morse-audio", displayName: "Morse audio", narrativeTags: ["audio", "encoding", "message"], difficultyControls: ["recognitionLevel", "unitDurationMs"] }),
        textPuzzleEntry({ tool: createMorsePuzzleTool, puzzleType: "encoding", subtype: "morse-code", displayName: "Morse code", narrativeTags: ["encoding", "message", "text"] }),
        textPuzzleEntry({ tool: createNthCharacterPuzzleTool, puzzleType: "hidden-information", subtype: "periodic-letter-extraction", displayName: "Periodic letter extraction", narrativeTags: ["document", "text", "hidden-data"], difficultyControls: ["step", "startIndex"] }),
        textPuzzleEntry({ tool: createNthWordPuzzleTool, puzzleType: "hidden-information", subtype: "periodic-word-extraction", displayName: "Periodic word extraction", narrativeTags: ["document", "text", "hidden-data"], difficultyControls: ["step", "startIndex"] }),
        textPuzzleEntry({ tool: createPageVersionPuzzleTool, puzzleType: "hidden-information", subtype: "page-version", displayName: "Page version", narrativeTags: ["web", "comparison", "investigation"], difficultyControls: ["recognitionLevel", "changeKind"] }),
        textPuzzleEntry({ tool: createQrCodePuzzleTool, puzzleType: "encoding", subtype: "qr-code", displayName: "QR code", narrativeTags: ["image", "encoding", "identifier"], difficultyControls: ["recognitionLevel"] }),
        textPuzzleEntry({ tool: createReverseAudioPuzzleTool, puzzleType: "hidden-information", subtype: "reverse-audio", displayName: "Reverse audio", narrativeTags: ["audio", "forensics", "message"], difficultyControls: ["recognitionLevel"] }),
        textPuzzleEntry({ tool: createSecureRelayPuzzleTool, puzzleType: "secure-communication", subtype: "asymmetric-sealed-relay", displayName: "Secure relay", narrativeTags: ["communication", "cryptography", "identity"] }),
        textPuzzleEntry({ tool: createSourceCodePuzzleTool, puzzleType: "hidden-information", subtype: "source-code", displayName: "Source code", narrativeTags: ["web", "source", "hidden-data"], difficultyControls: ["recognitionLevel", "carrier"] }),
        textPuzzleEntry({ tool: createStaticUrlPuzzleTool, puzzleType: "hidden-information", subtype: "static-url", displayName: "Static URL", narrativeTags: ["web", "url", "investigation"], difficultyControls: ["recognitionLevel", "manipulationKind"] }),
        textPuzzleEntry({ tool: createSteganographyPuzzleTool, puzzleType: "hidden-information", subtype: "steganography", displayName: "Steganography", narrativeTags: ["image", "forensics", "hidden-data"], difficultyControls: ["recognitionLevel"] }),
        textPuzzleEntry({ tool: createSubstitutionPuzzleTool, puzzleType: "encoding", subtype: "monoalphabetic-substitution", displayName: "Substitution cipher", narrativeTags: ["cipher", "message", "text"] }),
        textPuzzleEntry({ tool: createTelestichPuzzleTool, puzzleType: "hidden-information", subtype: "cover-text-line-telestich", displayName: "Telestich", narrativeTags: ["document", "text", "hidden-data"] }),
        textPuzzleEntry({ tool: createVigenerePuzzleTool, puzzleType: "encoding", subtype: "vigenere-cipher", displayName: "Vigenere cipher", narrativeTags: ["cipher", "message", "text"], difficultyControls: ["key"] }),
        textPuzzleEntry({ tool: createVisualCluePuzzleTool, puzzleType: "hidden-information", subtype: "visual-clue", displayName: "Visual clue", narrativeTags: ["image", "observation", "investigation"], difficultyControls: ["recognitionLevel", "clueKind"] }),
        textPuzzleEntry({ tool: createWordIndexPuzzleTool, puzzleType: "hidden-information", subtype: "cover-text-word-index-cipher", displayName: "Word index", narrativeTags: ["document", "text", "hidden-data"] })
    ]
};

export function assertPuzzleCatalog(catalog: PuzzleCatalog): void {
    if (catalog.version.trim().length === 0) throw new Error("Catalog version must not be empty.");
    const seen = new Set<string>();
    for (const entry of catalog.entries) {
        if (seen.has(entry.subtype)) throw new Error(`Duplicate puzzle subtype in catalog: ${entry.subtype}.`);
        seen.add(entry.subtype);
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
            supportedHintPolicies: entry.supportedHintPolicies,
            difficultyControls: entry.difficultyControls
        }))
    };
}
