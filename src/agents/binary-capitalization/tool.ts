import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createBinaryCapitalizationPuzzle } from "./engine.js";

const intendedSolutionSchema = Type.String({
    minLength: 1,
    maxLength: 80,
    description: "The upstream-supplied printable ASCII text to hide."
});
const carrierTextSchema = Type.String({
    minLength: 1,
    maxLength: 8_000,
    description: "Cohesive carrier prose with enough ASCII letters for the encoded payload."
});
const genreSchema = Type.String({
    minLength: 1,
    maxLength: 80,
    description: "The genre of the carrier text."
});

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        intendedSolution: intendedSolutionSchema,
        carrierText: carrierTextSchema,
        genre: genreSchema
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        intendedSolution: intendedSolutionSchema,
        carrierText: carrierTextSchema,
        genre: genreSchema
    }, { additionalProperties: false })
]);

export const createBinaryCapitalizationPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_binary_capitalization_puzzle",
    label: "Create a binary capitalization puzzle",
    description: [
        "Validate a puzzle ID, intended solution, genre, and carrier text; encode the solution",
        "through ASCII letter casing, verify the result by decoding it, and return the finished puzzle."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createBinaryCapitalizationPuzzle({
            id: params.id ?? "demo-capitalization",
            intendedSolution: params.intendedSolution,
            carrierText: params.carrierText,
            genre: params.genre
        });

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
