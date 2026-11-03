import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import type { LevelBundleInputs } from "./bundle-inputs.js";
import type { BundleRoute, BundledSite, LevelBundle } from "./bundle.js";
import { BUNDLE_SECURITY_HEADERS } from "./bundle-security.js";
import { resolvePuzzleOutput } from "./validator.js";

export interface TerminalValidationResult {
    status: "success" | "incorrect";
    outcome?: string;
    fieldErrors?: string[];
}

function scalarSubmission(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return undefined;
}

export function validateTerminalSubmission(
    inputs: LevelBundleInputs,
    submission: Record<string, unknown>
): TerminalValidationResult {
    if (submission.levelId !== undefined && submission.levelId !== inputs.level.id) {
        return { status: "incorrect", fieldErrors: ["levelId"] };
    }
    const fieldErrors: string[] = [];
    for (const field of inputs.level.terminalAction.fields) {
        const expected = resolvePuzzleOutput(
            inputs.level,
            field.source.puzzleId,
            field.source.outputId
        );
        if (expected === undefined) throw new Error(`Terminal field ${field.id} has an unresolved source.`);
        const actual = scalarSubmission(submission[field.id]);
        const accepted = expected.dataType === "number"
            ? actual !== undefined && actual.trim().length > 0 && Number(actual) === expected.value
            : actual?.trim() === expected.value;
        if (!accepted) fieldErrors.push(field.id);
    }
    if (fieldErrors.length > 0) return { status: "incorrect", fieldErrors };
    return { status: "success", outcome: inputs.level.terminalAction.successOutcome };
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function safeReturnPath(value: unknown): string {
    const path = scalarSubmission(value);
    return path !== undefined && /^\/(?!\/)/.test(path) ? path : "/";
}

function responseHtml(result: TerminalValidationResult, returnPath: string): string {
    const success = result.status === "success";
    const title = success ? "Investigation Complete" : "Check Your Findings";
    const message = success
        ? result.outcome ?? "The investigation is complete."
        : "One or more fields do not match the public records. Review the investigation and try again.";
    const action = success
        ? '<a class="begin-link" href="/">Return to the investigation</a>'
        : `<a class="begin-link" href="${escapeHtml(returnPath)}">Try again</a>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><link rel="stylesheet" href="/assets/site.css"></head><body class="bundle-index completion-page"><main><p class="site-kicker">${success ? "Case closed" : "Submission not accepted"}</p><h1>${title}</h1><p class="summary">${escapeHtml(message)}</p><p>${action}</p></main></body></html>`;
}

function fullRoutePath(site: BundledSite, route: BundleRoute): string {
    if (site.basePath === "/") return route.path;
    if (route.path === "/") return site.basePath;
    return `${site.basePath}${route.path}`;
}

function searchTarget(bundle: LevelBundle, targetPath: string): {
    site: BundledSite;
    route: BundleRoute;
    siteIndex: number;
} | undefined {
    for (const [siteIndex, site] of bundle.sites.entries()) {
        const route = site.routes.find((candidate) => fullRoutePath(site, candidate) === targetPath);
        if (route !== undefined) return { site, route, siteIndex };
    }
    return undefined;
}

function normalizedSearch(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function expectedSearchTerms(inputs: LevelBundleInputs, route: BundleRoute): string[] {
    if (route.role !== "puzzle") return [route.content.title];
    const node = inputs.level.puzzles.find((candidate) => candidate.id === route.puzzleId);
    if (node === undefined) return [];
    return node.design.inputs.flatMap((input) => {
        if (input.source.kind === "puzzle-output") {
            const output = resolvePuzzleOutput(
                inputs.level,
                input.source.puzzleId,
                input.source.outputId
            );
            return output === undefined ? [] : [String(output.value)];
        }
        const inputId = input.source.inputId;
        const startingInput = inputs.level.startingInputs.find(
            (candidate) => candidate.id === inputId
        );
        return startingInput === undefined ? [] : [String(startingInput.value)];
    });
}

function searchResponseHtml(options: {
    site: BundledSite;
    siteIndex: number;
    targetPath: string;
    query: string;
}): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>No matching results | ${escapeHtml(options.site.name)}</title><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/site-${options.siteIndex + 1}.css"></head><body data-archetype="${escapeHtml(options.site.archetype)}" data-tone="${escapeHtml(options.site.visualProfile.tone)}" data-font-style="${escapeHtml(options.site.visualProfile.fontStyle)}" data-density="${escapeHtml(options.site.visualProfile.density)}"><header><div class="masthead"><p class="site-kicker">Search results</p><div class="brand-row"><a class="brand" href="${escapeHtml(options.site.basePath)}">${escapeHtml(options.site.name)}</a></div></div></header><div class="layout no-sidebar"><main class="content"><h1>No matching results</h1><p class="summary">No public record matched “${escapeHtml(options.query)}”. Check the spelling or try another search.</p><form class="site-search" method="get" action="/api/search" role="search"><input type="hidden" name="target" value="${escapeHtml(options.targetPath)}"><label>Search this site<input name="q" type="search" required></label><button type="submit">Search</button></form></main></div></body></html>`;
}

async function requestBody(request: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buffer.length;
        if (length > 64 * 1024) throw new Error("Validation request body is too large.");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

async function parseSubmission(request: IncomingMessage): Promise<Record<string, unknown>> {
    const body = await requestBody(request);
    const mediaType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType === "application/json") {
        const value = JSON.parse(body.toString("utf8")) as unknown;
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new Error("JSON validation submissions must be objects.");
        }
        return value as Record<string, unknown>;
    }
    if (mediaType === "application/x-www-form-urlencoded") {
        return Object.fromEntries(new URLSearchParams(body.toString("utf8")));
    }
    throw new Error("Use application/json or application/x-www-form-urlencoded.");
}

const mediaTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".wav": "audio/wav"
};

async function servePublicFile(
    request: IncomingMessage,
    response: ServerResponse,
    publicDirectory: string
): Promise<void> {
    const requestPath = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const relative = requestPath.replace(/^\/+/, "");
    let filePath = path.resolve(publicDirectory, relative);
    if (path.relative(publicDirectory, filePath).startsWith("..")) {
        response.writeHead(400, BUNDLE_SECURITY_HEADERS).end("Invalid path");
        return;
    }
    try {
        const info = await stat(filePath);
        if (info.isDirectory()) filePath = path.join(filePath, "index.html");
        const fileInfo = await stat(filePath);
        if (!fileInfo.isFile()) throw new Error("Not a file");
        response.writeHead(200, {
            ...BUNDLE_SECURITY_HEADERS,
            "content-type": mediaTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
            "content-length": fileInfo.size,
            "cache-control": "no-store"
        });
        if (request.method === "HEAD") response.end();
        else createReadStream(filePath).pipe(response);
    } catch {
        response.writeHead(404, { ...BUNDLE_SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" }).end("Not found");
    }
}

export function createBundlePreviewServer(options: {
    publicDirectory: string;
    inputs: LevelBundleInputs;
    bundle: LevelBundle;
}): Server {
    const publicDirectory = path.resolve(options.publicDirectory);
    return createServer(async (request, response) => {
        try {
            const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
            if (pathname === "/api/search") {
                if (request.method !== "GET") {
                    response.writeHead(405, { ...BUNDLE_SECURITY_HEADERS, allow: "GET" }).end();
                    return;
                }
                const url = new URL(request.url ?? "/", "http://localhost");
                const targetPath = url.searchParams.get("target") ?? "";
                const query = url.searchParams.get("q") ?? "";
                const target = searchTarget(options.bundle, targetPath);
                if (target === undefined) {
                    response.writeHead(404, { ...BUNDLE_SECURITY_HEADERS, "content-type": "text/plain; charset=utf-8" }).end("Unknown search target");
                    return;
                }
                const expected = expectedSearchTerms(options.inputs, target.route).map(normalizedSearch);
                if (query.trim().length > 0 && expected.includes(normalizedSearch(query))) {
                    response.writeHead(303, { ...BUNDLE_SECURITY_HEADERS, location: targetPath }).end();
                    return;
                }
                const source = searchResponseHtml({
                    site: target.site,
                    siteIndex: target.siteIndex,
                    targetPath,
                    query
                });
                response.writeHead(200, {
                    ...BUNDLE_SECURITY_HEADERS,
                    "content-type": "text/html; charset=utf-8",
                    "cache-control": "no-store"
                }).end(source);
                return;
            }
            if (pathname === "/api/validate") {
                if (request.method !== "POST") {
                    response.writeHead(405, { ...BUNDLE_SECURITY_HEADERS, allow: "POST" }).end();
                    return;
                }
                const submission = await parseSubmission(request);
                const result = validateTerminalSubmission(options.inputs, submission);
                const wantsJson = request.headers["content-type"]?.startsWith("application/json")
                    || request.headers.accept?.includes("application/json");
                if (wantsJson) {
                    response.writeHead(result.status === "success" ? 200 : 422, {
                        ...BUNDLE_SECURITY_HEADERS,
                        "content-type": "application/json; charset=utf-8",
                        "cache-control": "no-store"
                    }).end(`${JSON.stringify(result)}\n`);
                } else {
                    response.writeHead(result.status === "success" ? 200 : 422, {
                        ...BUNDLE_SECURITY_HEADERS,
                        "content-type": "text/html; charset=utf-8",
                        "cache-control": "no-store"
                    }).end(responseHtml(result, safeReturnPath(submission.returnPath)));
                }
                return;
            }
            if (request.method !== "GET" && request.method !== "HEAD") {
                response.writeHead(405, { ...BUNDLE_SECURITY_HEADERS, allow: "GET, HEAD" }).end();
                return;
            }
            await servePublicFile(request, response, publicDirectory);
        } catch (error) {
            response.writeHead(400, { ...BUNDLE_SECURITY_HEADERS, "content-type": "application/json; charset=utf-8" }).end(`${JSON.stringify({
                status: "error",
                message: error instanceof Error ? error.message : String(error)
            })}\n`);
        }
    });
}
