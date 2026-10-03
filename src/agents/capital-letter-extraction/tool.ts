import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import type { PrivatePuzzleInstance } from "../../core/types.js";
import { createCapitalLetterExtractionPuzzle } from "./engine.js";

const parameters = Type.Union([
    Type.Object({
        mode: Type.Literal("production"),
        id: Type.String({ minLength: 1 }),
        intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
        carrierText: Type.String({ minLength: 1, maxLength: 8_000 }),
        genre: Type.String({ minLength: 1, maxLength: 80 })
    }, { additionalProperties: false }),
    Type.Object({
        mode: Type.Literal("demo"),
        id: Type.Optional(Type.String({ minLength: 1 })),
        intendedSolution: Type.String({ minLength: 1, maxLength: 120 }),
        carrierText: Type.String({ minLength: 1, maxLength: 8_000 }),
        genre: Type.String({ minLength: 1, maxLength: 80 })
    }, { additionalProperties: false })
]);

export const createCapitalLetterExtractionPuzzleTool:
AgentTool<typeof parameters, PrivatePuzzleInstance> = {
    name: "create_capital_letter_extraction_puzzle",
    label: "Create a capital-letter extraction puzzle",
    description: [
        "Validate a puzzle ID, intended solution, genre, and carrier text; capitalize an ordered",
        "subsequence that spells the solution, verify extraction, and return the finished puzzle."
    ].join(" "),
    parameters,

    async execute(_toolCallId, params) {
        const puzzle = createCapitalLetterExtractionPuzzle({
            id: params.id ?? "demo-capital-letter-extraction",
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
