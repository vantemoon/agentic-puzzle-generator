import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { getPuzzleArtifactSource, type PrivatePuzzleInstance } from "../../core/types.js";
import { createAsciiArtPuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([Type.Literal("explicit"), Type.Literal("indirect"), Type.Literal("contextual"), Type.Literal("hidden")]);
const artStyleSchema = Type.Union([Type.Literal("block"), Type.Literal("outline"), Type.Literal("shadow"), Type.Literal("texture")]);
const subjectKindSchema = Type.Union([Type.Literal("text"), Type.Literal("object")]);
const acceptedAlternativesSchema = Type.Array(Type.String({ minLength: 1, maxLength: 32 }), { minItems: 1, maxItems: 10 });

const parameters = Type.Object({
    mode: Type.Union([Type.Literal("production"), Type.Literal("demo")]),
    id: Type.Optional(Type.String({ minLength: 1 })),
    intendedSolution: Type.String({ minLength: 1, maxLength: 32 }),
    recognitionLevel: recognitionLevelSchema,
    artStyle: Type.Optional(artStyleSchema),
    subjectKind: Type.Optional(subjectKindSchema),
    artCharacters: Type.Optional(Type.String({ minLength: 1, maxLength: 12 })),
    readingHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema)
}, { additionalProperties: false });

export const createAsciiArtPuzzleTool: AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_ascii_art_puzzle",
    label: "Create an ASCII-art puzzle",
    description: "Create a text artifact whose monospace ASCII-art glyphs encode a hidden message.",
    parameters,
    async execute(_toolCallId, params) {
        if (params.mode === "production" && params.id === undefined) throw new Error("Production ASCII-art puzzles require an upstream puzzle ID.");
        const puzzle = createAsciiArtPuzzle({
            id: params.id ?? "demo-ascii-art",
            intendedSolution: params.intendedSolution,
            recognitionLevel: params.recognitionLevel,
            artStyle: params.artStyle,
            subjectKind: params.subjectKind,
            artCharacters: params.artCharacters,
            readingHint: params.readingHint,
            acceptedAlternatives: params.acceptedAlternatives
        });
        return { content: [{ type: "text", text: JSON.stringify({ id: puzzle.id, prompt: puzzle.prompt, artifact: getPuzzleArtifactSource(puzzle.artifact), answer: puzzle.solution.canonical }) }], details: puzzle };
    }
};
