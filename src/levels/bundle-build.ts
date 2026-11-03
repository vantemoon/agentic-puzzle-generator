import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PrivatePuzzleInstance } from "../core/types.js";
import {
    readWorldMediaAsset,
    readWorldMediaLibrary
} from "../agents/supporting-media/library.js";
import type { LevelBundleInputs } from "./bundle-inputs.js";
import { assertLevelBundle, type BundleRoute, type BundledSite, type LevelBundle } from "./bundle.js";
import type { PuzzleCatalog } from "./catalog.js";
import { BUNDLE_SECURITY_HEADERS } from "./bundle-security.js";

const SITE_CSS = `:root{color-scheme:light;--paper:#f6f4ef;--ink:#20262d;--muted:#66717d;--line:#d6d1c7;--accent:var(--site-accent,#245b78);--card:#fff}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body[data-font-style="serif"]{font-family:Georgia,"Times New Roman",serif}body[data-font-style="mixed"] h1,body[data-font-style="mixed"] h2,body[data-font-style="mixed"] h3{font-family:Georgia,"Times New Roman",serif}a{color:var(--accent)}header{background:var(--card);border-bottom:1px solid var(--line)}.masthead,.layout,footer{max-width:1080px;margin:auto;padding:1rem 1.5rem}.brand{font-size:1.35rem;font-weight:750;text-decoration:none;color:var(--ink)}nav ul{display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;padding:0;list-style:none}.layout{display:grid;grid-template-columns:minmax(0,1fr) 16rem;gap:2.5rem}.content,.sidebar{background:var(--card);border:1px solid var(--line);border-radius:.4rem;padding:1.5rem}.summary{font-size:1.08rem;color:#46515c}.route-list{padding-left:1.2rem}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse}th,td{padding:.6rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}dl{display:grid;grid-template-columns:minmax(8rem,auto) 1fr;gap:.35rem 1rem}dt{font-weight:700}dd{margin:0}.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:1rem}.card-grid article{padding:1rem;border:1px solid var(--line);border-radius:.35rem}.supporting-media img{display:block;width:100%;height:auto;border-radius:.35rem}.supporting-media figcaption{color:var(--muted);font-size:.9rem}.supporting-document a{display:inline-block;padding:.65rem 1rem;border:1px solid var(--accent);border-radius:.3rem;font-weight:700}.standalone-document{background:#ece9e2;font-family:Georgia,"Times New Roman",serif}.standalone-document>main{max-width:760px;margin:2rem auto;padding:3rem;background:#fff;box-shadow:0 1rem 3rem #0002;border-top:.55rem solid var(--accent)}.standalone-document .subtitle{font-size:1.2rem;color:var(--muted)}.standalone-document section{margin-top:2rem}.standalone-document section h2{font-size:1.15rem;color:var(--accent);border-bottom:1px solid var(--line);padding-bottom:.35rem}.puzzle-artifact{margin:1.75rem 0;padding:1rem;border:1px solid var(--line);background:#fbfbfa;overflow:auto}.terminal-form{display:grid;gap:1rem;max-width:34rem}.terminal-form label{font-weight:650}.terminal-form input{display:block;width:100%;margin-top:.35rem;padding:.65rem;border:1px solid #8a9299;border-radius:.25rem}.terminal-form button{width:max-content;padding:.65rem 1rem;background:var(--accent);color:#fff;border:0;border-radius:.25rem;font-weight:700}footer{color:var(--muted);font-size:.85rem}@media(max-width:760px){.layout{grid-template-columns:1fr}.sidebar{order:2}.standalone-document>main{margin:0;padding:1.5rem;box-shadow:none}}`;

const REALISM_CSS = `.visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.skip-link{position:absolute;left:-9999px;top:.5rem;z-index:20;background:#fff;padding:.6rem 1rem}.skip-link:focus{left:.5rem}.site-kicker{margin:0 0 .2rem;color:var(--muted);font-size:.74rem;font-weight:750;letter-spacing:.12em;text-transform:uppercase}.brand-row{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem}.site-search{display:flex;align-items:end;gap:.4rem}.site-search label{font-size:.78rem;font-weight:700}.site-search input[type="search"]{display:block;min-width:12rem;margin-top:.2rem;padding:.45rem .6rem;border:1px solid var(--line);background:var(--card);color:var(--ink)}.site-search button{padding:.45rem .7rem;border:0;background:var(--accent);color:#fff}.primary-nav{margin-top:.85rem;border-top:1px solid var(--line);padding-top:.7rem}.primary-nav a[aria-current="page"],.secondary-nav a[aria-current="page"]{font-weight:750;text-decoration-thickness:.15rem}.secondary-nav ul{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.4rem 1rem;margin:.55rem 0 0;padding:0;list-style:none;font-size:.88rem}.breadcrumbs{max-width:1080px;margin:.9rem auto 0;padding:0 1.5rem;color:var(--muted);font-size:.84rem}.breadcrumbs ol{display:flex;gap:.45rem;margin:0;padding:0;list-style:none}.breadcrumbs li+li:before{content:"/";margin-right:.45rem;color:var(--line)}.layout.no-sidebar{grid-template-columns:minmax(0,52rem);justify-content:center}.content>h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.08;margin:.1rem 0 .65rem}.content-block{margin-top:2rem}.content-block>h2{font-size:1.22rem;line-height:1.25}.card-grid article{background:color-mix(in srgb,var(--card) 94%,var(--accent));box-shadow:0 .35rem 1rem #0000000a}.supporting-media{margin:0;padding-bottom:.5rem}.sidebar h2{margin-top:0;font-size:1rem}.route-list{display:grid;gap:.65rem}.route-list a{text-decoration-thickness:.06rem}.discovery{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--line)}.discovery form{display:flex;align-items:end;gap:.55rem;flex-wrap:wrap}.discovery label{font-weight:700}.discovery input{display:block;margin-top:.3rem;padding:.55rem;border:1px solid var(--line)}.discovery button{padding:.55rem .8rem;border:0;background:var(--accent);color:#fff}.site-footer{display:flex;justify-content:space-between;gap:1rem;border-top:1px solid var(--line)}.site-footer nav{display:flex;flex-wrap:wrap;gap:.4rem 1rem}body[data-tone="warm"]{--paper:#f8f2e8;--line:#ded2c2}body[data-tone="formal"]{--paper:#eef2f5;--line:#bbc6ce}body[data-tone="playful"] .card-grid article{border-radius:1rem}body[data-tone="artistic"] .supporting-media img{margin-bottom:.9rem;box-shadow:.7rem .7rem 0 color-mix(in srgb,var(--accent) 22%,transparent)}body[data-tone="artistic"] .supporting-media figcaption{position:relative}body[data-density="compact"] .content,body[data-density="compact"] .sidebar{padding:1rem}body[data-density="spacious"] .content,body[data-density="spacious"] .sidebar{padding:clamp(1.5rem,4vw,3rem)}body[data-font-style="mono-accent"] h1,body[data-font-style="mono-accent"] h2,body[data-font-style="mono-accent"] .site-kicker{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}body[data-archetype="blog"]{--paper:#faf8f3;--line:#ddd6c8}body[data-archetype="blog"] header{text-align:center;border-top:.4rem solid var(--accent)}body[data-archetype="blog"] .brand-row{display:block}body[data-archetype="blog"] .brand{font:700 clamp(2rem,6vw,3.4rem)/1 Georgia,serif}body[data-archetype="blog"] .primary-nav ul{justify-content:center}body[data-archetype="blog"] .layout{grid-template-columns:minmax(0,46rem) 14rem;justify-content:center}body[data-archetype="blog"] .layout.no-sidebar{grid-template-columns:minmax(0,52rem)}body[data-archetype="blog"] .content{border:0;background:transparent}body[data-archetype="blog"] .sidebar{border-width:0 0 0 1px;border-radius:0;background:transparent}body[data-archetype="organization"] header{border-top:.55rem solid var(--accent)}body[data-archetype="organization"] .brand{font-size:1.65rem}body[data-archetype="organization"] .primary-nav{background:color-mix(in srgb,var(--accent) 10%,white);margin-inline:-1.5rem;padding-inline:1.5rem}body[data-archetype="gallery"]{color-scheme:dark;--paper:#141516;--card:#202224;--ink:#f0eee8;--muted:#aaa9a4;--line:#3b3d3f}body[data-archetype="gallery"] header{background:#0e0f10}body[data-archetype="gallery"] .brand{font-size:1.8rem;letter-spacing:.04em}body[data-archetype="gallery"] .card-grid{grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))}body[data-archetype="gallery"] .supporting-media img{border:1px solid #ffffff22}body[data-archetype="records"],body[data-archetype="version-history"]{--paper:#edf1f4;--line:#b9c3cb;--card:#fff}body[data-archetype="records"] header,body[data-archetype="version-history"] header{border-top:.35rem solid var(--accent)}body[data-archetype="records"] .content,body[data-archetype="records"] .sidebar,body[data-archetype="version-history"] .content{border-radius:0;box-shadow:0 .2rem .8rem #24374610}body[data-archetype="records"] table th,body[data-archetype="version-history"] table th{background:#e3e9ed}body[data-archetype="directory"],body[data-archetype="database"]{--paper:#f3f6f7;--line:#c9d3d8}body[data-archetype="directory"] .masthead,body[data-archetype="database"] .masthead{max-width:1240px}body[data-archetype="directory"] .layout,body[data-archetype="database"] .layout{max-width:1240px;grid-template-columns:minmax(0,1fr) 18rem}body[data-archetype="directory"] .layout.no-sidebar,body[data-archetype="database"] .layout.no-sidebar{grid-template-columns:minmax(0,64rem);justify-content:center}body[data-archetype="directory"] table,body[data-archetype="database"] table{font-size:.92rem}body[data-archetype="directory"] tbody tr:hover,body[data-archetype="database"] tbody tr:hover{background:color-mix(in srgb,var(--accent) 7%,white)}body[data-archetype="audio-archive"]{--paper:#191d28;--card:#242938;--ink:#f4f5f7;--muted:#b0b7c7;--line:#3e465c}body[data-archetype="audio-archive"] header{background:linear-gradient(135deg,#171b25,color-mix(in srgb,var(--accent) 35%,#171b25))}body[data-archetype="audio-archive"] .brand{font-size:1.75rem}body[data-archetype="generic"] header{border-top:.35rem solid var(--accent)}.bundle-index{min-height:100vh;padding:clamp(2rem,8vw,6rem);background:#10151d;color:#f2f5f8}.bundle-index main{max-width:900px;margin:auto}.bundle-index .summary{color:#b8c1cc}.bundle-site-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem;margin:2rem 0}.bundle-site-grid a{display:block;min-height:9rem;padding:1.3rem;border:1px solid #ffffff22;border-radius:.6rem;background:#ffffff0d;color:#fff;text-decoration:none}.bundle-site-grid a:hover,.bundle-site-grid a:focus{background:#ffffff18;border-color:#ffffff55}.bundle-site-grid strong{display:block;font-size:1.2rem}.bundle-site-grid span{display:block;margin-top:.7rem;color:#b8c1cc}.begin-link{display:inline-block;padding:.7rem 1rem;border-radius:.35rem;background:#fff;color:#10151d;font-weight:750;text-decoration:none}@media(max-width:760px){.brand-row{align-items:flex-start;flex-direction:column}.site-search{width:100%}.site-search input[type="search"]{min-width:0;flex:1}.breadcrumbs{padding-inline:1rem}.site-footer{display:block}body[data-archetype="blog"] .layout,body[data-archetype="directory"] .layout,body[data-archetype="database"] .layout{grid-template-columns:1fr}}`;

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

function optionalHeading(heading: string | undefined): string {
    return heading === undefined ? "" : `<h2>${escapeHtml(heading)}</h2>`;
}

function contentBlock(kind: string, source: string): string {
    return `<section class="content-block content-kind-${escapeHtml(kind)}">${source}</section>`;
}

function renderPageContent(
    route: BundleRoute,
    bundle: LevelBundle,
    supportingMediaPaths: Map<string, string>
): string {
    const blocks = route.content.blocks.map((block) => {
        if (block.kind === "prose") {
            return contentBlock(block.kind, `${optionalHeading(block.heading)}${block.paragraphs
                .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}`);
        }
        if (block.kind === "list") {
            return contentBlock(block.kind, `${optionalHeading(block.heading)}<ul>${block.items
                .map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
        }
        if (block.kind === "records") {
            return contentBlock(block.kind, `${optionalHeading(block.heading)}<dl>${block.entries.map((entry) =>
                `<dt>${escapeHtml(entry.label)}</dt><dd>${escapeHtml(entry.value)}</dd>`
            ).join("")}</dl>`);
        }
        if (block.kind === "table") {
            return contentBlock(block.kind, `${optionalHeading(block.heading)}<div class="table-scroll"><table><thead><tr>${block.columns
                .map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${block.rows
                .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
                .join("")}</tbody></table></div>`);
        }
        if (block.kind === "cards") {
            return contentBlock(block.kind, `${optionalHeading(block.heading)}<div class="card-grid">${block.items.map((item) => {
                const title = item.href === undefined
                    ? `<h3>${escapeHtml(item.title)}</h3>`
                    : `<h3><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></h3>`;
                return `<article>${title}<p>${escapeHtml(item.summary)}</p></article>`;
            }).join("")}</div>`);
        }
        const request = bundle.mediaRequests.find((candidate) => candidate.id === block.mediaId);
        const publicPath = supportingMediaPaths.get(block.mediaId);
        if (request === undefined || publicPath === undefined) {
            throw new Error(`Supporting media ${block.mediaId} was not materialized.`);
        }
        const accessibilityText = request?.accessibilityText ?? block.caption ?? "Supporting media";
        if (request.kind === "document") {
            return contentBlock(block.kind, `<p class="supporting-document"><a href="${escapeHtml(publicPath)}" target="_blank" rel="noopener">${escapeHtml(block.caption ?? request.purpose)}</a></p>`);
        }
        return contentBlock(block.kind, `<figure class="supporting-media"><img src="${escapeHtml(publicPath)}" alt="${escapeHtml(accessibilityText)}" loading="lazy">${block.caption === undefined ? "" : `<figcaption>${escapeHtml(block.caption)}</figcaption>`}</figure>`);
    });
    return [
        `<h1>${escapeHtml(route.content.title)}</h1>`,
        `<p class="summary">${escapeHtml(route.content.description)}</p>`,
        ...blocks
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

function renderTerminal(inputs: LevelBundleInputs, site: BundledSite, route: BundleRoute): string {
    const fields = inputs.level.terminalAction.fields.map((field) => [
        `<label for="${escapeHtml(field.id)}">${escapeHtml(field.label)}`,
        `<input id="${escapeHtml(field.id)}" name="${escapeHtml(field.id)}" required autocomplete="off">`,
        "</label>"
    ].join("\n")).join("\n");
    return `<form class="terminal-form" method="post" action="/api/validate">
<input type="hidden" name="levelId" value="${escapeHtml(inputs.level.id)}">
<input type="hidden" name="returnPath" value="${escapeHtml(fullRoutePath(site, route))}">
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

export function selectBundleStartingRoutes(
    bundle: LevelBundle,
    startingInputIds: string[]
): Array<{ inputId: string; site: BundledSite; route: BundleRoute; publicPath: string }> {
    const routes = allBundleRoutes(bundle);
    return startingInputIds.flatMap((inputId) => {
        const source = `starting-input:${inputId}`;
        const candidates = routes.filter(({ route }) => route.discovery?.from.includes(source));
        const ordered = candidates.map((candidate, index) => ({
            ...candidate,
            index,
            siteIndex: bundle.sites.findIndex((site) => site.id === candidate.site.id),
            primaryHomepage: candidate.site.id === bundle.sites[0]?.id && candidate.route.path === "/",
            homepage: candidate.route.path === "/"
        })).sort((left, right) =>
            Number(right.primaryHomepage) - Number(left.primaryHomepage)
            || Number(right.homepage) - Number(left.homepage)
            || left.siteIndex - right.siteIndex
            || left.index - right.index
        );
        const selected = ordered[0];
        return selected === undefined ? [] : [{
            inputId,
            site: selected.site,
            route: selected.route,
            publicPath: selected.publicPath
        }];
    });
}

type NavigationPlacement = NonNullable<BundleRoute["navigation"]>;

function navigationPlacement(site: BundledSite, route: BundleRoute): NavigationPlacement {
    if (route.navigation !== undefined) return route.navigation;
    if (route.path === "/") return "primary";
    if (route.path === "/about" || route.path === "/archive") return "primary";
    if (route.path.includes("/policies") || route.path.includes("/policy")) return "footer";
    if (route.role === "puzzle" || route.role === "terminal") return "contextual";
    if (site.archetype === "blog" && route.path.startsWith("/posts/")) return "contextual";
    if (route.path.split("/").filter(Boolean).length > 1) return "contextual";
    return "primary";
}

function contentLinkedPaths(route: BundleRoute): Set<string> {
    return new Set(route.content.blocks.flatMap((block) =>
        block.kind === "cards"
            ? block.items.flatMap((item) => item.href === undefined ? [] : [item.href])
            : []
    ));
}

function renderSearchForm(publicPath: string, label: string, className = ""): string {
    const classAttribute = className.length === 0 ? "" : ` class="${escapeHtml(className)}"`;
    return `<form${classAttribute} method="get" action="/api/search" role="search"><input type="hidden" name="target" value="${escapeHtml(publicPath)}"><label>${escapeHtml(label)}<input name="q" type="search" required></label><button type="submit">Search</button></form>`;
}

function renderDiscoveryDestinations(bundle: LevelBundle, sourcePath: string): string {
    const source = allBundleRoutes(bundle).find((candidate) => candidate.publicPath === sourcePath);
    const contentLinks = source === undefined ? new Set<string>() : contentLinkedPaths(source.route);
    const destinations = allBundleRoutes(bundle).filter(({ route }) => route.discovery?.from.includes(sourcePath));
    if (destinations.length === 0) return "";
    const controls = destinations.flatMap(({ site, route, publicPath }) => {
        const discovery = route.discovery;
        if (discovery === undefined || contentLinks.has(publicPath)) return [];
        if (discovery.kind === "lookup" || discovery.kind === "search") {
            if (source?.site.id === site.id) return [];
            return [renderSearchForm(publicPath, `Search ${route.content.title}`)];
        }
        return [`<p><a href="${escapeHtml(publicPath)}">${escapeHtml(route.content.title)}</a></p>`];
    }).join("\n");
    if (controls.length === 0) return "";
    return `<section class="discovery"><h2>Related resources</h2>${controls}</section>`;
}

function archetypePresentation(archetype: BundledSite["archetype"]): {
    kicker: string;
    sidebar: string;
    footer: string;
} {
    if (archetype === "blog") return { kicker: "Independent journal", sidebar: "More from the journal", footer: "Notes, fieldwork, and recent posts" };
    if (archetype === "organization") return { kicker: "Community information", sidebar: "Visitor information", footer: "Information for visitors and neighbors" };
    if (archetype === "gallery") return { kicker: "Image collection", sidebar: "Explore the collection", footer: "Browse public collections and image records" };
    if (archetype === "records") return { kicker: "Public records", sidebar: "Records and services", footer: "Public information and records access" };
    if (archetype === "directory") return { kicker: "Public directory", sidebar: "Browse the directory", footer: "Directory listings and public profiles" };
    if (archetype === "version-history") return { kicker: "Document history", sidebar: "Related versions", footer: "Published document history" };
    if (archetype === "audio-archive") return { kicker: "Listen and explore", sidebar: "From the archive", footer: "Public audio archive" };
    if (archetype === "database") return { kicker: "Public data service", sidebar: "Data resources", footer: "Searchable public information" };
    return { kicker: "Public information", sidebar: "Related information", footer: "Public information and resources" };
}

function breadcrumbParent(site: BundledSite, route: BundleRoute): BundleRoute | undefined {
    if (site.archetype === "blog" && route.path.startsWith("/posts/")) {
        return site.routes.find((candidate) => candidate.path === "/archive");
    }
    return route.discovery?.from
        .map((source) => site.routes.find((candidate) => fullRoutePath(site, candidate) === source))
        .find((candidate) => candidate !== undefined && candidate.path !== "/");
}

function renderBreadcrumbs(site: BundledSite, route: BundleRoute): string {
    if (route.path === "/") {
        return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li aria-current="page">Home</li></ol></nav>`;
    }
    const parent = breadcrumbParent(site, route);
    const parentItem = parent === undefined
        ? ""
        : `<li><a href="${escapeHtml(fullRoutePath(site, parent))}">${escapeHtml(parent.content.title)}</a></li>`;
    return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol><li><a href="${escapeHtml(site.basePath)}">Home</a></li>${parentItem}<li aria-current="page">${escapeHtml(route.content.title)}</li></ol></nav>`;
}

function renderContextualSearch(site: BundledSite, route: BundleRoute): string {
    const sourcePath = fullRoutePath(site, route);
    const destination = site.routes.find((candidate) =>
        (candidate.discovery?.kind === "search" || candidate.discovery?.kind === "lookup")
        && candidate.discovery.from.includes(sourcePath)
    );
    if (destination === undefined) return "";
    return renderSearchForm(fullRoutePath(site, destination), "Search this site", "site-search");
}

function contextualSidebarRoutes(site: BundledSite, route: BundleRoute): BundleRoute[] {
    if (site.archetype === "blog" && route.path === "/archive") return [];
    const contentLinks = contentLinkedPaths(route);
    const candidates = site.archetype === "blog"
        ? site.routes.filter((candidate) =>
            candidate.path.startsWith("/posts/") || candidate.path === "/archive"
        )
        : site.routes.filter((candidate) => {
            const placement = navigationPlacement(site, candidate);
            return placement === "primary" || placement === "secondary";
        });
    return candidates.filter((candidate) =>
        candidate.path !== route.path
        && candidate.path !== "/"
        && !contentLinks.has(fullRoutePath(site, candidate))
    ).slice(0, 5);
}

function renderSitePage(
    bundle: LevelBundle,
    site: BundledSite,
    route: BundleRoute,
    inputs: LevelBundleInputs,
    supportingMediaPaths: Map<string, string>,
    siteStylesheetPath: string
): string {
    const presentation = archetypePresentation(site.archetype);
    const navigation = site.routes
        .filter((candidate) => navigationPlacement(site, candidate) === "primary")
        .slice(0, 7)
        .map((candidate) => `<li><a href="${escapeHtml(fullRoutePath(site, candidate))}"${candidate.path === route.path ? ' aria-current="page"' : ""}>${escapeHtml(candidate.path === "/" ? "Home" : candidate.content.title)}</a></li>`)
        .join("");
    const secondaryNavigation = site.routes
        .filter((candidate) => navigationPlacement(site, candidate) === "secondary")
        .map((candidate) => `<li><a href="${escapeHtml(fullRoutePath(site, candidate))}"${candidate.path === route.path ? ' aria-current="page"' : ""}>${escapeHtml(candidate.content.title)}</a></li>`)
        .join("");
    const footerNavigation = site.routes
        .filter((candidate) => navigationPlacement(site, candidate) === "footer")
        .map((candidate) => `<a href="${escapeHtml(fullRoutePath(site, candidate))}">${escapeHtml(candidate.content.title)}</a>`)
        .join("");
    const sidebarRoutes = contextualSidebarRoutes(site, route);
    const related = sidebarRoutes
        .map((candidate) => `<li><a href="${escapeHtml(fullRoutePath(site, candidate))}">${escapeHtml(candidate.content.title)}</a></li>`)
        .join("");
    const sidebar = sidebarRoutes.length === 0
        ? ""
        : `<aside class="sidebar"><h2>${escapeHtml(presentation.sidebar)}</h2><ul class="route-list">${related}</ul></aside>`;
    const embedded = route.role === "puzzle"
        ? renderPuzzle(site, route, inputs)
        : route.role === "terminal" ? renderTerminal(inputs, site, route) : "";
    const discovery = renderDiscoveryDestinations(bundle, fullRoutePath(site, route));
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHtml(route.content.description)}"><meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(route.content.title)} | ${escapeHtml(site.name)}</title><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="${escapeHtml(siteStylesheetPath)}"></head>
<body data-archetype="${escapeHtml(site.archetype)}" data-tone="${escapeHtml(site.visualProfile.tone)}" data-font-style="${escapeHtml(site.visualProfile.fontStyle)}" data-density="${escapeHtml(site.visualProfile.density)}"><a class="skip-link" href="#main-content">Skip to content</a><header><div class="masthead"><p class="site-kicker">${escapeHtml(presentation.kicker)}</p><div class="brand-row"><a class="brand" href="${escapeHtml(site.basePath)}">${escapeHtml(site.name)}</a>${renderContextualSearch(site, route)}</div><nav class="primary-nav" aria-label="Primary"><ul>${navigation}</ul></nav>${secondaryNavigation.length === 0 ? "" : `<nav class="secondary-nav" aria-label="Secondary"><ul>${secondaryNavigation}</ul></nav>`}</div></header>
${renderBreadcrumbs(site, route)}<div class="layout${sidebar.length === 0 ? " no-sidebar" : ""}"><main class="content" id="main-content">${renderPageContent(route, bundle, supportingMediaPaths)}${embedded}${discovery}</main>${sidebar}</div>
<footer class="site-footer"><span>${escapeHtml(site.name)} — ${escapeHtml(presentation.footer)}</span>${footerNavigation.length === 0 ? "" : `<nav aria-label="Footer">${footerNavigation}</nav>`}</footer></body></html>`;
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

async function materializeSupportingMediaAssets(
    bundle: LevelBundle,
    inputs: LevelBundleInputs,
    publicDirectory: string,
    rootDirectory?: string
): Promise<{
    assets: PublicBundleManifest["assets"];
    publicPaths: Map<string, string>;
}> {
    if (bundle.mediaRequests.length === 0) return { assets: [], publicPaths: new Map() };
    const library = await readWorldMediaLibrary(inputs.world.id, rootDirectory);
    const assets: PublicBundleManifest["assets"] = [];
    const publicPaths = new Map<string, string>();
    for (const request of bundle.mediaRequests) {
        const asset = library.assets.find((candidate) => candidate.id === request.id);
        if (asset === undefined) {
            throw new Error(
                `Supporting media ${request.id} has not been generated. Run level:bundle to populate the world media library.`
            );
        }
        if (asset.kind !== request.kind) {
            throw new Error(`Supporting media ${request.id} has kind ${asset.kind}; expected ${request.kind}.`);
        }
        const data = await readWorldMediaAsset({
            worldId: inputs.world.id,
            asset,
            rootDirectory
        });
        const publicPath = `/assets/supporting/${path.basename(asset.file)}`;
        assets.push({
            path: publicPath,
            mediaType: asset.mediaType,
            sha256: await writePublicAsset(publicDirectory, publicPath, data)
        });
        publicPaths.set(request.id, publicPath);
    }
    return { assets, publicPaths };
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
    worldMediaDirectory?: string;
}): Promise<BundleBuildResult> {
    assertLevelBundle(options.bundle, options.inputs.level, options.catalog, options.inputs.world);
    const rootDirectory = path.resolve(options.outputDirectory ?? "generated-bundles", options.inputs.level.id);
    const publicDirectory = path.join(rootDirectory, "public");
    const privateDirectory = path.join(rootDirectory, "private");
    await rm(publicDirectory, { recursive: true, force: true });
    await rm(privateDirectory, { recursive: true, force: true });
    await mkdir(publicDirectory, { recursive: true });
    await mkdir(privateDirectory, { recursive: true });

    const supportingMedia = await materializeSupportingMediaAssets(
        options.bundle,
        options.inputs,
        publicDirectory,
        options.worldMediaDirectory
    );
    const assetEntries = [
        ...await materializePuzzleAssets(options.bundle, options.inputs, publicDirectory),
        ...supportingMedia.assets
    ];
    const routeEntries: PublicBundleManifest["routes"] = [];
    for (const [siteIndex, site] of options.bundle.sites.entries()) {
        const siteStylesheetPath = `/assets/site-${siteIndex + 1}.css`;
        const siteCss = `:root{--site-accent:${site.visualProfile.accentColor}}`;
        assetEntries.push({
            path: siteStylesheetPath,
            mediaType: "text/css",
            sha256: await writePublicAsset(publicDirectory, siteStylesheetPath, siteCss)
        });
        for (const route of site.routes) {
            const publicPath = fullRoutePath(site, route);
            const source = renderSitePage(
                options.bundle,
                site,
                route,
                options.inputs,
                supportingMedia.publicPaths,
                siteStylesheetPath
            );
            const digest = await writeText(routeOutputPath(publicDirectory, publicPath), source);
            routeEntries.push({ path: publicPath, mediaType: "text/html", sha256: digest });
        }
    }
    await writeText(path.join(publicDirectory, "assets", "site.css"), `${SITE_CSS}\n${REALISM_CSS}`);
    const startingRoutes = selectBundleStartingRoutes(
        options.bundle,
        options.inputs.level.startingInputs.map((input) => input.id)
    );
    if (startingRoutes.length === 0) {
        throw new Error("The level bundle has no route for its starting input.");
    }
    const entryControls = startingRoutes.length === 1
        ? `<p><a class="begin-link" href="${escapeHtml(startingRoutes[0].publicPath)}" target="_blank" rel="noopener">Begin investigation</a></p>`
        : `<section><h2>Starting resources</h2><div class="bundle-site-grid">${startingRoutes.map(({ inputId, route, publicPath }) => {
            const input = options.inputs.level.startingInputs.find((candidate) => candidate.id === inputId);
            return `<a href="${escapeHtml(publicPath)}" target="_blank" rel="noopener"><strong>${escapeHtml(route.content.title)}</strong><span>${escapeHtml(input?.description ?? route.content.description)}</span></a>`;
        }).join("")}</div></section>`;
    const indexSource = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(options.inputs.level.title)}</title><link rel="stylesheet" href="/assets/site.css"></head><body class="bundle-index"><main><p class="site-kicker">Investigation briefing</p><h1>${escapeHtml(options.inputs.level.title)}</h1><p class="summary">${escapeHtml(options.inputs.level.summary)}</p>${entryControls}</main></body></html>`;
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
        supportingMediaRequests: options.bundle.mediaRequests,
        proposedWorldAdditions: options.bundle.worldAdditions,
        terminal: options.bundle.terminal,
        publicManifestSha256: sha256(`${JSON.stringify(manifest, null, 2)}\n`)
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { rootDirectory, publicDirectory, privateDirectory, manifestPath, reportPath, manifest };
}
