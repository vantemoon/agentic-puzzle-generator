import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createAsciiPuzzle } from "./engine.js";

const radixSchema = Type.Union([
    Type.Literal("decimal"),
    Type.Literal("hexadecimal"),
    Type.Literal("binary")
], { description: "The explicitly selected representation for each ASCII code." });

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        intendedSolution: Type.String({
            minLength: 1,
            maxLength: 80,
            description: "The upstream-supplied text to encode using printable ASCII characters."
        }),
        radix: radixSchema
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        intendedSolution: Type.String({ minLength: 1, maxLength: 80 }),
        radix: radixSchema
    }, { additionalProperties: false })
]);

export const createAsciiPuzzleTool: AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_ascii_puzzle",
    label: "Create an ASCII code puzzle",
    description: "Construct and validate one ASCII decoding puzzle from an upstream specification.",
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createAsciiPuzzle({
            id: params.id ?? "demo-ascii",
            intendedSolution: params.intendedSolution,
            radix: params.radix
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
