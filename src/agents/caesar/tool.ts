import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createCaesarPuzzle } from "./engine.js";

const shiftSchema = Type.Integer({
    description: "The number of positions to shift each letter in the alphabet (between 1 and 25).",
    minimum: 1,
    maximum: 25
});

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        intendedSolution: Type.String({ minLength: 1 }),
        shift: shiftSchema
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        intendedSolution: Type.String({ minLength: 1 }),
        shift: shiftSchema
    }, { additionalProperties: false })
]);

export const createCaesarPuzzleTool: AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_caesar_puzzle",
    label: "Create a Caesar cipher puzzle",

    description: [
        "Validate an upstream puzzle ID, intended solution, and shift; encode the solution using a Caesar cipher,",
        "verify the encoding by decoding it, and return the finished puzzle."
    ].join(" "),

    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createCaesarPuzzle({
            id: params.id ?? "demo-caesar",
            intendedSolution: params.intendedSolution,
            shift: params.shift
        });

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        id: puzzle.id,
                        prompt: puzzle.prompt,
                        answer: puzzle.solution.canonical
                    })
                }
            ],

            details: puzzle
        };
    }
};
