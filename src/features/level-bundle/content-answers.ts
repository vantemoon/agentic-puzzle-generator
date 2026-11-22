import { bundleAnswers, findBundleAnswer } from "./answers.js";
import type { BundleRoute, BundledSite, SupportingMediaRequest } from "./types.js";

type Answers = ReturnType<typeof bundleAnswers>;

function answerLocations(value: unknown, path: string, answers: Answers): string[] {
    if (typeof value === "string") {
        return [...new Set(answers.flatMap((answer) => findBundleAnswer(value, [answer])
            ? [`${path} contains ${JSON.stringify(answer.value)} (answer to ${answer.puzzleId})`]
            : []))];
    }
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => answerLocations(item, `${path}[${index}]`, answers));
    }
    if (value !== null && typeof value === "object") {
        return Object.entries(value).flatMap(([key, item]) => answerLocations(item, `${path}.${key}`, answers));
    }
    return [];
}

export function siteAnswerIssues(site: Pick<BundledSite, "id" | "name">, answers: Answers): string[] {
    return answerLocations(site.name, "name", answers).map((issue) =>
        `Bundled site ${site.id} name leaks a puzzle answer in site-wide public chrome: ${issue}. Use a display name that does not contain the answer.`);
}

export function routeAnswerIssues(site: Pick<BundledSite, "basePath">, route: BundleRoute, answers: Answers): string[] {
    if (route.role === "puzzle") return [];
    const path = site.basePath + (route.path === "/" ? "" : route.path);
    return answerLocations(route.content, "content", answers).map((issue) =>
        `Non-puzzle route ${path} leaks a puzzle answer: ${issue}.`
        + (issue.includes(".href contains") ? " Use an answer-free target URL and update its references." : ""));
}

export function mediaAnswerIssues(request: SupportingMediaRequest, answers: Answers): string[] {
    const { purpose, brief, accessibilityText } = request;
    return answerLocations({ purpose, brief, accessibilityText }, "request", answers).map((issue) =>
        `Supporting-media request ${request.id} leaks a puzzle answer: ${issue}.`);
}

export function assertNoBundleAnswerIssues(issues: string[]): void {
    if (issues.length > 0) throw new Error(`Level bundle content was rejected:\n- ${issues.join("\n- ")}`);
}
