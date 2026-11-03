import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createAltTextPuzzle } from "../src/agents/alt-text/engine.js";
import { createHtmlCommentPuzzle } from "../src/agents/html-comment/engine.js";
import { createSourceCodePuzzle } from "../src/agents/html-source-inspection/engine.js";
import { createPageVersionPuzzle } from "../src/agents/page-version/engine.js";
import { buildLevelBundlePrompt } from "../src/agents/level-bundle/prompt.js";
import { stopAfterRepeatedTruncatedBundleSubmissions } from "../src/agents/level-bundle/agent.js";
import { scaledSupportingItemRange } from "../src/agents/level-bundle/limits.js";
import { createStagedLevelBundleTools } from "../src/agents/level-bundle/staged-tool.js";
import { createSubmitLevelBundleTool } from "../src/agents/level-bundle/tool.js";
import {
    assertLevelBundle,
    LEVEL_BUNDLE_SCHEMA_VERSION,
    type LevelBundle,
    validateLevelBundle
} from "../src/levels/bundle.js";
import {
    LevelBundlePreflightError,
    loadLevelBundleInputs
} from "../src/levels/bundle-inputs.js";
import { readLevelBundleFile } from "../src/levels/bundle-io.js";
import { repositoryPuzzleCatalog } from "../src/levels/catalog.js";
import { writeGeneratedPuzzle } from "../src/levels/puzzle-generation.js";
import type { PuzzleNode } from "../src/levels/types.js";
import type { GameWorld } from "../src/world/types.js";
import { levelFixture } from "./fixtures/level-v5.js";

const page = (title: string) => ({
    title,
    description: `${title} page`,
    blocks: [{ kind: "prose" as const, paragraphs: [`Public information for ${title}.`] }]
});

const visualProfile = {
    tone: "formal" as const,
    fontStyle: "serif" as const,
    density: "compact" as const,
    accentColor: "#425d6b",
    mediaStyle: "Documentary civic records photography"
};

const fromRecordsHome = (cue: string) => ({
    kind: "navigation" as const,
    from: ["/community-records"],
    cue
});

function validBundle(): LevelBundle {
    return {
        schemaVersion: LEVEL_BUNDLE_SCHEMA_VERSION,
        levelId: levelFixture.id,
        world: {
            id: levelFixture.world.id,
            revision: levelFixture.world.revision
        },
        seed: "community-cleanup-records-v1",
        worldAdditions: { entities: [], facts: [] },
        mediaRequests: [{
            id: "records-header",
            siteId: "community-records",
            routePath: "/",
            kind: "raster-image",
            purpose: "Establish the public records office",
            brief: "A documentary exterior photograph of the community records office",
            accessibilityText: "Exterior of the community records office",
            worldEntityIds: ["site:community-notices"]
        }],
        sites: [{
            id: "community-records",
            name: "Community Records",
            worldEntityId: "site:community-notices",
            archetype: "records",
            visualProfile,
            basePath: "/community-records",
            routes: [
                {
                    path: "/",
                    role: "structural",
                    content: {
                        ...page("Records home"),
                        blocks: [
                            ...page("Records home").blocks,
                            { kind: "media", mediaId: "records-header", caption: "Community records office" }
                        ]
                    },
                    discovery: {
                        kind: "navigation",
                        from: ["starting-input:notice-url"],
                        cue: "Open the public records office home page."
                    }
                },
                {
                    path: "/notices/cleanup",
                    role: "puzzle",
                    content: page("Cleanup notice"),
                    puzzleId: "find-project-name",
                    placement: "native-html",
                    discovery: fromRecordsHome("Open the cleanup notice.")
                },
                {
                    path: "/photos/community-event",
                    role: "puzzle",
                    content: page("Community event photo"),
                    puzzleId: "find-event-date",
                    placement: "native-html",
                    discovery: {
                        kind: "stable-path",
                        from: ["starting-input:photo-url"],
                        cue: "Open the supplied community photo URL."
                    }
                },
                {
                    path: "/records/meeting-history",
                    role: "puzzle",
                    content: page("Meeting history"),
                    puzzleId: "find-meeting-place",
                    placement: "version-set",
                    discovery: fromRecordsHome("Review the corrected meeting notice.")
                },
                {
                    path: "/directory/coordinator",
                    role: "puzzle",
                    content: page("Coordinator profile"),
                    puzzleId: "identify-coordinator",
                    placement: "native-html",
                    discovery: fromRecordsHome("Open the coordinator directory entry.")
                },
                {
                    path: "/submit",
                    role: "terminal",
                    content: page("Submit findings"),
                    discovery: {
                        kind: "direct-link",
                        from: ["/community-records/directory/coordinator"],
                        cue: "Follow the findings submission link."
                    }
                }
            ]
        }],
        terminal: {
            siteId: "community-records",
            routePath: "/submit",
            mode: "static-preview"
        }
    };
}

function bundleWithSupportingItems(count = 10): LevelBundle {
    const bundle = validBundle();
    for (let index = 1; index <= count; index += 1) {
        bundle.sites[0].routes.push({
            path: `/updates/item-${index}`,
            role: "supporting",
            content: page(`Community update ${index}`),
            discovery: fromRecordsHome(`Open community update ${index}.`)
        });
    }
    return bundle;
}

const world: GameWorld = {
    schemaVersion: "1.0.0",
    id: levelFixture.world.id,
    revision: levelFixture.world.revision,
    entities: [{
        id: "site:community-notices",
        type: "site",
        name: "Community Notices"
    }],
    facts: []
};

function generatedPuzzle(node: PuzzleNode) {
    const spec = structuredClone(node.design.generationSpec);
    if (node.design.subtype === "html-comment") {
        return createHtmlCommentPuzzle(spec as unknown as Parameters<typeof createHtmlCommentPuzzle>[0]);
    }
    if (node.design.subtype === "alt-text") {
        spec.altText = "Volunteers gathered at the North River boardwalk on APRIL 18 2026, standing beside filled cleanup bags.";
        spec.imageElements = [
            "rect|0|0|420|180|#b9d4df|none|0|1|0|0",
            "rect|0|115|420|65|#78966f|none|0|1|0|0",
            "circle|150|78|18|#c89f82|none|0|1",
            "circle|250|82|18|#c89f82|none|0|1",
            "rect|125|96|50|60|#66869a|none|0|1|8|8",
            "rect|225|100|50|56|#8c7568|none|0|1|8|8"
        ];
        return createAltTextPuzzle(spec as unknown as Parameters<typeof createAltTextPuzzle>[0]);
    }
    if (node.design.subtype === "page-version") {
        spec.baselineBody = "The archived notice lists routine volunteer instructions.";
        spec.currentBody = "The current notice lists routine volunteer instructions.";
        spec.changeKind = "added-section";
        return createPageVersionPuzzle(spec as unknown as Parameters<typeof createPageVersionPuzzle>[0]);
    }
    if (node.design.subtype === "html-source-inspection") {
        return createSourceCodePuzzle(spec as unknown as Parameters<typeof createSourceCodePuzzle>[0]);
    }
    throw new Error(`Unsupported test subtype ${node.design.subtype}.`);
}

async function writeInputs(root: string, puzzleIds = levelFixture.puzzles.map((puzzle) => puzzle.id)) {
    const levelFile = path.join(root, "level.json");
    const worldDirectory = path.join(root, "worlds");
    const puzzleDirectory = path.join(root, "generated-puzzles");
    await mkdir(worldDirectory, { recursive: true });
    await writeFile(levelFile, JSON.stringify(levelFixture), "utf8");
    await writeFile(
        path.join(worldDirectory, `${world.id}.world.json`),
        JSON.stringify(world),
        "utf8"
    );
    for (const node of levelFixture.puzzles.filter((puzzle) => puzzleIds.includes(puzzle.id))) {
        await writeGeneratedPuzzle(levelFixture.id, generatedPuzzle(node), puzzleDirectory);
    }
    return { levelFile, worldDirectory, puzzleDirectory };
}

describe("level bundle contracts", () => {
    it("gives every puzzle subtype a bundle placement capability", () => {
        for (const entry of repositoryPuzzleCatalog.entries) {
            expect(entry.bundle.placements.length, entry.subtype).toBeGreaterThan(0);
        }
        expect(repositoryPuzzleCatalog.entries.find((entry) => entry.subtype === "html-comment")?.bundle)
            .toEqual({ placements: ["native-html"], integrity: "html-source" });
        expect(repositoryPuzzleCatalog.entries.find((entry) => entry.subtype === "steganography")?.bundle)
            .toEqual({ placements: ["media-viewer", "downloadable-file"], integrity: "exact-file" });
    });

    it("accepts one compatible placement for every puzzle and one terminal route", () => {
        const bundle = validBundle();
        expect(validateLevelBundle(bundle, levelFixture, repositoryPuzzleCatalog)).toEqual([]);
        expect(() => assertLevelBundle(bundle, levelFixture, repositoryPuzzleCatalog)).not.toThrow();
    });

    it("accepts structured content, world additions, and world-grounded media", () => {
        const bundle = validBundle();
        bundle.worldAdditions.entities.push({
            id: "organization:records-office",
            type: "organization",
            name: "Community Records Office"
        });
        bundle.worldAdditions.facts.push({
            id: "fact:records-office-runs-notices",
            subjectId: "organization:records-office",
            relation: "operates",
            value: { kind: "entity", entityId: "site:community-notices" }
        });
        bundle.mediaRequests[0].worldEntityIds = ["organization:records-office"];
        bundle.sites[0].routes[0].content.blocks.push({
            kind: "table",
            heading: "Opening hours",
            columns: ["Day", "Hours"],
            rows: [["Monday", "9:00–17:00"]]
        });

        expect(validateLevelBundle(bundle, levelFixture, repositoryPuzzleCatalog, world)).toEqual([]);
    });

    it("rejects invalid world additions, media references, and structured tables", () => {
        const bundle = validBundle();
        bundle.worldAdditions.entities.push({
            id: "site:community-notices",
            type: "site",
            name: "Duplicate Notices"
        });
        bundle.mediaRequests[0].worldEntityIds = ["place:missing"];
        bundle.sites[0].routes[0].content.blocks.push({
            kind: "table",
            columns: ["Item", "Status"],
            rows: [["Only one cell"]]
        });

        expect(validateLevelBundle(bundle, levelFixture, repositoryPuzzleCatalog, world)).toEqual(expect.arrayContaining([
            "Proposed world entity site:community-notices already exists.",
            "Supporting-media request records-header references missing world entity place:missing.",
            "Table row 1 on /community-records has 1 cells; expected 2."
        ]));
    });

    it("upgrades saved version-1 bundle plans when they are read", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "legacy-level-bundle-"));
        try {
            const current = validBundle();
            const legacy = {
                ...current,
                schemaVersion: "1.0.0",
                worldAdditions: undefined,
                mediaRequests: undefined,
                sites: current.sites.map(({ visualProfile: _profile, ...site }) => ({
                    ...site,
                    routes: site.routes.map((route) => ({
                        ...route,
                        content: {
                            title: route.content.title,
                            description: route.content.description,
                            body: route.content.blocks.flatMap((block) =>
                                block.kind === "prose" ? block.paragraphs : []
                            )
                        }
                    }))
                }))
            };
            const filePath = path.join(root, "legacy.bundle.json");
            await writeFile(filePath, JSON.stringify(legacy), "utf8");

            const upgraded = await readLevelBundleFile({
                filePath,
                level: levelFixture,
                catalog: repositoryPuzzleCatalog,
                world
            });
            expect(upgraded.schemaVersion).toBe(LEVEL_BUNDLE_SCHEMA_VERSION);
            expect(upgraded.worldAdditions).toEqual({ entities: [], facts: [] });
            expect(upgraded.sites[0].visualProfile.mediaStyle).toBeTruthy();
            expect(upgraded.sites[0].routes[0].content.blocks[0].kind).toBe("prose");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("rejects unsafe, duplicate, missing, and incompatible placements", () => {
        const bundle = validBundle();
        const routes = bundle.sites[0].routes;
        const firstPuzzle = routes.find((route) => route.role === "puzzle");
        if (firstPuzzle === undefined) throw new Error("Missing test puzzle route.");
        firstPuzzle.path = "/../escape";
        firstPuzzle.placement = "media-viewer";
        routes.push({
            path: "/duplicate",
            role: "puzzle",
            content: page("Duplicate"),
            puzzleId: "find-project-name",
            placement: "native-html",
            discovery: fromRecordsHome("Open the duplicate record.")
        });
        const versionIndex = routes.findIndex((route) => route.role === "puzzle" && route.puzzleId === "find-meeting-place");
        routes.splice(versionIndex, 1);

        expect(validateLevelBundle(bundle, levelFixture, repositoryPuzzleCatalog)).toEqual(expect.arrayContaining([
            "Bundled site community-records has unsafe route path /../escape.",
            "Puzzle find-project-name cannot use media-viewer; allowed placements are native-html.",
            "Puzzle find-project-name is placed more than once.",
            "Puzzle find-meeting-place is not placed in the bundle."
        ]));
    });
});

describe("level bundle preflight", () => {
    it("loads and verifies the level, world projection, private records, and artifact files", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-bundle-"));
        try {
            const files = await writeInputs(root);
            const inputs = await loadLevelBundleInputs({
                ...files,
                generatedPuzzleDirectory: files.puzzleDirectory,
                catalog: repositoryPuzzleCatalog
            });

            expect(inputs.level.id).toBe(levelFixture.id);
            expect(inputs.context.entities).toEqual(world.entities);
            expect(inputs.puzzles.map((item) => item.puzzle.id)).toEqual(
                levelFixture.puzzles.map((puzzle) => puzzle.id)
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("reports every missing generated puzzle in one actionable error", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-bundle-missing-"));
        try {
            const files = await writeInputs(root, ["find-project-name"]);
            const promise = loadLevelBundleInputs({
                ...files,
                generatedPuzzleDirectory: files.puzzleDirectory,
                catalog: repositoryPuzzleCatalog
            });
            await expect(promise).rejects.toBeInstanceOf(LevelBundlePreflightError);
            await expect(promise).rejects.toMatchObject({
                issues: expect.arrayContaining([
                    expect.stringContaining("Puzzle find-event-date metadata is unavailable"),
                    expect.stringContaining("Puzzle find-meeting-place metadata is unavailable"),
                    expect.stringContaining("Puzzle identify-coordinator metadata is unavailable")
                ])
            });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("rejects an artifact file that no longer matches its private puzzle record", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-bundle-mismatch-"));
        try {
            const files = await writeInputs(root);
            const artifactFile = path.join(
                files.puzzleDirectory,
                levelFixture.id,
                "find-project-name",
                "index.html"
            );
            await writeFile(artifactFile, `${await readFile(artifactFile, "utf8")}\n<!-- changed -->`, "utf8");

            await expect(loadLevelBundleInputs({
                ...files,
                generatedPuzzleDirectory: files.puzzleDirectory,
                catalog: repositoryPuzzleCatalog
            })).rejects.toMatchObject({
                issues: [expect.stringContaining(
                    "Puzzle find-project-name artifact file /index.html differs from its private record."
                )]
            });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe("level bundle agent boundary", () => {
    it("builds a bounded prompt without embedding generated binary data", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-bundle-prompt-"));
        try {
            const files = await writeInputs(root);
            const inputs = await loadLevelBundleInputs({
                ...files,
                generatedPuzzleDirectory: files.puzzleDirectory,
                catalog: repositoryPuzzleCatalog
            });
            const prompt = buildLevelBundlePrompt(inputs, repositoryPuzzleCatalog, {
                seed: "test-seed",
                supportingItemsMinimum: 10,
                supportingItemsMaximum: 15
            });

            expect(prompt).toContain("between 10 and 15 routes");
            expect(prompt).toContain("across the entire bundle");
            expect(prompt).toContain("never create routes for artifact filenames");
            expect(prompt).toContain("No site may contain more than 23 total routes");
            expect(prompt).toContain("submit_bundle_structure");
            expect(prompt).toContain("add_bundle_routes");
            expect(prompt).toContain("add_supporting_routes");
            expect(prompt).toContain("add_supporting_media_requests");
            expect(prompt).toContain("finalize_level_bundle");
            expect(prompt).toContain("first site's \"/\" home route");
            expect(prompt).toContain("find-project-name");
            expect(prompt).not.toContain('"data": "iVBOR');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("injects system-owned fields and saves a validated agent submission", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-bundle-tool-"));
        try {
            const files = await writeInputs(root);
            const inputs = await loadLevelBundleInputs({
                ...files,
                generatedPuzzleDirectory: files.puzzleDirectory,
                catalog: repositoryPuzzleCatalog
            });
            const complete = bundleWithSupportingItems();
            complete.sites.push({
                id: "community-archive",
                name: "Community Archive",
                archetype: "records",
                visualProfile,
                basePath: "/community-archive",
                routes: [{
                    path: "/",
                    role: "structural",
                    content: {
                        ...page("Archive home"),
                        blocks: [
                            ...page("Archive home").blocks,
                            { kind: "media", mediaId: "archive-header", caption: "Archive reading room" }
                        ]
                    }
                }]
            });
            complete.mediaRequests.push({
                id: "archive-header",
                siteId: "community-archive",
                routePath: "/",
                kind: "raster-image",
                purpose: "Establish the community archive",
                brief: "A documentary photograph of a small public archive reading room",
                accessibilityText: "Community archive reading room",
                worldEntityIds: ["site:community-notices"]
            });
            const { schemaVersion: _schema, levelId: _level, world: _world, seed: _seed, terminal, ...agentFields } = complete;
            const { mode: _mode, ...agentTerminal } = terminal;
            const tool = createSubmitLevelBundleTool(inputs, repositoryPuzzleCatalog, {
                seed: "tool-seed",
                supportingItemsMinimum: 10,
                supportingItemsMaximum: 15
            }, path.join(root, "bundles"));
            const parameters = tool.parameters as unknown as {
                properties: {
                    bundle: {
                        properties: {
                            sites: {
                                items: { properties: { routes: { maxItems: number } } };
                            };
                        };
                    };
                };
            };

            const result = await tool.execute("tool-call", {
                bundle: { ...agentFields, terminal: agentTerminal }
            });

            expect(result.details.bundle.schemaVersion).toBe(LEVEL_BUNDLE_SCHEMA_VERSION);
            expect(result.details.bundle.levelId).toBe(levelFixture.id);
            expect(result.details.bundle.seed).toBe("tool-seed");
            expect(result.details.bundle.terminal.mode).toBe("validation-api");
            expect(parameters.properties.bundle.properties.sites.items.properties.routes.maxItems).toBe(23);
            await expect(readFile(result.details.outputPath, "utf8")).resolves.toContain('"seed": "tool-seed"');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("rejects too little supporting content before writing a plan", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-bundle-depth-"));
        try {
            const files = await writeInputs(root);
            const inputs = await loadLevelBundleInputs({
                ...files,
                generatedPuzzleDirectory: files.puzzleDirectory,
                catalog: repositoryPuzzleCatalog
            });
            const complete = validBundle();
            const { schemaVersion: _schema, levelId: _level, world: _world, seed: _seed, terminal, ...agentFields } = complete;
            const { mode: _mode, ...agentTerminal } = terminal;
            const tool = createSubmitLevelBundleTool(inputs, repositoryPuzzleCatalog, {
                seed: "tool-seed",
                supportingItemsMinimum: 10,
                supportingItemsMaximum: 15
            });

            await expect(tool.execute("tool-call", {
                bundle: { ...agentFields, terminal: agentTerminal }
            })).rejects.toThrow("must contain 10-15 supporting routes in total; found 0");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("stops repeated output-limit submissions with a specific error", async () => {
        const holder: {
            afterToolCall?: Parameters<typeof stopAfterRepeatedTruncatedBundleSubmissions>[0]["afterToolCall"];
        } = {};
        stopAfterRepeatedTruncatedBundleSubmissions(holder);
        const context = {
            toolCall: { name: "submit_bundle_structure" },
            isError: true,
            result: {
                content: [{
                    type: "text",
                    text: "Tool call was not executed: the response hit the output token limit."
                }],
                details: {}
            }
        } as unknown as Parameters<NonNullable<typeof holder.afterToolCall>>[0];

        await expect(holder.afterToolCall?.(context)).resolves.toBeUndefined();
        await expect(holder.afterToolCall?.(context)).resolves.toMatchObject({
            isError: true,
            terminate: true,
            content: [{
                type: "text",
                text: expect.stringContaining("stopped after 2 truncated tool calls")
            }]
        });
    });

    it("scales supporting-page depth with puzzle count while preserving small-level floors", () => {
        const range = (puzzleCount: number) => scaledSupportingItemRange({
            puzzleCount,
            minimumFloor: 10,
            maximumFloor: 15,
            minimumPerPuzzle: 2,
            maximumPerPuzzle: 3
        });

        expect(range(2)).toEqual({ minimum: 10, maximum: 15 });
        expect(range(10)).toEqual({ minimum: 20, maximum: 30 });
        expect(range(50)).toEqual({ minimum: 100, maximum: 150 });
    });

    it("assembles a complete bundle from structure and supporting-page batches", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-bundle-staged-"));
        try {
            const files = await writeInputs(root);
            const inputs = await loadLevelBundleInputs({
                ...files,
                generatedPuzzleDirectory: files.puzzleDirectory,
                catalog: repositoryPuzzleCatalog
            });
            const complete = bundleWithSupportingItems();
            const structure = {
                sites: complete.sites.map((site) => ({
                    id: site.id,
                    name: site.name,
                    ...(site.worldEntityId === undefined ? {} : { worldEntityId: site.worldEntityId }),
                    archetype: site.archetype,
                    visualProfile: site.visualProfile,
                    basePath: site.basePath
                })),
                worldAdditions: complete.worldAdditions,
                terminal: {
                    siteId: complete.terminal.siteId,
                    routePath: `${complete.sites[0].basePath}${complete.terminal.routePath}`
                }
            };
            const supporting = complete.sites[0].routes.filter(
                (route): route is Extract<LevelBundle["sites"][number]["routes"][number], { role: "supporting" }> =>
                    route.role === "supporting"
            );
            const withFullPath = <T extends { path: string }>(route: T): T => ({
                ...route,
                path: route.path === "/"
                    ? complete.sites[0].basePath
                    : `${complete.sites[0].basePath}${route.path}`
            });
            const required = complete.sites[0].routes
                .filter((route) => route.role !== "supporting")
                .map(withFullPath)
                .map((route) => route.role === "puzzle"
                    ? { ...route, directAssetPath: `${complete.sites[0].basePath}${route.path}` }
                    : route);
            const fullSupporting = supporting.map(withFullPath);
            const tools = createStagedLevelBundleTools(inputs, repositoryPuzzleCatalog, {
                seed: "staged-seed",
                supportingItemsMinimum: 10,
                supportingItemsMaximum: 15
            }, path.join(root, "bundles"));
            const structureTool = tools.find((tool) => tool.name === "submit_bundle_structure");
            const routeTool = tools.find((tool) => tool.name === "add_bundle_routes");
            const supportingTool = tools.find((tool) => tool.name === "add_supporting_routes");
            const replaceTool = tools.find((tool) => tool.name === "replace_bundle_route");
            const mediaTool = tools.find((tool) => tool.name === "add_supporting_media_requests");
            const replaceMediaTool = tools.find((tool) => tool.name === "replace_supporting_media_request");
            const finalizeTool = tools.find((tool) => tool.name === "finalize_level_bundle");
            if (structureTool === undefined || routeTool === undefined
                || supportingTool === undefined || replaceTool === undefined
                || mediaTool === undefined || replaceMediaTool === undefined
                || finalizeTool === undefined) {
                throw new Error("Expected all staged level-bundle tools.");
            }

            await structureTool.execute("structure", structure);
            await routeTool.execute("routes-1", {
                siteId: complete.sites[0].id,
                routes: required.slice(0, 5)
            });
            await routeTool.execute("routes-2", {
                siteId: complete.sites[0].id,
                routes: required.slice(5)
            });
            await supportingTool.execute("support-1", {
                siteId: complete.sites[0].id,
                routes: fullSupporting.slice(0, 5)
            });
            await supportingTool.execute("support-2", {
                siteId: complete.sites[0].id,
                routes: fullSupporting.slice(5)
            });
            const replacement = structuredClone(required[0]);
            replacement.content.title = "Corrected home page";
            await replaceTool.execute("replace", {
                siteId: complete.sites[0].id,
                route: replacement
            });
            await mediaTool.execute("media", { requests: complete.mediaRequests });
            await replaceMediaTool.execute("replace-media", {
                request: {
                    ...complete.mediaRequests[0],
                    routePath: complete.sites[0].basePath,
                    purpose: "Corrected records-office establishing image"
                }
            });
            const result = await finalizeTool.execute("finalize", {});

            const assembled = (result.details as { bundle: LevelBundle }).bundle;
            expect(assembled.sites[0].routes).toHaveLength(complete.sites[0].routes.length);
            expect(assembled.sites[0].routes[0].path).toBe("/");
            expect(assembled.sites[0].routes[0].content.title).toBe("Corrected home page");
            expect(assembled.mediaRequests[0].purpose)
                .toBe("Corrected records-office establishing image");
            expect(assembled.terminal.routePath).toBe(complete.terminal.routePath);
            expect(assembled.sites[0].routes
                .filter((route) => route.role === "puzzle")
                .every((route) => route.directAssetPath === undefined)).toBe(true);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
