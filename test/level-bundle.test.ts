import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createAltTextPuzzle } from "../src/features/puzzle-generation/generators/alt-text/engine.js";
import { createHtmlCommentPuzzle } from "../src/features/puzzle-generation/generators/html-comment/engine.js";
import { createSourceCodePuzzle } from "../src/features/puzzle-generation/generators/html-source-inspection/engine.js";
import { createPageVersionPuzzle } from "../src/features/puzzle-generation/generators/page-version/engine.js";
import { buildLevelBundlePrompt } from "../src/features/level-bundle/agent/prompt.js";
import { stopAfterRepeatedTruncatedBundleSubmissions } from "../src/features/level-bundle/agent/agent.js";
import {
    levelBundleCoreRouteMaximum,
    levelBundleRouteMaximum,
    scaledSupportingItemRange
} from "../src/features/level-bundle/limits.js";
import { createStagedLevelBundleTools } from "../src/features/level-bundle/agent/staged-tool.js";
import { createSubmitLevelBundleTool } from "../src/features/level-bundle/agent/tool.js";
import {
    assertLevelBundle,
    canonicalBundlePagePath,
    LEVEL_BUNDLE_SCHEMA_VERSION,
    type LevelBundle,
    validateLevelBundle
} from "../src/features/level-bundle/types.js";
import {
    LevelBundlePreflightError,
    loadLevelBundleInputs
} from "../src/features/level-bundle/inputs.js";
import { readLevelBundleFile } from "../src/features/level-bundle/io.js";
import { repositoryPuzzleCatalog } from "../src/features/puzzle-generation/catalog.js";
import { writeGeneratedPuzzle } from "../src/features/puzzle-generation/generate.js";
import type { PuzzleNode } from "../src/features/level-design/types.js";
import type { GameWorld } from "../src/features/world/types.js";
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
                    content: {
                        ...page("Coordinator profile"),
                        blocks: [
                            ...page("Coordinator profile").blocks,
                            {
                                kind: "cards",
                                items: [{
                                    title: "Submit findings",
                                    summary: "Open the findings submission form.",
                                    href: "/community-records/submit"
                                }]
                            }
                        ]
                    },
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
                        discovery: route.discovery?.kind === "direct-link"
                            ? { ...route.discovery, kind: "stable-path" as const }
                            : route.discovery,
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

    it("reserves the public root and rejects card links to undeclared routes", () => {
        const bundle = validBundle();
        bundle.sites[0].basePath = "/";
        const home = bundle.sites[0].routes.find((route) => route.path === "/");
        if (home === undefined) throw new Error("Missing home route fixture.");
        home.content.blocks.push({
            kind: "cards",
            items: [{
                title: "Missing service",
                summary: "This card points to a route that was not submitted.",
                href: "/services/missing"
            }]
        });

        expect(validateLevelBundle(bundle, levelFixture, repositoryPuzzleCatalog)).toEqual(
            expect.arrayContaining([
                "Bundled site community-records cannot use base path /; the public root is reserved for the level entry page.",
                "Card on / links to missing route /services/missing."
            ])
        );
    });

    it("requires a homepage for each site's persistent navigation", () => {
        const bundle = validBundle();
        bundle.sites.push({
            ...bundle.sites[0],
            id: "contract-registry",
            basePath: "/contracts",
            routes: [{ role: "structural", path: "/search", content: page("Contract search"),
                discovery: { kind: "navigation", from: ["/community-records"], cue: "Open contract search." } }]
        });
        expect(validateLevelBundle(bundle, levelFixture, repositoryPuzzleCatalog)).toContain(
            'Bundled site contract-registry must declare a homepage route with path "/" because its site navigation links to /contracts.'
        );
    });

    it("requires direct-link discovery to have a matching clickable card", () => {
        const bundle = validBundle();
        const source = bundle.sites[0].routes.find((route) => route.path === "/directory/coordinator");
        if (source === undefined) throw new Error("Missing coordinator route fixture.");
        source.content.blocks = source.content.blocks.filter((block) => block.kind !== "cards");

        expect(validateLevelBundle(bundle, levelFixture, repositoryPuzzleCatalog)).toContain(
            "Direct-link discovery from /community-records/directory/coordinator to "
            + "/community-records/submit requires a cards item on "
            + "/community-records/directory/coordinator whose href is exactly /community-records/submit."
        );
    });

    it("canonicalizes a single trailing slash without repairing unsafe paths", () => {
        expect(canonicalBundlePagePath("/permits/")).toBe("/permits");
        expect(canonicalBundlePagePath("/")).toBe("/");
        for (const invalid of ["//permits/", "/permits//", "/permits/../", "/permits/%2e%2e/", "/permits?foo/"]) {
            expect(canonicalBundlePagePath(invalid)).toBe(invalid);
        }
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

            expect(prompt).toContain("Around 10 supporting routes is a planning target");
            expect(prompt).toContain("across the entire bundle");
            expect(prompt).toContain("never create routes for artifact filenames");
            expect(prompt).toContain("visible title and body");
            expect(prompt).toContain("No site may contain more than 24 total routes");
            expect(prompt).toContain("submit_bundle_structure");
            expect(prompt).toContain("add_bundle_routes");
            expect(prompt).toContain("add_supporting_routes");
            expect(prompt).toContain("add_supporting_media_requests");
            expect(prompt).toContain("replace_bundle_site");
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
            expect(parameters.properties.bundle.properties.sites.items.properties.routes.maxItems).toBe(24);
            await expect(readFile(result.details.outputPath, "utf8")).resolves.toContain('"seed": "tool-seed"');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("saves a scoped plan without imposing editorial page or media quotas", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-bundle-depth-"));
        try {
            const files = await writeInputs(root);
            const inputs = await loadLevelBundleInputs({
                ...files,
                generatedPuzzleDirectory: files.puzzleDirectory,
                catalog: repositoryPuzzleCatalog
            });
            const complete = validBundle();
            complete.mediaRequests = [];
            const home = complete.sites[0].routes[0];
            home.content.blocks = home.content.blocks.filter((block) => block.kind !== "media");
            home.content.blocks.push({
                kind: "cards", heading: "Selected records", collection: "records",
                items: [{ title: "Cleanup notice", summary: "A record selected for this collection.", href: "/community-records/notices/cleanup" }]
            });
            const { schemaVersion: _schema, levelId: _level, world: _world, seed: _seed, terminal, ...agentFields } = complete;
            const { mode: _mode, ...agentTerminal } = terminal;
            const tool = createSubmitLevelBundleTool(inputs, repositoryPuzzleCatalog, {
                seed: "tool-seed",
                supportingItemsMinimum: 10,
                supportingItemsMaximum: 15
            }, path.join(root, "bundles"));

            await expect(tool.execute("tool-call", {
                bundle: { ...agentFields, terminal: agentTerminal }
            })).resolves.toMatchObject({ details: { bundle: { mediaRequests: [] } } });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("rejects a puzzle answer used as a site-wide display name", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-bundle-site-leak-"));
        try {
            const files = await writeInputs(root);
            const inputs = await loadLevelBundleInputs({
                ...files,
                generatedPuzzleDirectory: files.puzzleDirectory,
                catalog: repositoryPuzzleCatalog
            });
            const complete = bundleWithSupportingItems();
            complete.sites[0].name = "RIVER CLEANUP";
            const { schemaVersion: _schema, levelId: _level, world: _world, seed: _seed, terminal, ...agentFields } = complete;
            const { mode: _mode, ...agentTerminal } = terminal;
            const tool = createSubmitLevelBundleTool(inputs, repositoryPuzzleCatalog, {
                seed: "tool-seed",
                supportingItemsMinimum: 10,
                supportingItemsMaximum: 15
            });

            await expect(tool.execute("tool-call", {
                bundle: { ...agentFields, terminal: agentTerminal }
            })).rejects.toThrow(
                "Bundled site community-records name leaks a puzzle answer in site-wide public chrome"
            );
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

    it("includes the mandatory terminal route in core and total route limits", () => {
        expect(levelBundleCoreRouteMaximum(4)).toBe(9);
        expect(levelBundleRouteMaximum(4, 15)).toBe(24);
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
                    basePath: `${site.basePath}/`
                })),
                worldAdditions: complete.worldAdditions,
                terminal: {
                    siteId: complete.terminal.siteId,
                    routePath: `${complete.sites[0].basePath}${complete.terminal.routePath}/`
                }
            };
            const supporting = complete.sites[0].routes.filter(
                (route): route is Extract<LevelBundle["sites"][number]["routes"][number], { role: "supporting" }> =>
                    route.role === "supporting"
            );
            const withFullPath = <T extends { path: string }>(route: T): T => ({
                ...route,
                path: route.path === "/"
                    ? `${complete.sites[0].basePath}/`
                    : `${complete.sites[0].basePath}${route.path}/`
            });
            const required = complete.sites[0].routes
                .filter((route) => route.role !== "supporting")
                .map(withFullPath)
                .map((route) => route.role === "puzzle"
                    ? { ...route, directAssetPath: `${complete.sites[0].basePath}${route.path}` }
                    : route);
            for (let index = 1; index <= 3; index += 1) {
                required.push({
                    role: "structural",
                    path: `${complete.sites[0].basePath}/research/tool-${index}`,
                    content: page(`Research tool ${index}`),
                    discovery: fromRecordsHome(`Open research tool ${index}.`)
                });
            }
            const fullSupporting = supporting.map(withFullPath);
            const tools = createStagedLevelBundleTools(inputs, repositoryPuzzleCatalog, {
                seed: "staged-seed",
                supportingItemsMinimum: 10,
                supportingItemsMaximum: 15
            }, path.join(root, "bundles"));
            const structureTool = tools.find((tool) => tool.name === "submit_bundle_structure");
            const routeTool = tools.find((tool) => tool.name === "add_bundle_routes");
            const supportingTool = tools.find((tool) => tool.name === "add_supporting_routes");
            const replaceSiteTool = tools.find((tool) => tool.name === "replace_bundle_site");
            const replaceTool = tools.find((tool) => tool.name === "replace_bundle_route");
            const mediaTool = tools.find((tool) => tool.name === "add_supporting_media_requests");
            const replaceMediaTool = tools.find((tool) => tool.name === "replace_supporting_media_request");
            const finalizeTool = tools.find((tool) => tool.name === "finalize_level_bundle");
            if (structureTool === undefined || routeTool === undefined
                || supportingTool === undefined || replaceSiteTool === undefined || replaceTool === undefined
                || mediaTool === undefined || replaceMediaTool === undefined
                || finalizeTool === undefined) {
                throw new Error("Expected all staged level-bundle tools.");
            }

            await expect(structureTool.execute("root-structure", {
                ...structure,
                sites: structure.sites.map((site, index) => index === 0
                    ? { ...site, basePath: "/" }
                    : site)
            })).rejects.toThrow("public root is reserved for the level entry page");
            await structureTool.execute("structure", structure);
            await replaceSiteTool.execute("replace-site", {
                site: { ...structure.sites[0], name: "Riverside Public Records" }
            });
            const leak = structuredClone(required[0]);
            leak.content.blocks = [
                { kind: "table", columns: ["Project"], rows: [["RIVER CLEANUP"]] },
                { kind: "cards", items: [{ title: "Open record", summary: "View details.", href: "/records/RIVER CLEANUP" }] }
            ];
            const rejected = routeTool.execute("spoiler-batch", {
                siteId: complete.sites[0].id,
                routes: [...required.slice(1, 3), leak]
            });
            await expect(rejected).rejects.toThrow("content.blocks[0].rows[0][0] contains");
            await expect(rejected).rejects.toThrow('content.blocks[1].items[0].href contains "RIVER CLEANUP" (answer to find-project-name)');
            const lookup = structuredClone(required.find((route) =>
                route.role === "puzzle" && route.puzzleId === "find-meeting-place")!);
            if (lookup.role !== "puzzle") throw new Error("Expected a meeting history puzzle.");
            const meeting = inputs.level.puzzles.find((puzzle) => puzzle.id === lookup.puzzleId)!;
            const clueInput = meeting.design.inputs.find((input) => input.source.kind === "puzzle-output")!;
            if (clueInput.source.kind !== "puzzle-output") throw new Error("Expected a clue from a puzzle output.");
            lookup.discovery = {
                kind: "lookup", from: [complete.sites[0].basePath], cue: "Enter the reference.",
                queryInputId: clueInput.source.outputId
            };
            inputs.level.investigationQuestion = "Where did the organizers meet?";
            await expect(routeTool.execute("wrong-lookup-id", {
                siteId: complete.sites[0].id, routes: [lookup]
            })).rejects.toThrow(`Use a destination puzzle input ID from "${clueInput.id}"`);
            delete inputs.level.investigationQuestion;
            await routeTool.execute("routes-1", {
                siteId: complete.sites[0].id,
                routes: required.slice(0, 5)
            });
            await routeTool.execute("routes-2", {
                siteId: complete.sites[0].id,
                routes: required.slice(5)
            });
            clueInput.access = { kind: "lookup", fieldLabel: "Meeting reference" };
            await expect(replaceTool.execute("wrong-replacement", {
                siteId: complete.sites[0].id, route: lookup
            })).rejects.toThrow(`Use discovery.kind "lookup" and queryInputId "${clueInput.id}"`);
            await expect(replaceTool.execute("wrong-access-mode", {
                siteId: complete.sites[0].id,
                route: { ...lookup, discovery: fromRecordsHome("Open the meeting notice.") }
            })).rejects.toThrow('requires an on-site lookup labeled "Meeting reference"');
            delete clueInput.access;

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
            const direct = required.find((route) => route.role === "terminal")!;
            const sourcePath = direct.discovery!.from[0];
            const source = structuredClone(required.find((route) => route.path === `${sourcePath}/`)!);
            for (const block of source.content.blocks) {
                if (block.kind === "cards") {
                    for (const item of block.items) if (item.href) item.href += "/";
                }
            }
            await replaceTool.execute("slash-card", { siteId: complete.sites[0].id, route: source });
            await replaceTool.execute("slash-discovery", {
                siteId: complete.sites[0].id,
                route: { ...direct, discovery: { ...direct.discovery!, from: [`${sourcePath}/`] } }
            });
            await mediaTool.execute("media", { requests: complete.mediaRequests });
            await replaceMediaTool.execute("replace-media", {
                request: {
                    ...complete.mediaRequests[0],
                    routePath: `${complete.sites[0].basePath}/`,
                    purpose: "Corrected records-office establishing image"
                }
            });
            const result = await finalizeTool.execute("finalize", {});

            const assembled = (result.details as { bundle: LevelBundle }).bundle;
            expect(assembled.sites[0].name).toBe("Riverside Public Records");
            expect(assembled.sites[0].routes).toHaveLength(complete.sites[0].routes.length + 3);
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
