import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { objectUnion } from "../../../../shared/agent-runtime/tool-schema.js";

import { writeHtmlArtifactPreview as writeSharedHtmlArtifactPreview } from "../../../../shared/artifacts/html-preview.js";
import type { PrivatePuzzleInstance } from "../../../../shared/artifacts/types.js";
import { createPageVersionPuzzle } from "./engine.js";

const changeKindSchema = Type.Union([
    Type.Literal("added-section"),
    Type.Literal("changed-field"),
    Type.Literal("removed-content"),
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
    baselineBody: Type.String({
        minLength: 1,
        maxLength: 1000,
        description: "Complete visible prose for the older snapshot. For removed-content it must contain the intended solution once; for other change kinds it must not contain the solution."
    }),
    currentBody: Type.String({
        minLength: 1,
        maxLength: 1000,
        description: "Complete visible prose for the newer snapshot. For removed-content it must not contain the intended solution. For other change kinds it may contain the solution once; otherwise the engine adds a change-specific payload element."
    }),
    changeKind: changeKindSchema,
    baselineDate: Type.String({
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Publication date of the older snapshot in YYYY-MM-DD format."
    }),
    currentDate: Type.String({
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Publication date of the newer snapshot in YYYY-MM-DD format; it must be later than baselineDate."
    }),
    baselineLabel: Type.Optional(Type.String({
        minLength: 1,
        maxLength: 60,
        description: "Optional site-native description of the older snapshot; do not use Baseline."
    })),
    currentLabel: Type.Optional(Type.String({
        minLength: 1,
        maxLength: 60,
        description: "Optional site-native description of the newer snapshot; do not use Current."
    })),
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

const parameters = objectUnion([productionSchema, demoSchema]);

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
        "Validate an upstream puzzle ID, hidden payload, page-version text, and change kind;",
        "construct a safe static history of dated snapshots of the same webpage;",
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
            changeKind: params.changeKind,
            baselineDate: params.baselineDate,
            currentDate: params.currentDate,
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
