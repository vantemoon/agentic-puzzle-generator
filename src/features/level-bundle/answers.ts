import type { LevelBundleInputs } from "./inputs.js";

function normalize(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

const numericAnswer = /^\d+$/;

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
    return answers.find(({ value, caseInsensitive }) => {
        if (numericAnswer.test(value)) {
            return new RegExp(`(?<![\\p{L}\\p{N}])${value}(?![\\p{L}\\p{N}])`, "u").test(normalized);
        }
        return caseInsensitive
            ? normalized.toLocaleLowerCase().includes(value.toLocaleLowerCase())
            : normalized.includes(value);
    });
}

export function findBundleHtmlAnswer(source: string, answers: ReturnType<typeof bundleAnswers>) {
    if (!answers.some(({ value }) => numericAnswer.test(value))) return findBundleAnswer(source, answers);
    // Keep descriptive accessibility text while ignoring markup such as table tags and CSS URLs.
    const publicText = source.replace(/<[^>]*>/g, (tag) => {
        const labels = [...tag.matchAll(/\s(?:alt|title|aria-label)=(?:"([^"]*)"|'([^']*)')/gi)]
            .map(([, doubleQuoted, singleQuoted]) => doubleQuoted ?? singleQuoted);
        return ` ${labels.join(" ")} `;
    }).replace(/&#39;/g, "'");
    return answers.find((answer) =>
        findBundleAnswer(numericAnswer.test(answer.value) ? publicText : source, [answer]) !== undefined);
}

export function briefingAnswers(inputs: LevelBundleInputs, answers = bundleAnswers(inputs.puzzles)) {
    const supplied = new Set(inputs.level.startingInputs.flatMap((input) =>
        "value" in input ? [normalize(String(input.value))] : []));
    return answers.filter(({ value, caseInsensitive }) => ![...supplied].some((known) =>
        caseInsensitive ? known.toLowerCase() === value.toLowerCase() : known === value));
}
