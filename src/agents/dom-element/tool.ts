import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { writeHtmlArtifactPreview as writeSharedHtmlArtifactPreview } from "../../core/html-preview.js";
import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createDomElementPuzzle } from "./engine.js";

const recognitionLevelSchema = Type.Union([
    Type.Literal("explicit"),
    Type.Literal("indirect"),
    Type.Literal("contextual"),
    Type.Literal("hidden")
], { description: "How directly the visible page should point solvers toward DOM inspection." });

const hideStrategySchema = Type.Union([
    Type.Literal("hidden-attribute"),
    Type.Literal("display-none"),
    Type.Literal("visually-hidden"),
    Type.Literal("color-match")
], { description: "The static HTML or CSS mechanism used to hide the payload." });

const elementTagSchema = Type.Union([
    Type.Literal("p"),
    Type.Literal("span"),
    Type.Literal("div")
], { description: "The safe HTML tag used for the hidden payload element." });

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
    hideStrategy: hideStrategySchema,
    domInspectionHint: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
    elementTag: Type.Optional(elementTagSchema),
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

export async function writeDomElementArtifactPreview(puzzle: PrivatePuzzleInstance) {
    return writeSharedHtmlArtifactPreview({
        puzzle,
        artifactDirectoryName: "dom-element",
        fallbackFileStem: "dom-element-preview"
    });
}

export const createDomElementPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_dom_element_puzzle",
    label: "Create a hidden DOM element puzzle",
    description: [
        "Validate an upstream puzzle ID, hidden payload, visible webpage text, recognition level, and hiding strategy;",
        "construct a safe static HTML artifact with the payload hidden in one DOM element;",
        "and return the finished private puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createDomElementPuzzle({
            id: params.id ?? "demo-dom-element",
            intendedSolution: params.intendedSolution,
            visibleTitle: params.visibleTitle,
            visibleBody: params.visibleBody,
            recognitionLevel: params.recognitionLevel,
            hideStrategy: params.hideStrategy,
            domInspectionHint: params.domInspectionHint,
            elementTag: params.elementTag,
            acceptedAlternatives: params.acceptedAlternatives
        });

        if (params.mode === "demo") {
            const preview = await writeDomElementArtifactPreview(puzzle);

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
