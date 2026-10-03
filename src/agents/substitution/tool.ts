import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createSubstitutionPuzzle } from "./engine.js";

const cipherAlphabetSchema = Type.String({
    minLength: 26,
    description: [
        "The 26-letter cipher alphabet aligned with plaintext A-Z.",
        "It must contain every English letter exactly once; whitespace is ignored."
    ].join(" ")
});

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
        cipherAlphabet: cipherAlphabetSchema
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
        cipherAlphabet: cipherAlphabetSchema
    }, { additionalProperties: false })
]);

export const createSubstitutionPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_substitution_puzzle",
    label: "Create a substitution cipher puzzle",
    description: [
        "Validate an upstream puzzle ID, intended solution, and cipher alphabet;",
        "construct and round-trip verify a monoalphabetic substitution puzzle;",
        "and return the finished private puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createSubstitutionPuzzle({
            id: params.id ?? "demo-substitution",
            intendedSolution: params.intendedSolution,
            cipherAlphabet: params.cipherAlphabet
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
