import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import type { PrivatePuzzleInstance } from "../core/types.js";
import type { LevelBundleInputs } from "./bundle-inputs.js";
import type { PublicBundleManifest } from "./bundle-build.js";
import type { BundleRoute, BundledSite, LevelBundle } from "./bundle.js";
import { BUNDLE_SECURITY_HEADERS } from "./bundle-security.js";

export interface BundleVerificationIssue {
    code: string;
    message: string;
    path?: string;
}

export interface BundleVerificationReport {
    schemaVersion: "1.0.0";
    levelId: string;
    status: "passed" | "failed";
    routeCount: number;
    assetCount: number;
    checks: string[];
    issues: BundleVerificationIssue[];
}

export class BundleVerificationError extends Error {
    readonly report: BundleVerificationReport;

    constructor(report: BundleVerificationReport) {
        super(`Level bundle verification failed:\n- ${report.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n- ")}`);
        this.name = "BundleVerificationError";
        this.report = report;
    }
}

function sha256(value: string | Buffer): string {
    return createHash("sha256").update(value).digest("hex");
}

function fullRoutePath(site: BundledSite, route: BundleRoute): string {
    if (site.basePath === "/") return route.path;
    if (route.path === "/") return site.basePath;
    return `${site.basePath}${route.path}`;
}

function routeFile(publicDirectory: string, publicPath: string): string {
    if (publicPath === "/") return path.join(publicDirectory, "index.html");
    return path.join(publicDirectory, publicPath.replace(/^\/+/, ""), "index.html");
}

function publicFile(publicDirectory: string, publicPath: string): string {
    return path.join(publicDirectory, publicPath.replace(/^\/+/, ""));
}

function normalized(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function bodyFragment(source: string): string | undefined {
    return source.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i)?.[1];
}

function loadedPuzzle(inputs: LevelBundleInputs, puzzleId: string): PrivatePuzzleInstance | undefined {
    return inputs.puzzles.find((candidate) => candidate.puzzle.id === puzzleId)?.puzzle;
}

function versionPath(site: BundledSite, route: BundleRoute, filePath: string): string {
    return `${fullRoutePath(site, route)}/_artifact/${filePath.replace(/^\/+/, "")}`;
}

async function readOrIssue(
    filePath: string,
    publicPath: string,
    issues: BundleVerificationIssue[]
): Promise<Buffer | undefined> {
    try {
        return await readFile(filePath);
    } catch {
        issues.push({ code: "missing-file", message: "Manifest entry is missing from the public bundle.", path: publicPath });
        return undefined;
    }
}

function extractReferences(source: string): string[] {
    const references: string[] = [];
    const pattern = /\b(?:href|src|action)=["']([^"']+)["']/gi;
    for (const match of source.matchAll(pattern)) references.push(match[1]);
    return references;
}

export async function verifyLevelBundle(options: {
    bundle: LevelBundle;
    inputs: LevelBundleInputs;
    publicDirectory: string;
    privateDirectory: string;
    supportingItemsMinimum?: number;
    supportingItemsMaximum?: number;
}): Promise<BundleVerificationReport> {
    const publicDirectory = path.resolve(options.publicDirectory);
    const privateDirectory = path.resolve(options.privateDirectory);
    const manifestPath = path.join(publicDirectory, "bundle.manifest.json");
    const issues: BundleVerificationIssue[] = [];
    const checks = [
        "supporting-content-depth",
        "manifest-hashes",
        "artifact-integrity",
        "public-private-boundary",
        "route-links",
        "journey-discovery",
        "html-accessibility-and-safety"
    ];
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PublicBundleManifest;
    if (!isDeepStrictEqual(manifest.headers, BUNDLE_SECURITY_HEADERS)) {
        issues.push({ code: "security-headers", message: "Public manifest is missing the required security-header policy.", path: "/bundle.manifest.json" });
    }
    const knownPublicPaths = new Set([
        ...manifest.routes.map((entry) => entry.path),
        ...manifest.assets.map((entry) => entry.path),
        "/bundle.manifest.json",
        "/api/validate"
    ]);

    const minimum = options.supportingItemsMinimum ?? 10;
    const maximum = options.supportingItemsMaximum ?? 15;
    for (const site of options.bundle.sites) {
        const count = site.routes.filter((route) => route.role === "supporting").length;
        if (count < minimum || count > maximum) {
            issues.push({
                code: "supporting-depth",
                message: `Site ${site.id} has ${count} supporting items; expected ${minimum}-${maximum}.`
            });
        }
    }

    const routeSources = new Map<string, string>();
    for (const entry of manifest.routes) {
        const bytes = await readOrIssue(routeFile(publicDirectory, entry.path), entry.path, issues);
        if (bytes === undefined) continue;
        if (sha256(bytes) !== entry.sha256) {
            issues.push({ code: "hash-mismatch", message: "Public route hash differs from the manifest.", path: entry.path });
        }
        routeSources.set(entry.path, bytes.toString("utf8"));
    }
    for (const entry of manifest.assets) {
        const bytes = await readOrIssue(publicFile(publicDirectory, entry.path), entry.path, issues);
        if (bytes !== undefined && sha256(bytes) !== entry.sha256) {
            issues.push({ code: "hash-mismatch", message: "Public asset hash differs from the manifest.", path: entry.path });
        }
    }

    for (const site of options.bundle.sites) {
        for (const route of site.routes) {
            if (route.role !== "puzzle") continue;
            const puzzle = loadedPuzzle(options.inputs, route.puzzleId);
            const publicPath = fullRoutePath(site, route);
            if (puzzle === undefined) {
                issues.push({ code: "missing-puzzle", message: `Private puzzle ${route.puzzleId} is unavailable.`, path: publicPath });
                continue;
            }
            if (route.placement === "native-html") {
                const artifact = puzzle.artifact;
                const entry = artifact.kind === "html"
                    ? artifact.files.find((file) => file.path === artifact.entryPath)
                    : undefined;
                const fragment = entry === undefined ? undefined : bodyFragment(entry.source);
                if (fragment === undefined || !routeSources.get(publicPath)?.includes(fragment)) {
                    issues.push({ code: "artifact-integrity", message: "Native HTML clue markup did not survive composition.", path: publicPath });
                }
            } else if (route.placement === "page-body") {
                const source = puzzle.artifact.kind === "text" ? puzzle.artifact.source : undefined;
                if (source === undefined || !routeSources.get(publicPath)?.includes(escapeHtml(source))) {
                    issues.push({ code: "artifact-integrity", message: "Text puzzle content did not survive composition.", path: publicPath });
                }
            } else if (route.placement === "media-viewer" || route.placement === "downloadable-file") {
                if (route.directAssetPath === undefined) continue;
                const actual = await readOrIssue(publicFile(publicDirectory, route.directAssetPath), route.directAssetPath, issues);
                if (actual === undefined) continue;
                const artifact = puzzle.artifact;
                const expected = artifact.kind === "audio"
                    ? Buffer.from(artifact.data, "base64")
                    : artifact.kind === "image" && artifact.mediaType === "image/png"
                        ? Buffer.from(artifact.data, "base64")
                        : Buffer.from(artifact.kind === "image" || artifact.kind === "text" ? artifact.source : "", "utf8");
                if (!actual.equals(expected)) {
                    issues.push({ code: "artifact-integrity", message: "Direct puzzle asset differs from the generated artifact.", path: route.directAssetPath });
                }
            } else if (route.placement === "version-set") {
                if (puzzle.artifact.kind !== "html") continue;
                for (const file of puzzle.artifact.files) {
                    const publicVersionPath = versionPath(site, route, file.path);
                    const actual = await readOrIssue(publicFile(publicDirectory, publicVersionPath), publicVersionPath, issues);
                    if (actual !== undefined && actual.toString("utf8") !== file.source) {
                        issues.push({ code: "artifact-integrity", message: "Version file differs from the generated artifact.", path: publicVersionPath });
                    }
                }
            }
        }
    }

    const puzzleRoutePaths = new Set(options.bundle.sites.flatMap((site) => site.routes
        .filter((route) => route.role === "puzzle")
        .map((route) => fullRoutePath(site, route))));
    const privateAnswers = options.inputs.puzzles.flatMap(({ puzzle }) => {
        const caseInsensitive = puzzle.validator.kind === "normalized-text"
            && puzzle.validator.options.caseInsensitive;
        return [puzzle.solution.canonical, ...(puzzle.solution.acceptedAlternatives ?? [])]
            .map((value) => ({ value: normalized(value), caseInsensitive }));
    });
    for (const [publicPath, source] of routeSources) {
        if (puzzleRoutePaths.has(publicPath)) continue;
        const normalizedSource = normalized(source);
        for (const answer of privateAnswers) {
            const comparableSource = answer.caseInsensitive ? normalizedSource.toLocaleLowerCase() : normalizedSource;
            const comparableAnswer = answer.caseInsensitive ? answer.value.toLocaleLowerCase() : answer.value;
            if (comparableAnswer.length > 0 && comparableSource.includes(comparableAnswer)) {
                issues.push({ code: "answer-leak", message: "A non-puzzle public page contains a private puzzle answer.", path: publicPath });
                break;
            }
        }
    }
    const manifestSource = await readFile(manifestPath, "utf8");
    if (/"(?:solution|validator|acceptedAlternatives|puzzleId)"\s*:/i.test(manifestSource)) {
        issues.push({ code: "private-metadata-leak", message: "The public manifest contains private puzzle metadata.", path: "/bundle.manifest.json" });
    }

    for (const [publicPath, source] of routeSources) {
        for (const reference of extractReferences(source)) {
            if (reference.startsWith("#") || reference.startsWith("data:")) continue;
            if (/^(?:https?:|mailto:|tel:)/i.test(reference)) {
                issues.push({ code: "external-request", message: `Public page references external resource ${reference}.`, path: publicPath });
                continue;
            }
            const target = reference.split(/[?#]/, 1)[0];
            if (target.startsWith("/") && !knownPublicPaths.has(target)) {
                issues.push({ code: "broken-link", message: `Public reference ${target} has no manifest target.`, path: publicPath });
            }
        }
        if (!/<html\b[^>]*\blang=/i.test(source) || !/<title>[^<]+<\/title>/i.test(source) || !/<h1\b/i.test(source)) {
            issues.push({ code: "html-structure", message: "Page is missing lang, title, or h1 metadata.", path: publicPath });
        }
        if (/<script\b/i.test(source) || /\son[a-z]+\s*=/i.test(source)) {
            issues.push({ code: "unsafe-script", message: "Public page contains script or inline event-handler markup.", path: publicPath });
        }
        for (const image of source.matchAll(/<img\b[^>]*>/gi)) {
            if (!/\balt=["'][^"']*["']/i.test(image[0])) {
                issues.push({ code: "missing-alt", message: "Image has no alt attribute.", path: publicPath });
            }
        }
    }

    const rootSource = routeSources.get("/") ?? "";
    for (const site of options.bundle.sites) {
        for (const route of site.routes) {
            const destination = fullRoutePath(site, route);
            for (const source of route.discovery?.from ?? []) {
                const sourceHtml = source.startsWith("starting-input:") ? rootSource : routeSources.get(source) ?? "";
                if (!sourceHtml.includes(destination)) {
                    issues.push({
                        code: "journey-link",
                        message: `Discovery source ${source} does not expose destination ${destination}.`,
                        path: source.startsWith("starting-input:") ? "/" : source
                    });
                }
            }
        }
    }

    const report: BundleVerificationReport = {
        schemaVersion: "1.0.0",
        levelId: options.inputs.level.id,
        status: issues.length === 0 ? "passed" : "failed",
        routeCount: manifest.routes.length,
        assetCount: manifest.assets.length,
        checks,
        issues
    };
    const reportPath = path.join(privateDirectory, "verification.report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (issues.length > 0) throw new BundleVerificationError(report);
    return report;
}
