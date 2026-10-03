import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createVigenerePuzzle } from "./engine.js";

const keySchema = Type.String({
    minLength: 1,
    maxLength: 128,
    description: [
        "The repeating Vigenere keyword.",
        "It may contain English letters and whitespace; whitespace is ignored."
    ].join(" ")
});

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
        key: keySchema
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
        key: keySchema
    }, { additionalProperties: false })
]);

export const createVigenerePuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_vigenere_puzzle",
    label: "Create a Vigenere cipher puzzle",
    description: [
        "Validate an upstream puzzle ID, intended solution, and repeating key;",
        "construct and round-trip verify a Vigenere cipher puzzle;",
        "and return the finished private puzzle instance."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createVigenerePuzzle({
            id: params.id ?? "demo-vigenere",
            intendedSolution: params.intendedSolution,
            key: params.key
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
