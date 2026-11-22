import { validateNormalizedTextAnswer, type PrivatePuzzleInstance } from "../../shared/artifacts/types.js";

export function assertPuzzleAcceptsAnswer(puzzle: PrivatePuzzleInstance, expected: string | number): void {
    if (typeof expected !== "string") throw new Error("Puzzle generators currently support string verification answers only.");
    if (puzzle.validator.kind === "normalized-text") {
        if (!validateNormalizedTextAnswer(puzzle, expected)) {
            throw new Error(`Generated puzzle does not accept the designed answer for ${puzzle.id}.`);
        }
    } else {
        const transferred = puzzle.inputs.find((input) => input.key === "transferred_payload")?.value;
        if (transferred !== expected) {
            throw new Error(`Generated secure-relay puzzle does not preserve the designed payload for ${puzzle.id}.`);
        }
    }
}
