import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createNthCharacterPuzzle } from "./engine.js";

const shared = {
    intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
    genre: Type.String({ minLength: 1, maxLength: 80 }),
    carrierText: Type.String({ minLength: 1, maxLength: 8_000 }),
    step: Type.Integer({ minimum: 8, maximum: 50 })
};

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        startIndex: Type.Integer({ minimum: 1, maximum: 50 }),
        ...shared
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        startIndex: Type.Literal(1),
        ...shared
    }, { additionalProperties: false })
]);

export const createNthCharacterPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_nth_character_puzzle",
    label: "Create an every-nth-character puzzle",
    description: [
        "Validate a puzzle ID, intended solution, carrier text, step, and start position;",
        "extract the periodic ASCII letters and return the verified puzzle."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createNthCharacterPuzzle({
            id: params.id ?? "demo-nth-character",
            intendedSolution: params.intendedSolution,
            genre: params.genre,
            carrierText: params.carrierText,
            step: params.step,
            startIndex: params.startIndex
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
