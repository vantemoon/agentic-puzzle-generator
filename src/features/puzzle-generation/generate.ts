import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import type { Agent, AgentEvent, AgentTool } from "@earendil-works/pi-agent-core";

import { authoredContentForPuzzle } from "../../shared/utilities/authored-content.js";
import { promptAgentWithRecovery, type AgentPromptRetryOptions } from "../../shared/agent-runtime/agent-runner.js";
import { safeFileStem } from "../../shared/utilities/file-names.js";
import {
    assertPrivatePuzzleInstance,
    type PrivatePuzzleInstance,
    type PuzzleArtifact
} from "../../shared/artifacts/types.js";
import { getPuzzleCatalogEntry, repositoryPuzzleCatalog, type PuzzleCatalog } from "./catalog.js";
import { assertPuzzleAcceptsAnswer } from "./puzzle-contract.js";
import type { LevelBlueprint, PuzzleNode } from "../level-design/types.js";
import { PLAIN_LANGUAGE_HOUSE_STYLE } from "../../shared/policies/house-style.js";

type AgentFactory = () => Promise<Agent>;
const agentFactories: Record<string, AgentFactory> = {
    "cover-text-line-acrostic": async () => (await import("./generators/cover-text-line-acrostic/agent.js")).createAcrosticAgent(),
    "alpha-channel": async () => (await import("./generators/alpha-channel/agent.js")).createAlphaChannelAgent(),
    "alt-text": async () => (await import("./generators/alt-text/agent.js")).createAltTextAgent(),
    "anagram": async () => (await import("./generators/anagram/agent.js")).createAnagramAgent(),
    "anomalous-phrase": async () => (await import("./generators/anomalous-phrase/agent.js")).createAnomalousPhraseAgent(),
    "ascii-art": async () => (await import("./generators/ascii-art/agent.js")).createAsciiArtAgent(),
    "ascii-code": async () => (await import("./generators/ascii-code/agent.js")).createAsciiAgent(),
    "binary-capitalization-pattern": async () => (await import("./generators/binary-capitalization-pattern/agent.js")).createBinaryCapitalizationAgent(),
    "caesar-cipher": async () => (await import("./generators/caesar-cipher/agent.js")).createCaesarAgent(),
    "capital-letter-extraction": async () => (await import("./generators/capital-letter-extraction/agent.js")).createCapitalLetterExtractionAgent(),
    "color-channel": async () => (await import("./generators/color-channel/agent.js")).createColorChannelAgent(),
    "dom-element": async () => (await import("./generators/dom-element/agent.js")).createDomElementAgent(),
    "html-comment": async () => (await import("./generators/html-comment/agent.js")).createHtmlCommentAgent(),
    "morse-audio": async () => (await import("./generators/morse-audio/agent.js")).createMorseAudioAgent(),
    "morse-code": async () => (await import("./generators/morse-code/agent.js")).createMorseAgent(),
    "periodic-letter-extraction": async () => (await import("./generators/periodic-letter-extraction/agent.js")).createNthCharacterAgent(),
    "periodic-word-extraction": async () => (await import("./generators/periodic-word-extraction/agent.js")).createNthWordAgent(),
    "page-version": async () => (await import("./generators/page-version/agent.js")).createPageVersionAgent(),
    "qr-code": async () => (await import("./generators/qr-code/agent.js")).createQrCodeAgent(),
    "reverse-audio": async () => (await import("./generators/reverse-audio/agent.js")).createReverseAudioAgent(),
    "asymmetric-sealed-relay": async () => (await import("./generators/asymmetric-sealed-relay/agent.js")).createSecureRelayAgent(),
    "html-source-inspection": async () => (await import("./generators/html-source-inspection/agent.js")).createSourceCodeAgent(),
    "static-url": async () => (await import("./generators/static-url/agent.js")).createStaticUrlAgent(),
    "steganography": async () => (await import("./generators/steganography/agent.js")).createSteganographyAgent(),
    "monoalphabetic-substitution": async () => (await import("./generators/monoalphabetic-substitution/agent.js")).createSubstitutionAgent(),
    "cover-text-line-telestich": async () => (await import("./generators/cover-text-line-telestich/agent.js")).createTelestichAgent(),
    "vigenere-cipher": async () => (await import("./generators/vigenere/agent.js")).createVigenereAgent(),
    "visual-clue": async () => (await import("./generators/visual-clue/agent.js")).createVisualClueAgent(),
    "cover-text-word-index-cipher": async () => (await import("./generators/cover-text-word-index-cipher/agent.js")).createWordIndexAgent()
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
    const authoredContent = authoredContentForPuzzle(handoff.subtype);
    const fields = authoredContent?.fields.join(", ");
    const toolInstruction = authoredContent?.mode === "prose-composition"
        ? `Preserve every supplied field. Compose natural, context-specific prose for ${fields} that satisfies this puzzle's extraction mechanic, then call your puzzle creation tool with the augmented object:`
        : authoredContent?.mode === "visual-composition"
            ? `Preserve every supplied field. Author a context-specific SVG drawing plan for ${fields}, making any visibility decisions from visual ambiguity, then call your puzzle creation tool with the augmented object:`
            : "Preserve every supplied field and call your puzzle creation tool with exactly this JSON object:";
    return [
        "Generate this production puzzle from the upstream level-design specification.",
        PLAIN_LANGUAGE_HOUSE_STYLE,
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

    assertPuzzleAcceptsAnswer(value, handoff.verification.expectedValue);
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

/** Validate the model's submission inside the tool call, where it can still recover. */
export function guardPuzzleGenerationTool(tool: AgentTool, handoff: PuzzleGenerationHandoff): AgentTool {
    return {
        ...tool,
        async execute(...args) {
            const submitted = args[1] as Record<string, unknown>;
            const changed = Object.entries(handoff.generationSpec)
                .filter(([key, value]) => !isDeepStrictEqual(submitted[key], value))
                .map(([key]) => key);
            if (changed.length > 0) {
                throw new Error(`Preserve the upstream generationSpec fields: ${changed.join(", ")}. Correct the tool call using the supplied values.`);
            }
            const result = await tool.execute(...args);
            validateGeneratedPuzzle(handoff, result.details);
            return result;
        }
    };
}

export async function generatePuzzleFromHandoff(
    handoff: PuzzleGenerationHandoff,
    catalog: PuzzleCatalog = repositoryPuzzleCatalog,
    options: Pick<AgentPromptRetryOptions, "onRetry"> = {}
): Promise<PrivatePuzzleInstance> {
    const compile = getPuzzleCatalogEntry(catalog, handoff.subtype)?.compileGenerationSpec;
    if (compile !== undefined) {
        return validateGeneratedPuzzle(handoff, compile(handoff.generationSpec));
    }
    const factory = agentFactories[handoff.subtype];
    if (factory === undefined) throw new Error(`No puzzle-generation agent is registered for subtype ${handoff.subtype}.`);
    const agent = await factory();
    agent.state.tools = agent.state.tools.map((tool) =>
        tool.name === handoff.generatorTool ? guardPuzzleGenerationTool(tool, handoff) : tool);
    stopAfterSuccessfulTool(agent, handoff.generatorTool);
    let generated: unknown;
    let lastToolError: string | undefined;

    agent.subscribe((event: AgentEvent) => {
        if (
            event.type === "tool_execution_end" &&
            event.toolName === handoff.generatorTool
        ) {
            if (event.isError) {
                const text = event.result.content
                    .filter((item: { type: string; text?: string }) => item.type === "text")
                    .map((item: { type: string; text?: string }) => item.text ?? "")
                    .join("\n")
                    .trim();
                lastToolError = text.length === 0 ? undefined : text;
            } else {
                generated = event.result.details;
            }
        }
    });

    await promptAgentWithRecovery(agent, buildPuzzleGenerationPrompt(handoff), options);
    if (generated === undefined) {
        throw new Error(
            lastToolError
            || agent.state.errorMessage
            || `The ${handoff.subtype} agent did not generate a puzzle.`
        );
    }
    return validateGeneratedPuzzle(handoff, generated);
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
