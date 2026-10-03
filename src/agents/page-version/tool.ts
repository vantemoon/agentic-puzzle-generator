import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writeHtmlArtifactPreview as writeSharedHtmlArtifactPreview } from "../../core/html-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createPageVersionPuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([
    Type.Literal("explicit"),
    Type.Literal("indirect"),
    Type.Literal("contextual"),
    Type.Literal("hidden")
], { description: "How directly the visible index should point solvers toward comparing page versions." });

const changeKindSchema = Type.Union([
    Type.Literal("added-section"),
    Type.Literal("changed-field"),
    Type.Literal("removed-redaction")
], { description: "The kind of static difference that reveals the payload in the current page version." });

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
    pageTitle: Type.String({ minLength: 1, maxLength: 120 }),
    baselineBody: Type.String({ minLength: 1, maxLength: 1000 }),
    currentBody: Type.String({ minLength: 1, maxLength: 1000 }),
    recognitionLevel: recognitionLevelSchema,
    changeKind: changeKindSchema,
    comparisonHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    baselineLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
    currentLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
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

export async function writePageVersionArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writeSharedHtmlArtifactPreview({
        puzzle,
        artifactDirectoryName: "page-version",
        fallbackFileStem: "page-version-preview"
    });
}

export const createPageVersionPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_page_version_puzzle",
    label: "Create a page version puzzle",
    description: [
        "Validate an upstream puzzle ID, hidden payload, page-version text, recognition level, and change kind;",
        "construct a safe static multi-file HTML artifact with baseline and current page versions;",
        "and return the finished private puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createPageVersionPuzzle({
            id: params.id ?? "demo-page-version",
            intendedSolution: params.intendedSolution,
            pageTitle: params.pageTitle,
            baselineBody: params.baselineBody,
            currentBody: params.currentBody,
            recognitionLevel: params.recognitionLevel,
            changeKind: params.changeKind,
            comparisonHint: params.comparisonHint,
            baselineLabel: params.baselineLabel,
            currentLabel: params.currentLabel,
            acceptedAlternatives: params.acceptedAlternatives
        });

        if (params.mode === "demo") {
            const preview = await writePageVersionArtifactPreview(puzzle);

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        id: puzzle.id,
                        prompt: puzzle.prompt,
                        artifactPreviewPath: preview.path,
                        artifactPreviewUrl: preview.fileUrl,
                        artifactPreviewDirectory: preview.directory,
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
