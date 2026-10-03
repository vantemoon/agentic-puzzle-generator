import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writeHtmlArtifactPreview as writeSharedHtmlArtifactPreview } from "../../core/html-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createHtmlCommentPuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([
    Type.Literal("explicit"),
    Type.Literal("indirect"),
    Type.Literal("contextual"),
    Type.Literal("hidden")
], {
    description: "How directly the visible page should point solvers toward source inspection."
});

const acceptedAlternativesSchema = Type.Array(
    Type.String({ minLength: 1, maxLength: 300 }),
    {
        minItems: 1,
        maxItems: 10,
        description: "Optional alternative extracted messages accepted by the validator."
    }
);

const baseFields = {
    intendedSolution: Type.String({ minLength: 1, maxLength: 300 }),
    visibleTitle: Type.String({ minLength: 1, maxLength: 120 }),
    visibleBody: Type.String({ minLength: 1, maxLength: 1000 }),
    recognitionLevel: recognitionLevelSchema,
    sourceInspectionHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    commentPrefix: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema)
} as const;

const productionSchema = Type.Object({
    mode: Type.Literal("production"),
    id: Type.String({ minLength: 1 }),
    ...baseFields
}, { additionalProperties: false });

const demoSchema = Type.Object({
    mode: Type.Literal("demo"),
    id: Type.Optional(Type.String({ minLength: 1 })),
    ...baseFields
}, { additionalProperties: false });

const parameters = Type.Union([productionSchema, demoSchema]);

export async function writeHtmlArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writeSharedHtmlArtifactPreview({
        puzzle,
        artifactDirectoryName: "html-comment",
        fallbackFileStem: "html-comment-preview"
    });
}

export const createHtmlCommentPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_html_comment_puzzle",
    label: "Create an HTML comment puzzle",
    description: [
        "Validate an upstream puzzle ID, hidden payload, visible webpage text, and recognition level;",
        "construct a safe static HTML artifact with the payload hidden in one source comment;",
        "and return the finished private puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createHtmlCommentPuzzle({
            id: params.id ?? "demo-html-comment",
            intendedSolution: params.intendedSolution,
            visibleTitle: params.visibleTitle,
            visibleBody: params.visibleBody,
            recognitionLevel: params.recognitionLevel,
            sourceInspectionHint: params.sourceInspectionHint,
            commentPrefix: params.commentPrefix,
            acceptedAlternatives: params.acceptedAlternatives
        });

        if (params.mode === "demo") {
            const preview = await writeHtmlArtifactPreview(puzzle);

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
