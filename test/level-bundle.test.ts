import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createAltTextPuzzle } from "../src/agents/alt-text/engine.js";
import { createHtmlCommentPuzzle } from "../src/agents/html-comment/engine.js";
import { createSourceCodePuzzle } from "../src/agents/html-source-inspection/engine.js";
import { createPageVersionPuzzle } from "../src/agents/page-version/engine.js";
import { buildLevelBundlePrompt } from "../src/agents/level-bundle/prompt.js";
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
import { repositoryPuzzleCatalog } from "../src/levels/catalog.js";
import { writeGeneratedPuzzle } from "../src/levels/puzzle-generation.js";
import type { PuzzleNode } from "../src/levels/types.js";
import type { GameWorld } from "../src/world/types.js";
import { levelFixture } from "./fixtures/level-v5.js";

const page = (title: string) => ({
    title,
    description: `${title} page`,
    body: [`Public information for ${title}.`]
});

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
        sites: [{
            id: "community-records",
            name: "Community Records",
            worldEntityId: "site:community-notices",
            archetype: "records",
            basePath: "/community-records",
            routes: [
                { path: "/", role: "structural", content: page("Records home") },
                {
                    path: "/notices/cleanup",
                    role: "puzzle",
                    content: page("Cleanup notice"),
                    puzzleId: "find-project-name",
                    placement: "native-html",
                    discovery: fromRecordsHome("Open the cleanup notice from recent records.")
                },
                {
                    path: "/photos/community-event",
                    role: "puzzle",
                    content: page("Community event photo"),
                    puzzleId: "find-event-date",
                    placement: "native-html",
                    discovery: fromRecordsHome("Open the community event photo archive.")
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
            const { schemaVersion: _schema, levelId: _level, world: _world, seed: _seed, terminal, ...agentFields } = complete;
            const { mode: _mode, ...agentTerminal } = terminal;
            const tool = createSubmitLevelBundleTool(inputs, repositoryPuzzleCatalog, {
                seed: "tool-seed",
                supportingItemsMinimum: 10,
                supportingItemsMaximum: 15
            }, path.join(root, "bundles"));

            const result = await tool.execute("tool-call", {
                bundle: { ...agentFields, terminal: agentTerminal }
            });

            expect(result.details.bundle.schemaVersion).toBe(LEVEL_BUNDLE_SCHEMA_VERSION);
            expect(result.details.bundle.levelId).toBe(levelFixture.id);
            expect(result.details.bundle.seed).toBe("tool-seed");
            expect(result.details.bundle.terminal.mode).toBe("validation-api");
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
            })).rejects.toThrow("must contain 10-15 supporting routes; found 0");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
