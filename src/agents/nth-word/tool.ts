import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createNthWordPuzzle } from "./engine.js";

const shared = {
    intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
    genre: Type.String({ minLength: 1, maxLength: 80 }),
    coverText: Type.String({ minLength: 1, maxLength: 8_000 }),
    step: Type.Integer({ minimum: 4, maximum: 30 })
};

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        startIndex: Type.Integer({ minimum: 1, maximum: 30 }),
        ...shared
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        startIndex: Type.Literal(1),
        ...shared
    }, { additionalProperties: false })
]);

export const createNthWordPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_nth_word_puzzle",
    label: "Create an every-nth-word puzzle",
    description: [
        "Validate a puzzle ID, intended solution, cover text, step, and start position;",
        "extract the periodic word sequence and return the verified puzzle."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createNthWordPuzzle({
            id: params.id ?? "demo-nth-word",
            intendedSolution: params.intendedSolution,
            genre: params.genre,
            coverText: params.coverText,
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
