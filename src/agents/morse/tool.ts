import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createMorsePuzzle } from "./engine.js";

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        intendedSolution: Type.String({ minLength: 1 })
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        intendedSolution: Type.String({ minLength: 1 })
    }, { additionalProperties: false })
]);

export const createMorsePuzzleTool: AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_morse_puzzle",
    label: "Create a Morse code puzzle",

    description: [
        "Validate an upstream puzzle ID and intended solution, encode the solution using Morse code, verify it by decoding it,",
        "and return the finished puzzle."
    ].join(" "),

    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createMorsePuzzle({
            id: params.id ?? "demo-morse",
            intendedSolution: params.intendedSolution
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
