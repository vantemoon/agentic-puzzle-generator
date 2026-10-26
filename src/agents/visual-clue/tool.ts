import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writeSvgImageArtifactPreview } from "../../core/image-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createVisualCluePuzzle } from "./engine.js";

const clueKindSchema = Type.Union([
    Type.Literal("object"),
    Type.Literal("symbol"),
    Type.Literal("text"),
    Type.Literal("pattern"),
    Type.Literal("contradiction")
], { description: "The visual form of the subtle clue in the SVG image." });

const acceptedAlternativesSchema = Type.Array(
    Type.String({ minLength: 1, maxLength: 80 }),
    { minItems: 1, maxItems: 10, description: "Optional alternative visual-clue answers accepted by the validator." }
);

const baseFields = {
    intendedSolution: Type.String({ minLength: 1, maxLength: 80 }),
    sceneTitle: Type.String({ minLength: 1, maxLength: 120 }),
    sceneTheme: Type.String({ minLength: 1, maxLength: 160 }),
    sceneDescription: Type.String({ minLength: 1, maxLength: 1000 }),
    backgroundElements: Type.Array(Type.String({ minLength: 1, maxLength: 700 }), {
        minItems: 1,
        maxItems: 250,
        description: "Compact drawing instructions for a context-specific 420x220 background. Use the documented pipe-delimited drawing language; never send SVG/XML markup."
    }),
    clueElements: Type.Array(Type.String({ minLength: 1, maxLength: 700 }), {
        minItems: 1,
        maxItems: 80,
        description: "Compact drawing instructions for the context-integrated clue. Include the exact clueLabel as text only when showClueLabel is true. Never send SVG/XML markup."
    }),
    showClueLabel: Type.Boolean({
        description: "Whether the exact answer needs a visible scene-native text label because the artwork alone would be ambiguous."
    }),
    clueKind: clueKindSchema,
    clueLabel: Type.String({ minLength: 1, maxLength: 80 }),
    imageCaption: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema)
} as const;

const parameters = Type.Object({
    mode: Type.Union([Type.Literal("production"), Type.Literal("demo")]),
    id: Type.Optional(Type.String({ minLength: 1 })),
    ...baseFields
}, { additionalProperties: false });

export async function writeVisualClueArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writeSvgImageArtifactPreview({
        puzzle,
        artifactDirectoryName: "visual-clue",
        fallbackFileStem: "visual-clue-preview"
    });
}

export const createVisualCluePuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_visual_clue_puzzle",
    label: "Create a visual clue puzzle",
    description: [
        "Validate an upstream puzzle ID, visual clue answer, SVG scene context, and clue kind;",
        "construct a safe static SVG image artifact with the answer represented as a subtle visual clue;",
        "and return the finished private puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        if (params.mode === "production" && params.id === undefined) {
            throw new Error("Production visual-clue puzzles require an upstream puzzle ID.");
        }
        const puzzle = createVisualCluePuzzle({
            id: params.id ?? "demo-visual-clue",
            intendedSolution: params.intendedSolution,
            sceneTitle: params.sceneTitle,
            sceneTheme: params.sceneTheme,
            sceneDescription: params.sceneDescription,
            backgroundElements: params.backgroundElements,
            clueElements: params.clueElements,
            showClueLabel: params.showClueLabel,
            clueKind: params.clueKind,
            clueLabel: params.clueLabel,
            imageCaption: params.imageCaption,
            acceptedAlternatives: params.acceptedAlternatives
        });

        if (params.mode === "demo") {
            const preview = await writeVisualClueArtifactPreview(puzzle);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        id: puzzle.id,
                        prompt: puzzle.prompt,
                        artifactPreviewPath: preview.path,
                        artifactPreviewUrl: preview.fileUrl,
                        answer: puzzle.solution.canonical
                    })
                }],
                details: puzzle
            };
        }

        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    id: puzzle.id,
                    prompt: puzzle.prompt,
                    answer: puzzle.solution.canonical
                })
            }],
            details: puzzle
        };
    }
};
