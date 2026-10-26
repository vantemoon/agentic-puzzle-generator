import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Agent, AgentEvent } from "@earendil-works/pi-agent-core";

import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleArtifact,
    validateNormalizedTextAnswer
} from "../core/types.js";
import { getPuzzleCatalogEntry, type PuzzleCatalog } from "./catalog.js";
import type { LevelBlueprint, PuzzleNode } from "./types.js";

type AgentFactory = () => Promise<Agent>;

const agentFactories: Record<string, AgentFactory> = {
    "cover-text-line-acrostic": async () => (await import("../agents/acrostic/agent.js")).createAcrosticAgent(),
    "alpha-channel": async () => (await import("../agents/alpha-channel/agent.js")).createAlphaChannelAgent(),
    "alt-text": async () => (await import("../agents/alt-text/agent.js")).createAltTextAgent(),
    "anagram": async () => (await import("../agents/anagram/agent.js")).createAnagramAgent(),
    "anomalous-phrase": async () => (await import("../agents/anomalous-phrase/agent.js")).createAnomalousPhraseAgent(),
    "ascii-art": async () => (await import("../agents/ascii-art/agent.js")).createAsciiArtAgent(),
    "ascii-code": async () => (await import("../agents/ascii/agent.js")).createAsciiAgent(),
    "binary-capitalization-pattern": async () => (await import("../agents/binary-capitalization/agent.js")).createBinaryCapitalizationAgent(),
    "caesar-cipher": async () => (await import("../agents/caesar/agent.js")).createCaesarAgent(),
    "capital-letter-extraction": async () => (await import("../agents/capital-letter-extraction/agent.js")).createCapitalLetterExtractionAgent(),
    "color-channel": async () => (await import("../agents/color-channel/agent.js")).createColorChannelAgent(),
    "dom-element": async () => (await import("../agents/dom-element/agent.js")).createDomElementAgent(),
    "html-comment": async () => (await import("../agents/html-comment/agent.js")).createHtmlCommentAgent(),
    "morse-audio": async () => (await import("../agents/morse-audio/agent.js")).createMorseAudioAgent(),
    "morse-code": async () => (await import("../agents/morse/agent.js")).createMorseAgent(),
    "periodic-letter-extraction": async () => (await import("../agents/nth-character/agent.js")).createNthCharacterAgent(),
    "periodic-word-extraction": async () => (await import("../agents/nth-word/agent.js")).createNthWordAgent(),
    "page-version": async () => (await import("../agents/page-version/agent.js")).createPageVersionAgent(),
    "qr-code": async () => (await import("../agents/qr-code/agent.js")).createQrCodeAgent(),
    "reverse-audio": async () => (await import("../agents/reverse-audio/agent.js")).createReverseAudioAgent(),
    "asymmetric-sealed-relay": async () => (await import("../agents/secure-relay/agent.js")).createSecureRelayAgent(),
    "html-source-inspection": async () => (await import("../agents/html-source-inspection/agent.js")).createSourceCodeAgent(),
    "static-url": async () => (await import("../agents/static-url/agent.js")).createStaticUrlAgent(),
    "steganography": async () => (await import("../agents/steganography/agent.js")).createSteganographyAgent(),
    "monoalphabetic-substitution": async () => (await import("../agents/substitution/agent.js")).createSubstitutionAgent(),
    "cover-text-line-telestich": async () => (await import("../agents/telestich/agent.js")).createTelestichAgent(),
    "vigenere-cipher": async () => (await import("../agents/vigenere/agent.js")).createVigenereAgent(),
    "visual-clue": async () => (await import("../agents/visual-clue/agent.js")).createVisualClueAgent(),
    "cover-text-word-index-cipher": async () => (await import("../agents/word-index/agent.js")).createWordIndexAgent()
};

export interface PuzzleGenerationHandoff {
    levelId: string;
    puzzleId: string;
    puzzleType: string;
    subtype: string;
    generatorTool: string;
    generationSpec: Record<string, unknown>;
    verification: PuzzleNode["design"]["verification"];
}

export function supportedPuzzleGeneratorSubtypes(): string[] {
    return Object.keys(agentFactories);
}

export function createPuzzleGenerationHandoff(
    level: LevelBlueprint,
    puzzleId: string,
    catalog: PuzzleCatalog
): PuzzleGenerationHandoff {
    const puzzle = level.puzzles.find((candidate) => candidate.id === puzzleId);
    if (puzzle === undefined) throw new Error(`Level ${level.id} has no puzzle named ${puzzleId}.`);
    const entry = getPuzzleCatalogEntry(catalog, puzzle.design.subtype);
    if (entry === undefined) throw new Error(`No catalog entry exists for subtype ${puzzle.design.subtype}.`);
    if (agentFactories[puzzle.design.subtype] === undefined) {
        throw new Error(`No puzzle-generation agent is registered for subtype ${puzzle.design.subtype}.`);
    }
    if (puzzle.design.generationSpec.mode !== "production") {
        throw new Error(`Puzzle ${puzzle.id} must use a production generationSpec.`);
    }

    return {
        levelId: level.id,
        puzzleId: puzzle.id,
        puzzleType: puzzle.design.puzzleType,
        subtype: puzzle.design.subtype,
        generatorTool: entry.generatorTool,
        generationSpec: puzzle.design.generationSpec,
        verification: puzzle.design.verification
    };
}

export function buildPuzzleGenerationPrompt(handoff: PuzzleGenerationHandoff): string {
    const toolInstruction = handoff.subtype === "visual-clue"
        ? "Preserve every supplied field. Create context-specific backgroundElements and clueElements drawing plans, decide showClueLabel from visual ambiguity, then call your puzzle creation tool with the augmented object:"
        : "Preserve every supplied field and call your puzzle creation tool with exactly this JSON object:";
    return [
        "Generate this production puzzle from the upstream level-design specification.",
        toolInstruction,
        JSON.stringify(handoff.generationSpec, null, 2)
    ].join("\n\n");
}

export function validateGeneratedPuzzle(
    handoff: PuzzleGenerationHandoff,
    value: unknown
): PrivatePuzzleInstance {
    assertPrivatePuzzleInstance(value);
    if (value.id !== handoff.puzzleId) throw new Error(`Generated puzzle ID ${value.id} does not match ${handoff.puzzleId}.`);
    if (value.puzzleType !== handoff.puzzleType) throw new Error(`Generated puzzle type ${value.puzzleType} does not match ${handoff.puzzleType}.`);
    if (value.subtype !== handoff.subtype) throw new Error(`Generated puzzle subtype ${value.subtype} does not match ${handoff.subtype}.`);

    const expected = handoff.verification.expectedValue;
    if (typeof expected !== "string") throw new Error("Puzzle generators currently support string verification answers only.");
    if (value.validator.kind === "normalized-text") {
        if (!validateNormalizedTextAnswer(value, expected)) {
            throw new Error(`Generated puzzle does not accept the designed answer for ${handoff.puzzleId}.`);
        }
    } else {
        const transferred = value.inputs.find((input) => input.key === "transferred_payload")?.value;
        if (transferred !== expected) {
            throw new Error(`Generated secure-relay puzzle does not preserve the designed payload for ${handoff.puzzleId}.`);
        }
    }
    return value;
}

export function stopAfterSuccessfulTool(
    agent: Pick<Agent, "afterToolCall">,
    toolName: string
): void {
    const existingHook = agent.afterToolCall;
    agent.afterToolCall = async (context, signal) => {
        const existingResult = await existingHook?.(context, signal);
        if (context.toolCall.name === toolName && !context.isError) {
            return { ...existingResult, terminate: true };
        }
        return existingResult;
    };
}

export async function generatePuzzleFromHandoff(
    handoff: PuzzleGenerationHandoff
): Promise<PrivatePuzzleInstance> {
    const factory = agentFactories[handoff.subtype];
    if (factory === undefined) throw new Error(`No puzzle-generation agent is registered for subtype ${handoff.subtype}.`);
    const agent = await factory();
    stopAfterSuccessfulTool(agent, handoff.generatorTool);
    let generated: unknown;

    agent.subscribe((event: AgentEvent) => {
        if (
            event.type === "tool_execution_end" &&
            event.toolName === handoff.generatorTool &&
            !event.isError
        ) {
            generated = event.result.details;
        }
    });

    await agent.prompt(buildPuzzleGenerationPrompt(handoff));
    if (generated === undefined) {
        throw new Error(agent.state.errorMessage || `The ${handoff.subtype} agent did not generate a puzzle.`);
    }
    return validateGeneratedPuzzle(handoff, generated);
}

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("Puzzle ID cannot be converted to a safe filename.");
    return stem;
}

export function generatedPuzzlePath(levelId: string, puzzleId: string, rootDirectory = "generated-puzzles"): string {
    return path.resolve(rootDirectory, safeFileStem(levelId), `${safeFileStem(puzzleId)}.puzzle.json`);
}

export function generatedPuzzleArtifactDirectory(
    levelId: string,
    puzzleId: string,
    rootDirectory = "generated-puzzles"
): string {
    return path.resolve(rootDirectory, safeFileStem(levelId), safeFileStem(puzzleId));
}

function artifactEntryName(artifact: PuzzleArtifact): string {
    if (artifact.kind === "html") return artifact.entryPath.replace(/^\/+/, "");
    if (artifact.kind === "text") return "puzzle.txt";
    if (artifact.kind === "audio") return "puzzle.wav";
    return artifact.mediaType === "image/svg+xml" ? "puzzle.svg" : "puzzle.png";
}

export function generatedPuzzleArtifactEntryPath(
    levelId: string,
    puzzle: Pick<PrivatePuzzleInstance, "id" | "artifact">,
    rootDirectory = "generated-puzzles"
): string {
    return path.join(
        generatedPuzzleArtifactDirectory(levelId, puzzle.id, rootDirectory),
        artifactEntryName(puzzle.artifact)
    );
}

async function writeDeployableArtifact(
    levelId: string,
    puzzle: PrivatePuzzleInstance,
    rootDirectory: string
): Promise<void> {
    const artifactDirectory = generatedPuzzleArtifactDirectory(levelId, puzzle.id, rootDirectory);
    await rm(artifactDirectory, { recursive: true, force: true });
    await mkdir(artifactDirectory, { recursive: true });

    if (puzzle.artifact.kind === "html") {
        for (const file of puzzle.artifact.files) {
            const relativePath = file.path.replace(/^\/+/, "");
            const outputPath = path.resolve(artifactDirectory, relativePath);
            const relativeOutput = path.relative(artifactDirectory, outputPath);
            if (relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
                throw new Error(`Artifact path escapes its deployment directory: ${file.path}`);
            }
            await mkdir(path.dirname(outputPath), { recursive: true });
            await writeFile(outputPath, file.source, "utf8");
        }
        return;
    }

    const outputPath = generatedPuzzleArtifactEntryPath(levelId, puzzle, rootDirectory);
    if (puzzle.artifact.kind === "text") {
        await writeFile(outputPath, puzzle.artifact.source, "utf8");
    } else if (puzzle.artifact.kind === "audio" || puzzle.artifact.mediaType === "image/png") {
        await writeFile(outputPath, Buffer.from(puzzle.artifact.data, "base64"));
    } else {
        await writeFile(outputPath, puzzle.artifact.source, "utf8");
    }
}

export async function writeGeneratedPuzzle(
    levelId: string,
    puzzle: PrivatePuzzleInstance,
    rootDirectory = "generated-puzzles"
): Promise<string> {
    const outputPath = generatedPuzzlePath(levelId, puzzle.id, rootDirectory);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeDeployableArtifact(levelId, puzzle, rootDirectory);
    await writeFile(outputPath, `${JSON.stringify(puzzle, null, 2)}\n`, "utf8");
    return outputPath;
}
