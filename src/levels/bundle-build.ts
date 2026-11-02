import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PrivatePuzzleInstance } from "../core/types.js";
import type { LevelBundleInputs } from "./bundle-inputs.js";
import { assertLevelBundle, type BundleRoute, type BundledSite, type LevelBundle } from "./bundle.js";
import type { PuzzleCatalog } from "./catalog.js";
import { BUNDLE_SECURITY_HEADERS } from "./bundle-security.js";

const SITE_CSS = `:root{color-scheme:light;--paper:#f6f4ef;--ink:#20262d;--muted:#66717d;--line:#d6d1c7;--accent:#245b78;--card:#fff}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--accent)}header{background:var(--card);border-bottom:1px solid var(--line)}.masthead,.layout,footer{max-width:1080px;margin:auto;padding:1rem 1.5rem}.brand{font-size:1.35rem;font-weight:750;text-decoration:none;color:var(--ink)}nav ul{display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;padding:0;list-style:none}.layout{display:grid;grid-template-columns:minmax(0,1fr) 16rem;gap:2.5rem}.content,.sidebar{background:var(--card);border:1px solid var(--line);border-radius:.4rem;padding:1.5rem}.eyebrow{color:var(--muted);font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.summary{font-size:1.08rem;color:#46515c}.route-list{padding-left:1.2rem}.puzzle-artifact{margin:1.75rem 0;padding:1rem;border:1px solid var(--line);background:#fbfbfa;overflow:auto}.terminal-form{display:grid;gap:1rem;max-width:34rem}.terminal-form label{font-weight:650}.terminal-form input{display:block;width:100%;margin-top:.35rem;padding:.65rem;border:1px solid #8a9299;border-radius:.25rem}.terminal-form button{width:max-content;padding:.65rem 1rem;background:var(--accent);color:#fff;border:0;border-radius:.25rem;font-weight:700}footer{color:var(--muted);font-size:.85rem}@media(max-width:760px){.layout{grid-template-columns:1fr}.sidebar{order:2}}`;

export interface PublicBundleManifest {
    schemaVersion: "1.0.0";
    levelId: string;
    sites: Array<{ name: string; basePath: string }>;
    routes: Array<{ path: string; mediaType: "text/html"; sha256: string }>;
    assets: Array<{ path: string; mediaType: string; sha256: string }>;
    headers: typeof BUNDLE_SECURITY_HEADERS;
}

export interface BundleBuildResult {
    rootDirectory: string;
    publicDirectory: string;
    privateDirectory: string;
    manifestPath: string;
    reportPath: string;
    manifest: PublicBundleManifest;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function fullRoutePath(site: BundledSite, route: BundleRoute): string {
    if (site.basePath === "/") return route.path;
    if (route.path === "/") return site.basePath;
    return `${site.basePath}${route.path}`;
}

function routeOutputPath(publicDirectory: string, publicPath: string): string {
    const relative = publicPath.replace(/^\/+/, "");
    return path.join(publicDirectory, relative, "index.html");
}

function bodyFragment(source: string): string {
    const match = source.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i);
    if (match === null) throw new Error("Native HTML puzzle artifact has no body element.");
    return match[1];
}

function renderPageContent(route: BundleRoute): string {
    return [
        `<p class="eyebrow">${escapeHtml(route.role)}</p>`,
        `<h1>${escapeHtml(route.content.title)}</h1>`,
        `<p class="summary">${escapeHtml(route.content.description)}</p>`,
        ...route.content.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    ].join("\n");
}

function loadedPuzzle(inputs: LevelBundleInputs, puzzleId: string): PrivatePuzzleInstance {
    const item = inputs.puzzles.find((candidate) => candidate.puzzle.id === puzzleId);
    if (item === undefined) throw new Error(`Bundle build is missing generated puzzle ${puzzleId}.`);
    return item.puzzle;
}

function versionAssetPath(site: BundledSite, route: Extract<BundleRoute, { role: "puzzle" }>, filePath: string): string {
    const routePath = fullRoutePath(site, route);
    return `${routePath}/_artifact/${filePath.replace(/^\/+/, "")}`;
}

function renderPuzzle(
    site: BundledSite,
    route: Extract<BundleRoute, { role: "puzzle" }>,
    inputs: LevelBundleInputs
): string {
    const puzzle = loadedPuzzle(inputs, route.puzzleId);
    if (route.placement === "native-html") {
        if (puzzle.artifact.kind !== "html") throw new Error(`Puzzle ${puzzle.id} is not an HTML artifact.`);
        const artifact = puzzle.artifact;
        const entry = artifact.files.find((file) => file.path === artifact.entryPath);
        if (entry === undefined) throw new Error(`Puzzle ${puzzle.id} has no HTML entry file.`);
        return `<section class="puzzle-artifact" aria-label="Investigation resource">${bodyFragment(entry.source)}</section>`;
    }
    if (route.placement === "page-body") {
        if (puzzle.artifact.kind !== "text") throw new Error(`Puzzle ${puzzle.id} is not a text artifact.`);
        return `<pre class="puzzle-artifact">${escapeHtml(puzzle.artifact.source)}</pre>`;
    }
    if (route.placement === "media-viewer") {
        if (route.directAssetPath === undefined) throw new Error(`Puzzle ${puzzle.id} has no direct asset path.`);
        if (puzzle.artifact.kind === "image") {
            return `<figure class="puzzle-artifact"><img src="${escapeHtml(route.directAssetPath)}" alt="${escapeHtml(route.content.title)}"><figcaption><a href="${escapeHtml(route.directAssetPath)}" download>Download original image</a></figcaption></figure>`;
        }
        if (puzzle.artifact.kind === "audio") {
            return `<section class="puzzle-artifact"><audio controls preload="metadata" src="${escapeHtml(route.directAssetPath)}"></audio><p><a href="${escapeHtml(route.directAssetPath)}" download>Download audio file</a></p></section>`;
        }
        throw new Error(`Puzzle ${puzzle.id} cannot be displayed in a media viewer.`);
    }
    if (route.placement === "downloadable-file") {
        if (route.directAssetPath === undefined) throw new Error(`Puzzle ${puzzle.id} has no direct asset path.`);
        return `<p class="puzzle-artifact"><a href="${escapeHtml(route.directAssetPath)}" download>Download the attached file</a></p>`;
    }
    if (route.placement === "version-set") {
        if (puzzle.artifact.kind !== "html") throw new Error(`Puzzle ${puzzle.id} is not a versioned HTML artifact.`);
        const artifact = puzzle.artifact;
        const links = artifact.files.map((file) => {
            const label = file.path === artifact.entryPath ? "Version overview" : file.path.split("/").filter(Boolean).join(" / ");
            return `<li><a href="${escapeHtml(versionAssetPath(site, route, file.path))}">${escapeHtml(label)}</a></li>`;
        }).join("");
        return `<section class="puzzle-artifact"><h2>Available page versions</h2><ul>${links}</ul></section>`;
    }
    throw new Error(`Bundle builder does not yet support ${route.placement} placement for puzzle ${puzzle.id}.`);
}

function renderTerminal(inputs: LevelBundleInputs): string {
    const fields = inputs.level.terminalAction.fields.map((field) => [
        `<label for="${escapeHtml(field.id)}">${escapeHtml(field.label)}`,
        `<input id="${escapeHtml(field.id)}" name="${escapeHtml(field.id)}" required autocomplete="off">`,
        "</label>"
    ].join("\n")).join("\n");
    return `<form class="terminal-form" method="post" action="/api/validate">
<input type="hidden" name="levelId" value="${escapeHtml(inputs.level.id)}">
${fields}
<button type="submit">Submit findings</button>
</form>`;
}

function allBundleRoutes(bundle: LevelBundle): Array<{ site: BundledSite; route: BundleRoute; publicPath: string }> {
    return bundle.sites.flatMap((site) => site.routes.map((route) => ({
        site,
        route,
        publicPath: fullRoutePath(site, route)
    })));
}

function renderDiscoveryDestinations(bundle: LevelBundle, sourcePath: string): string {
    const destinations = allBundleRoutes(bundle).filter(({ route }) => route.discovery?.from.includes(sourcePath));
    if (destinations.length === 0) return "";
    const controls = destinations.map(({ route, publicPath }) => {
        const discovery = route.discovery;
        if (discovery === undefined) return "";
        if (discovery.kind === "lookup" || discovery.kind === "search") {
            return `<form method="get" action="${escapeHtml(publicPath)}"><label>${escapeHtml(discovery.cue)}<input name="q" required></label><button type="submit">Search</button></form>`;
        }
        return `<p><a href="${escapeHtml(publicPath)}">${escapeHtml(discovery.cue)}</a></p>`;
    }).join("\n");
    return `<section class="discovery"><h2>Related resources</h2>${controls}</section>`;
}

function renderSitePage(
    bundle: LevelBundle,
    site: BundledSite,
    route: BundleRoute,
    inputs: LevelBundleInputs
): string {
    const navigation = site.routes
        .filter((candidate) => candidate.role === "structural" || candidate.role === "supporting")
        .slice(0, 8)
        .map((candidate) => `<li><a href="${escapeHtml(fullRoutePath(site, candidate))}">${escapeHtml(candidate.content.title)}</a></li>`)
        .join("");
    const related = site.routes
        .filter((candidate) => candidate.path !== route.path)
        .slice(0, 8)
        .map((candidate) => `<li><a href="${escapeHtml(fullRoutePath(site, candidate))}">${escapeHtml(candidate.content.title)}</a></li>`)
        .join("");
    const embedded = route.role === "puzzle"
        ? renderPuzzle(site, route, inputs)
        : route.role === "terminal" ? renderTerminal(inputs) : "";
    const discovery = renderDiscoveryDestinations(bundle, fullRoutePath(site, route));
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHtml(route.content.description)}"><meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(route.content.title)} | ${escapeHtml(site.name)}</title><link rel="stylesheet" href="/assets/site.css"></head>
<body><header><div class="masthead"><a class="brand" href="${escapeHtml(site.basePath)}">${escapeHtml(site.name)}</a><nav aria-label="Primary"><ul>${navigation}</ul></nav></div></header>
<div class="layout"><main class="content">${renderPageContent(route)}${embedded}${discovery}</main><aside class="sidebar"><h2>Related information</h2><ul class="route-list">${related}</ul></aside></div>
<footer>Public information from ${escapeHtml(site.name)}.</footer></body></html>`;
}

function sha256(value: string | Buffer): string {
    return createHash("sha256").update(value).digest("hex");
}

async function writeText(filePath: string, source: string): Promise<string> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, source, "utf8");
    return sha256(source);
}

function artifactData(puzzle: PrivatePuzzleInstance): { data: string | Buffer; mediaType: string } {
    const artifact = puzzle.artifact;
    if (artifact.kind === "text") return { data: artifact.source, mediaType: artifact.mediaType };
    if (artifact.kind === "audio") return { data: Buffer.from(artifact.data, "base64"), mediaType: artifact.mediaType };
    if (artifact.kind === "image" && artifact.mediaType === "image/png") {
        return { data: Buffer.from(artifact.data, "base64"), mediaType: artifact.mediaType };
    }
    if (artifact.kind === "image") return { data: artifact.source, mediaType: artifact.mediaType };
    throw new Error(`HTML puzzle ${puzzle.id} must use native-html or version-set placement.`);
}

async function writePublicAsset(
    publicDirectory: string,
    publicPath: string,
    data: string | Buffer
): Promise<string> {
    const outputPath = path.join(publicDirectory, publicPath.replace(/^\/+/, ""));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, data);
    return sha256(data);
}

async function materializePuzzleAssets(
    bundle: LevelBundle,
    inputs: LevelBundleInputs,
    publicDirectory: string
): Promise<PublicBundleManifest["assets"]> {
    const assets: PublicBundleManifest["assets"] = [];
    for (const site of bundle.sites) {
        for (const route of site.routes) {
            if (route.role !== "puzzle") continue;
            const puzzle = loadedPuzzle(inputs, route.puzzleId);
            if (route.placement === "media-viewer" || route.placement === "downloadable-file") {
                if (route.directAssetPath === undefined) throw new Error(`Puzzle ${puzzle.id} has no direct asset path.`);
                const artifact = artifactData(puzzle);
                assets.push({
                    path: route.directAssetPath,
                    mediaType: artifact.mediaType,
                    sha256: await writePublicAsset(publicDirectory, route.directAssetPath, artifact.data)
                });
            } else if (route.placement === "version-set") {
                if (puzzle.artifact.kind !== "html") throw new Error(`Puzzle ${puzzle.id} is not a versioned HTML artifact.`);
                for (const file of puzzle.artifact.files) {
                    const publicPath = versionAssetPath(site, route, file.path);
                    assets.push({
                        path: publicPath,
                        mediaType: file.mediaType,
                        sha256: await writePublicAsset(publicDirectory, publicPath, file.source)
                    });
                }
            }
        }
    }
    return assets;
}

export async function buildLevelBundle(options: {
    bundle: LevelBundle;
    inputs: LevelBundleInputs;
    catalog: PuzzleCatalog;
    outputDirectory?: string;
}): Promise<BundleBuildResult> {
    assertLevelBundle(options.bundle, options.inputs.level, options.catalog);
    const rootDirectory = path.resolve(options.outputDirectory ?? "generated-bundles", options.inputs.level.id);
    const publicDirectory = path.join(rootDirectory, "public");
    const privateDirectory = path.join(rootDirectory, "private");
    await rm(publicDirectory, { recursive: true, force: true });
    await rm(privateDirectory, { recursive: true, force: true });
    await mkdir(publicDirectory, { recursive: true });
    await mkdir(privateDirectory, { recursive: true });

    const assetEntries = await materializePuzzleAssets(options.bundle, options.inputs, publicDirectory);
    const routeEntries: PublicBundleManifest["routes"] = [];
    for (const site of options.bundle.sites) {
        for (const route of site.routes) {
            const publicPath = fullRoutePath(site, route);
            const source = renderSitePage(options.bundle, site, route, options.inputs);
            const digest = await writeText(routeOutputPath(publicDirectory, publicPath), source);
            routeEntries.push({ path: publicPath, mediaType: "text/html", sha256: digest });
        }
    }
    await writeText(path.join(publicDirectory, "assets", "site.css"), SITE_CSS);
    const firstSite = options.bundle.sites[0];
    const startingRoutes = allBundleRoutes(options.bundle).filter(({ route }) =>
        route.discovery?.from.some((source) => source.startsWith("starting-input:"))
    );
    const startingLinks = startingRoutes.map(({ route, publicPath }) =>
        `<li><a href="${escapeHtml(publicPath)}">${escapeHtml(route.discovery?.cue ?? route.content.title)}</a></li>`
    ).join("");
    const indexSource = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(options.inputs.level.title)}</title></head><body><main><h1>${escapeHtml(options.inputs.level.title)}</h1><p>${escapeHtml(options.inputs.level.summary)}</p><ul>${options.bundle.sites.map((site) => `<li><a href="${escapeHtml(site.basePath)}">${escapeHtml(site.name)}</a></li>`).join("")}</ul>${startingLinks.length === 0 ? "" : `<h2>Starting resources</h2><ul>${startingLinks}</ul>`}<p><a href="${escapeHtml(firstSite.basePath)}">Begin</a></p></main></body></html>`;
    routeEntries.push({
        path: "/",
        mediaType: "text/html",
        sha256: await writeText(path.join(publicDirectory, "index.html"), indexSource)
    });

    const manifest: PublicBundleManifest = {
        schemaVersion: "1.0.0",
        levelId: options.inputs.level.id,
        sites: options.bundle.sites.map((site) => ({ name: site.name, basePath: site.basePath })),
        routes: routeEntries.sort((left, right) => left.path.localeCompare(right.path)),
        assets: [...assetEntries, {
            path: "/assets/site.css",
            mediaType: "text/css",
            sha256: sha256(await readFile(path.join(publicDirectory, "assets", "site.css")))
        }].sort((left, right) => left.path.localeCompare(right.path)),
        headers: BUNDLE_SECURITY_HEADERS
    };
    const manifestPath = path.join(publicDirectory, "bundle.manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const reportPath = path.join(privateDirectory, "build.report.json");
    const report = {
        schemaVersion: "1.0.0",
        levelId: options.inputs.level.id,
        bundleSeed: options.bundle.seed,
        puzzlePlacements: options.bundle.sites.flatMap((site) => site.routes
            .filter((route): route is Extract<BundleRoute, { role: "puzzle" }> => route.role === "puzzle")
            .map((route) => ({ puzzleId: route.puzzleId, path: fullRoutePath(site, route), placement: route.placement }))),
        terminal: options.bundle.terminal,
        publicManifestSha256: sha256(`${JSON.stringify(manifest, null, 2)}\n`)
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { rootDirectory, publicDirectory, privateDirectory, manifestPath, reportPath, manifest };
}
