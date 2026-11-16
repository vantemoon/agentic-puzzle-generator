import type { LevelBundleInputs } from "./bundle-inputs.js";

function normalize(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

export function bundleAnswers(puzzles: LevelBundleInputs["puzzles"]) {
    return puzzles.flatMap(({ puzzle }) => {
        const caseInsensitive = puzzle.validator.kind === "normalized-text"
            && puzzle.validator.options.caseInsensitive;
        return [puzzle.solution.canonical, ...(puzzle.solution.acceptedAlternatives ?? [])]
            .map(normalize)
            .filter(Boolean)
            .map((value) => ({ puzzleId: puzzle.id, value, caseInsensitive }));
    });
}

export function findBundleAnswer(text: string, answers: ReturnType<typeof bundleAnswers>) {
    const normalized = normalize(text);
    return answers.find(({ value, caseInsensitive }) => caseInsensitive
        ? normalized.toLocaleLowerCase().includes(value.toLocaleLowerCase())
        : normalized.includes(value));
}
