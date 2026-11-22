import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import Type, { type Static } from "typebox";
import Value from "typebox/value";

import type { loadAndVerifyLevelBundle } from "./orchestration.js";
import { bundleLookupFieldLabel, usesBundleLookup } from "../level-bundle/types.js";
import type { PublicBundleManifest } from "../level-bundle/build.js";
import { createBundlePreviewServer, expectedSearchTerms } from "../level-bundle/server.js";
import { resolvePuzzleOutput } from "../level-design/validator.js";

type PreparedLevel = Awaited<ReturnType<typeof loadAndVerifyLevelBundle>>;
const text = Type.String({ minLength: 1, pattern: "\\S" });
const closed = { additionalProperties: false } as const;
const PlaytestSchema = Type.Object({
    fingerprint: Type.String({ pattern: "^[0-9a-f]{64}$" }),
    gameComplete: Type.Boolean(),
    levels: Type.Array(Type.Object({
        title: text,
        submissionAccepted: Type.Boolean(),
        steps: Type.Array(Type.Object({ from: text, to: text, reason: text }, closed), { minItems: 1 }),
        fields: Type.Array(Type.Object({ label: text, path: text, observation: text }, closed))
    }, closed)),
    issues: Type.Array(Type.Object({
        owner: Type.Union([Type.Literal("game-design"), Type.Literal("level-design"),
            Type.Literal("level-bundle"), Type.Literal("runtime")]),
        message: text
    }, closed))
}, closed);

export type BlindPlaytestReport = Static<typeof PlaytestSchema>;

export async function playtestCandidate(gameId: string, levels: PreparedLevel[]) {
    const manifests = await Promise.all(levels.map(async ({ publicDirectory }) =>
        JSON.parse(await readFile(path.join(publicDirectory, "bundle.manifest.json"), "utf8")) as PublicBundleManifest));
    const fingerprint = createHash("sha256").update(JSON.stringify({
        gameId, manifests, levels: levels.map(({ inputs, bundle }) => ({ level: inputs.level, bundle }))
    })).digest("hex");
    return { fingerprint, manifests };
}

export function assertBlindPlaytest(
    value: unknown, candidate: Awaited<ReturnType<typeof playtestCandidate>>, levels: PreparedLevel[]
): void {
    if (!Value.Check(PlaytestSchema, value)) throw new Error("Invalid blind playtest report. See the README for its format.");
    if (value.fingerprint !== candidate.fingerprint) throw new Error("Blind playtest report belongs to a different build.");
    if (value.issues.length > 0) {
        throw new Error(`Blind playtest requires repairs:\n- ${value.issues.map(({ owner, message }) =>
            `[${owner}] ${message}`).join("\n- ")}`);
    }
    if (!value.gameComplete || value.levels.length !== levels.length) {
        throw new Error("The blind playtest must reach Game complete and report every level.");
    }
    for (const [index, { inputs, bundle }] of levels.entries()) {
        const level = inputs.level;
        const recorded = value.levels[index];
        const manifest = candidate.manifests[index];
        const pages = new Set(manifest.routes.map((entry) => entry.path));
        const publicPaths = new Set([...pages, ...manifest.assets.map((entry) => entry.path)]);
        const terminalSite = bundle.sites.find((site) => site.id === bundle.terminal.siteId)!;
        const terminalPath = terminalSite.basePath + (bundle.terminal.routePath === "/" ? "" : bundle.terminal.routePath);
        if (recorded.title !== level.title || !recorded.submissionAccepted) {
            throw new Error(`Missing accepted blind submission for ${level.title}.`);
        }
        const visited = new Set(["/"]);
        for (const { from, to } of recorded.steps) {
            if (!visited.has(from) || !publicPaths.has(to)) {
                throw new Error(`Blind trace for ${level.title} jumps from ${from} to ${to}. Record how each public page or artifact was reached.`);
            }
            visited.add(to);
        }
        if (!visited.has(terminalPath)) throw new Error(`Blind trace for ${level.title} did not reach its terminal form.`);
        if (recorded.fields.length !== level.terminalAction.fields.length
            || level.terminalAction.fields.some(({ label }) => recorded.fields.filter((field) =>
                field.label === label && field.path !== terminalPath && visited.has(field.path)).length !== 1)) {
            throw new Error(`Blind playtest for ${level.title} must cite a public evidence path and observation for each terminal field.`);
        }
    }
}

function listen(server: Server): Promise<string> {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") return reject(new Error("Could not start preview verification."));
            resolve(`http://127.0.0.1:${address.port}`);
        });
    });
}

function htmlAttribute(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}

function renderedForms(html: string, endpoint: string, method: string) {
    return [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form>/gi)]
        .filter(([, tag]) => tag.includes(`action="${endpoint}"`) && tag.includes(`method="${method}"`))
        .map(([, , body]) => body);
}

function hiddenValue(form: string, name: string, value: string): boolean {
    return [...form.matchAll(/<input\b[^>]*>/gi)].some(([tag]) => tag.includes('type="hidden"')
        && tag.includes(`name="${name}"`) && tag.includes(`value="${htmlAttribute(value)}"`));
}

/** Exercise the same HTTP handlers used by the preview, on temporary loopback ports. */
export async function verifyGameInteractions(levels: PreparedLevel[]): Promise<void> {
    const servers: Server[] = [];
    let nextLevel: { title: string; url: string } | undefined;
    try {
        for (const { inputs, bundle, publicDirectory } of [...levels].reverse()) {
            const server = createBundlePreviewServer({ inputs, bundle, publicDirectory, nextLevel, gameComplete: nextLevel === undefined });
            servers.push(server);
            const origin = await listen(server);
            const request = (pathname: string, init?: RequestInit) =>
                fetch(origin + pathname, { ...init, redirect: "manual", signal: AbortSignal.timeout(5_000) });
            for (const site of bundle.sites) {
                for (const route of site.routes) {
                    if (!usesBundleLookup(route)
                        || !route.discovery?.from.some((source) => !source.startsWith("starting-input:"))) continue;
                    const target = site.basePath + (route.path === "/" ? "" : route.path);
                    const fieldLabel = bundleLookupFieldLabel(inputs.level, route);
                    for (const source of route.discovery.from.filter((item) => !item.startsWith("starting-input:"))) {
                        const response = await request(source);
                        const forms = renderedForms(await response.text(), "/api/search", "get");
                        if (response.status !== 200 || !forms.some((form) =>
                            hiddenValue(form, "target", target)
                            && /<label\b[^>]*>\s*[^<]+[\s\S]*?<input\b[^>]*name="q"[^>]*type="search"/i.test(form)
                            && /<button\b[^>]*type="submit"/i.test(form)
                            && (fieldLabel === undefined || form.includes(`<label>${htmlAttribute(fieldLabel)}<`)))) {
                            throw new Error(`[runtime] ${inputs.level.id} at ${source} has no usable lookup form for ${target}.`);
                        }
                    }
                    const terms = expectedSearchTerms(inputs, route);
                    const term = terms.find((value) => value.trim().length > 0);
                    const search = (q: string) => request(`/api/search?${new URLSearchParams({ target, q })}`);
                    const hit = term === undefined ? undefined : await search(term);
                    let unmatched = "playability-check-unmatched";
                    while (terms.some((value) => value.trim().toLowerCase() === unmatched)) unmatched += "-x";
                    const miss = await search(unmatched);
                    if (hit?.status !== 303 || hit.headers.get("location") !== target
                        || miss.status !== 200 || !(await miss.text()).includes("No matching results")
                        || (await request(target)).status !== 200) {
                        throw new Error(`[runtime] Lookup for ${inputs.level.id} at ${target} failed its hit/miss check.`);
                    }
                }
            }
            const terminalSite = bundle.sites.find((site) => site.id === bundle.terminal.siteId)!;
            const terminalPath = terminalSite.basePath + (bundle.terminal.routePath === "/" ? "" : bundle.terminal.routePath);
            const terminal = await request(terminalPath);
            const forms = renderedForms(await terminal.text(), "/api/validate", "post");
            if (terminal.status !== 200 || !forms.some((form) =>
                hiddenValue(form, "levelId", inputs.level.id) && hiddenValue(form, "returnPath", terminalPath)
                && /<button\b[^>]*type="submit"/i.test(form)
                && inputs.level.terminalAction.fields.every((field) => {
                    const id = htmlAttribute(field.id);
                    return form.includes(`<label for="${id}">${htmlAttribute(field.label)}`)
                        && [...form.matchAll(/<input\b[^>]*>/gi)].some(([tag]) =>
                            tag.includes(`id="${id}"`) && tag.includes(`name="${id}"`)
                            && tag.includes(`type="${field.semanticRole === "date" ? "date" : "text"}"`));
                }))) {
                throw new Error(`[runtime] ${inputs.level.id} at ${terminalPath} has an incomplete terminal form.`);
            }
            const fields = inputs.level.terminalAction.fields.map((field) => {
                const result = resolvePuzzleOutput(inputs.level, field.source.puzzleId, field.source.outputId);
                if (!result) throw new Error(`[level-design] Unresolved terminal field ${field.id}.`);
                return [field.id, String(result.value)];
            });
            const post = (body: URLSearchParams) => request("/api/validate", { method: "POST", body });
            const hidden = [["levelId", inputs.level.id], ["returnPath", terminalPath]];
            const accepted = await post(new URLSearchParams([...hidden, ...fields]));
            const rejected = await post(new URLSearchParams(hidden));
            const outcome = await accepted.text();
            const transition = nextLevel ? `href="${nextLevel.url}"` : "Game complete.";
            if (accepted.status !== 200 || rejected.status !== 422 || !outcome.includes(transition)) {
                throw new Error(`[runtime] Terminal submission or transition failed for ${inputs.level.id}.`);
            }
            nextLevel = { title: inputs.level.title, url: `${origin}/` };
        }
    } finally {
        await Promise.all(servers.filter((server) => server.listening).map((server) =>
            new Promise<void>((resolve) => server.close(() => resolve()))));
    }
}
