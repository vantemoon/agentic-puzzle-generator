import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createAnagramPuzzle } from "./engine.js";

const clueSchema = Type.String({
    minLength: 1,
    maxLength: 400,
    description: "A public clue that constrains the intended anagram solution without directly revealing it."
});

const seedSchema = Type.String({
    minLength: 1,
    maxLength: 120,
    description: "Optional deterministic seed for the letter shuffle."
});

const acceptedAlternativesSchema = Type.Array(
    Type.String({ minLength: 1, maxLength: 120 }),
    {
        minItems: 1,
        maxItems: 10,
        description: "Optional alternative answers that use exactly the same letters as the canonical solution."
    }
);

const productionSchema = Type.Object({
    mode: Type.Literal("production"),
    id: Type.String({ minLength: 1 }),
    intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
    clue: clueSchema,
    scrambleSeed: Type.Optional(seedSchema),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema)
}, { additionalProperties: false });

const demoSchema = Type.Object({
    mode: Type.Literal("demo"),
    id: Type.Optional(Type.String({ minLength: 1 })),
    intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
    clue: clueSchema,
    scrambleSeed: Type.Optional(seedSchema),
    acceptedAlternatives: Type.Optional(acceptedAlternativesSchema)
}, { additionalProperties: false });

const parameters = Type.Union([productionSchema, demoSchema]);

export const createAnagramPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_anagram_puzzle",
    label: "Create an anagram puzzle",
    description: [
        "Validate an upstream puzzle ID, intended solution, and clue;",
        "deterministically scramble the solution letters without using a word-length parameter;",
        "verify the letter bank; and return the finished private puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createAnagramPuzzle({
            id: params.id ?? "demo-anagram",
            intendedSolution: params.intendedSolution,
            clue: params.clue,
            scrambleSeed: params.scrambleSeed,
            acceptedAlternatives: params.acceptedAlternatives
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
