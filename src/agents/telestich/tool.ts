import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createTelestichPuzzle } from "./engine.js";

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
        genre: Type.String({ minLength: 1, maxLength: 80 }),
        coverText: Type.String({ minLength: 1, maxLength: 8_000 })
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
        genre: Type.String({ minLength: 1, maxLength: 80 }),
        coverText: Type.String({ minLength: 1, maxLength: 8_000 })
    }, { additionalProperties: false })
]);

export const createTelestichPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_telestich_puzzle",
    label: "Create a line-final telestich puzzle",
    description: [
        "Validate a puzzle ID, intended solution, open-ended genre, and proposed cover text;",
        "extract its line endings, verify the hidden message, and return the finished puzzle."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createTelestichPuzzle({
            id: params.id ?? "demo-telestich",
            intendedSolution: params.intendedSolution,
            genre: params.genre,
            coverText: params.coverText
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
