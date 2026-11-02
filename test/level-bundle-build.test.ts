import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createHtmlCommentPuzzle } from "../src/agents/html-comment/engine.js";
import { createPageVersionPuzzle } from "../src/agents/page-version/engine.js";
import { createQrCodePuzzle } from "../src/agents/qr-code/engine.js";
import type { LevelBundleInputs } from "../src/levels/bundle-inputs.js";
import { buildLevelBundle } from "../src/levels/bundle-build.js";
import { createBundlePreviewServer, validateTerminalSubmission } from "../src/levels/bundle-server.js";
import { BundleVerificationError, verifyLevelBundle } from "../src/levels/bundle-verify.js";
import { LEVEL_BUNDLE_SCHEMA_VERSION, type LevelBundle } from "../src/levels/bundle.js";
import { repositoryPuzzleCatalog } from "../src/levels/catalog.js";
import type { LevelBlueprint } from "../src/levels/types.js";
import type { GameWorld } from "../src/world/types.js";
import { levelFixture } from "./fixtures/level-v5.js";

function buildFixture(): { inputs: LevelBundleInputs; bundle: LevelBundle } {
    const node = structuredClone(levelFixture.puzzles[0]);
    const level = structuredClone(levelFixture) as LevelBlueprint;
    level.puzzles = [node];
    level.terminalAction.fields = [{
        id: "project",
        label: "Project name",
        semanticRole: node.design.outputs[0].semanticRole,
        source: { puzzleId: node.id, outputId: node.design.outputs[0].id }
    }];
    const puzzle = createHtmlCommentPuzzle(
        node.design.generationSpec as unknown as Parameters<typeof createHtmlCommentPuzzle>[0]
    );
    const world: GameWorld = {
        schemaVersion: "1.0.0",
        id: level.world.id,
        revision: level.world.revision,
        entities: [{ id: "site:community-notices", type: "site", name: "Community Notices" }],
        facts: []
    };
    const inputs: LevelBundleInputs = {
        level,
        world,
        context: {
            id: world.id,
            revision: world.revision,
            entities: world.entities,
            facts: []
        },
        worldFile: "/test/world.json",
        puzzles: [{
            puzzle,
            metadataFile: "/test/find-project-name.puzzle.json",
            artifactDirectory: "/test/find-project-name",
            artifactEntryFile: "/test/find-project-name/index.html"
        }]
    };
    const rootDiscovery = {
        kind: "navigation" as const,
        from: ["/records"],
        cue: "Open the linked public record."
    };
    const supporting = Array.from({ length: 10 }, (_, index) => ({
        path: `/news/update-${index + 1}`,
        role: "supporting" as const,
        content: {
            title: `Community update ${index + 1}`,
            description: "A routine public community update.",
            body: ["Staff shared schedules and general volunteer information with local residents."]
        },
        discovery: rootDiscovery
    }));
    const bundle: LevelBundle = {
        schemaVersion: LEVEL_BUNDLE_SCHEMA_VERSION,
        levelId: level.id,
        world: { id: level.world.id, revision: level.world.revision },
        seed: "builder-test",
        sites: [{
            id: "records",
            name: "Riverside Community Records",
            worldEntityId: "site:community-notices",
            archetype: "organization",
            basePath: "/records",
            routes: [{
                path: "/",
                role: "structural",
                content: {
                    title: "Community records",
                    description: "Public notices and community information.",
                    body: ["Browse recent notices, reports, and public updates."]
                }
            }, ...supporting, {
                path: "/notices/cleanup",
                role: "puzzle",
                content: {
                    title: "Weekend volunteer notice",
                    description: "A notice about a recent volunteer event.",
                    body: ["The archived notice is reproduced below."]
                },
                puzzleId: node.id,
                placement: "native-html",
                discovery: rootDiscovery
            }, {
                path: "/submit",
                role: "terminal",
                content: {
                    title: "Submit the record finding",
                    description: "Send the identified project name.",
                    body: ["Complete the field to finish the records request."]
                },
                discovery: {
                    kind: "direct-link",
                    from: ["/records/notices/cleanup"],
                    cue: "Follow the findings form link."
                }
            }]
        }],
        terminal: { siteId: "records", routePath: "/submit", mode: "validation-api" }
    };
    return { inputs, bundle };
}

function qrFixture(): { inputs: LevelBundleInputs; bundle: LevelBundle; svg: string } {
    const fixture = buildFixture();
    const node = fixture.inputs.level.puzzles[0];
    node.id = "scan-code";
    node.design.puzzleType = "encoding";
    node.design.subtype = "qr-code";
    node.design.generationSpec = {
        mode: "production",
        id: "scan-code",
        intendedSolution: "CASE-417",
        payloadKind: "identifier",
        documentTheme: "scanned community notice",
        moduleSize: 6
    };
    node.design.verification = { prompt: "Enter the code", dataType: "string", expectedValue: "CASE-417" };
    const puzzle = createQrCodePuzzle(node.design.generationSpec as unknown as Parameters<typeof createQrCodePuzzle>[0]);
    fixture.inputs.puzzles = [{
        puzzle,
        metadataFile: "/test/scan-code.puzzle.json",
        artifactDirectory: "/test/scan-code",
        artifactEntryFile: "/test/scan-code/puzzle.svg"
    }];
    fixture.inputs.level.terminalAction.fields[0].source.puzzleId = node.id;
    const route = fixture.bundle.sites[0].routes.find((candidate) => candidate.role === "puzzle");
    if (route?.role !== "puzzle") throw new Error("Missing puzzle route.");
    route.puzzleId = node.id;
    route.placement = "media-viewer";
    route.directAssetPath = "/assets/puzzles/scan-code.svg";
    if (puzzle.artifact.kind !== "image" || puzzle.artifact.mediaType !== "image/svg+xml") {
        throw new Error("Expected SVG QR code.");
    }
    return { ...fixture, svg: puzzle.artifact.source };
}

function versionFixture(): { inputs: LevelBundleInputs; bundle: LevelBundle; currentSource: string } {
    const fixture = buildFixture();
    const node = structuredClone(levelFixture.puzzles.find((candidate) => candidate.id === "find-meeting-place"));
    if (node === undefined) throw new Error("Missing page-version fixture.");
    node.design.generationSpec = {
        ...node.design.generationSpec,
        baselineBody: "The archived notice lists routine volunteer instructions.",
        currentBody: "The current notice lists routine volunteer instructions.",
        changeKind: "added-section"
    };
    const puzzle = createPageVersionPuzzle(
        node.design.generationSpec as unknown as Parameters<typeof createPageVersionPuzzle>[0]
    );
    fixture.inputs.level.puzzles = [node];
    fixture.inputs.level.terminalAction.fields[0].source = {
        puzzleId: node.id,
        outputId: node.design.outputs[0].id
    };
    fixture.inputs.puzzles = [{
        puzzle,
        metadataFile: "/test/find-meeting-place.puzzle.json",
        artifactDirectory: "/test/find-meeting-place",
        artifactEntryFile: "/test/find-meeting-place/index.html"
    }];
    const route = fixture.bundle.sites[0].routes.find((candidate) => candidate.role === "puzzle");
    if (route?.role !== "puzzle") throw new Error("Missing puzzle route.");
    route.puzzleId = node.id;
    route.placement = "version-set";
    delete route.directAssetPath;
    const current = puzzle.artifact.kind === "html"
        ? puzzle.artifact.files.find((file) => file.path === "/versions/current.html")
        : undefined;
    if (current === undefined) throw new Error("Missing current version file.");
    return { ...fixture, currentSource: current.source };
}

describe("level bundle builder", () => {
    it("builds a deterministic public site while keeping private mappings separate", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bundle-build-"));
        try {
            const fixture = buildFixture();
            const first = await buildLevelBundle({
                ...fixture,
                catalog: repositoryPuzzleCatalog,
                outputDirectory: root
            });
            const puzzlePage = path.join(first.publicDirectory, "records", "notices", "cleanup", "index.html");
            const terminalPage = path.join(first.publicDirectory, "records", "submit", "index.html");
            const puzzleSource = await readFile(puzzlePage, "utf8");
            const manifestSource = await readFile(first.manifestPath, "utf8");
            const reportSource = await readFile(first.reportPath, "utf8");

            expect(puzzleSource).toContain("RIVER CLEANUP");
            expect(puzzleSource).toContain("<!--");
            expect(await readFile(terminalPage, "utf8")).toContain('action="/api/validate"');
            expect(manifestSource).not.toContain("find-project-name");
            expect(manifestSource).not.toContain("RIVER CLEANUP");
            expect(reportSource).toContain("find-project-name");

            const verification = await verifyLevelBundle({
                bundle: fixture.bundle,
                inputs: fixture.inputs,
                publicDirectory: first.publicDirectory,
                privateDirectory: first.privateDirectory
            });
            expect(verification.status).toBe("passed");
            expect(verification.issues).toEqual([]);

            const second = await buildLevelBundle({
                ...fixture,
                catalog: repositoryPuzzleCatalog,
                outputDirectory: root
            });
            expect(second.manifest).toEqual(first.manifest);
            expect(await readFile(second.manifestPath, "utf8")).toBe(manifestSource);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("fails verification when a public page changes or leaks an answer", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bundle-verification-"));
        try {
            const fixture = buildFixture();
            const build = await buildLevelBundle({
                ...fixture,
                catalog: repositoryPuzzleCatalog,
                outputDirectory: root
            });
            const supportPage = path.join(
                build.publicDirectory,
                "records",
                "news",
                "update-1",
                "index.html"
            );
            await writeFile(supportPage, `${await readFile(supportPage, "utf8")} RIVER CLEANUP`, "utf8");

            const verification = verifyLevelBundle({
                bundle: fixture.bundle,
                inputs: fixture.inputs,
                publicDirectory: build.publicDirectory,
                privateDirectory: build.privateDirectory
            });
            await expect(verification).rejects.toBeInstanceOf(BundleVerificationError);
            await expect(verification).rejects.toMatchObject({
                report: {
                    status: "failed",
                    issues: expect.arrayContaining([
                        expect.objectContaining({ code: "hash-mismatch" }),
                        expect.objectContaining({ code: "answer-leak" })
                    ])
                }
            });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("publishes media at a stable direct URL without changing its source", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bundle-media-"));
        try {
            const fixture = qrFixture();
            const result = await buildLevelBundle({
                bundle: fixture.bundle,
                inputs: fixture.inputs,
                catalog: repositoryPuzzleCatalog,
                outputDirectory: root
            });
            const assetPath = path.join(result.publicDirectory, "assets", "puzzles", "scan-code.svg");
            expect(await readFile(assetPath, "utf8")).toBe(fixture.svg);
            expect(result.manifest.assets).toContainEqual(expect.objectContaining({
                path: "/assets/puzzles/scan-code.svg",
                mediaType: "image/svg+xml"
            }));
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("preserves every version file and links it from the contextual page", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bundle-versions-"));
        try {
            const fixture = versionFixture();
            const result = await buildLevelBundle({
                bundle: fixture.bundle,
                inputs: fixture.inputs,
                catalog: repositoryPuzzleCatalog,
                outputDirectory: root
            });
            const currentPath = path.join(
                result.publicDirectory,
                "records",
                "notices",
                "cleanup",
                "_artifact",
                "versions",
                "current.html"
            );
            expect(await readFile(currentPath, "utf8")).toBe(fixture.currentSource);
            const contextualPage = await readFile(
                path.join(result.publicDirectory, "records", "notices", "cleanup", "index.html"),
                "utf8"
            );
            expect(contextualPage).toContain("Available page versions");
            expect(contextualPage).toContain("_artifact/versions/current.html");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe("level bundle preview and terminal validation", () => {
    it("validates terminal fields from private level sources", () => {
        const { inputs } = buildFixture();
        expect(validateTerminalSubmission(inputs, {
            levelId: inputs.level.id,
            project: " RIVER CLEANUP "
        })).toEqual({
            status: "success",
            outcome: inputs.level.terminalAction.successOutcome
        });
        expect(validateTerminalSubmission(inputs, { project: "wrong" })).toEqual({
            status: "incorrect",
            fieldErrors: ["project"]
        });
    });

    it("creates a local server over the built public bundle", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bundle-server-"));
        const fixture = buildFixture();
        const build = await buildLevelBundle({
            ...fixture,
            catalog: repositoryPuzzleCatalog,
            outputDirectory: root
        });
        const server = createBundlePreviewServer({ publicDirectory: build.publicDirectory, inputs: fixture.inputs });
        try {
            expect(server.listening).toBe(false);
            expect(typeof server.listen).toBe("function");
            await expect(readFile(path.join(build.publicDirectory, "records", "index.html"), "utf8"))
                .resolves.toContain("Riverside Community Records");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
