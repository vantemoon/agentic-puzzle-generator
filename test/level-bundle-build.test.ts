import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createHtmlCommentPuzzle } from "../src/agents/html-comment/engine.js";
import { createPageVersionPuzzle } from "../src/agents/page-version/engine.js";
import { createQrCodePuzzle } from "../src/agents/qr-code/engine.js";
import { generateRasterMedia } from "../src/agents/supporting-media/engine.js";
import { writeWorldMediaAsset } from "../src/agents/supporting-media/library.js";
import type { LevelBundleInputs } from "../src/levels/bundle-inputs.js";
import { buildLevelBundle, selectBundleStartingRoutes } from "../src/levels/bundle-build.js";
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
    level.startingInputs = [level.startingInputs[0]];
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
            blocks: [{
                kind: "prose" as const,
                paragraphs: ["Staff shared schedules and general volunteer information with local residents."]
            }]
        },
        discovery: rootDiscovery
    }));
    const bundle: LevelBundle = {
        schemaVersion: LEVEL_BUNDLE_SCHEMA_VERSION,
        levelId: level.id,
        world: { id: level.world.id, revision: level.world.revision },
        seed: "builder-test",
        worldAdditions: { entities: [], facts: [] },
        mediaRequests: [],
        sites: [{
            id: "records",
            name: "Riverside Community Records",
            worldEntityId: "site:community-notices",
            archetype: "organization",
            visualProfile: {
                tone: "formal",
                fontStyle: "sans",
                density: "comfortable",
                accentColor: "#315d72",
                mediaStyle: "Natural civic documentary photography"
            },
            basePath: "/records",
            routes: [{
                path: "/",
                role: "structural",
                content: {
                    title: "Community records",
                    description: "Public notices and community information.",
                    blocks: [
                        { kind: "prose", paragraphs: ["Browse recent notices, reports, and public updates."] },
                        {
                            kind: "records",
                            heading: "Office information",
                            entries: [{ label: "Public desk", value: "Open weekdays" }]
                        }
                    ]
                },
                discovery: {
                    kind: "stable-path",
                    from: [`starting-input:${level.startingInputs[0].id}`],
                    cue: "Open the supplied community records URL."
                }
            }, ...supporting, {
                path: "/notices/cleanup",
                role: "puzzle",
                content: {
                    title: "Weekend volunteer notice",
                    description: "A notice about a recent volunteer event.",
                    blocks: [{ kind: "prose", paragraphs: ["The archived notice is reproduced below."] }]
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
                    blocks: [{ kind: "prose", paragraphs: ["Complete the field to finish the records request."] }]
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

function supportingMediaFixture(): { inputs: LevelBundleInputs; bundle: LevelBundle } {
    const fixture = buildFixture();
    fixture.bundle.mediaRequests.push({
        id: "records-building",
        siteId: "records",
        routePath: "/",
        kind: "raster-image",
        purpose: "Establish the records office",
        brief: "A documentary exterior view of the community records office",
        accessibilityText: "Exterior of the community records office",
        worldEntityIds: ["site:community-notices"]
    });
    fixture.bundle.sites[0].routes[0].content.blocks.push({
        kind: "media",
        mediaId: "records-building",
        caption: "Community records office"
    });
    return fixture;
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
    it("opens the first setting's homepage when a legacy bundle maps one input to several routes", () => {
        const fixture = buildFixture();
        const source = `starting-input:${fixture.inputs.level.startingInputs[0].id}`;
        fixture.bundle.sites.push({
            id: "later-site",
            name: "Later Site",
            archetype: "blog",
            visualProfile: {
                tone: "artistic",
                fontStyle: "serif",
                density: "comfortable",
                accentColor: "#694f70",
                mediaStyle: "Informal editorial photography"
            },
            basePath: "/later",
            routes: [{
                path: "/",
                role: "structural",
                content: {
                    title: "Later homepage",
                    description: "A downstream site.",
                    blocks: [{ kind: "prose", paragraphs: ["Downstream information."] }]
                },
                discovery: {
                    kind: "stable-path",
                    from: [source],
                    cue: "Open the downstream site."
                }
            }]
        });

        expect(selectBundleStartingRoutes(fixture.bundle, [fixture.inputs.level.startingInputs[0].id]))
            .toEqual([expect.objectContaining({ publicPath: "/records" })]);
    });

    it("builds a deterministic public site while keeping private mappings separate", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bundle-build-"));
        try {
            const fixture = buildFixture();
            const contextualRoute = fixture.bundle.sites[0].routes.find(
                (route) => route.path === "/news/update-1"
            );
            const footerRoute = fixture.bundle.sites[0].routes.find(
                (route) => route.path === "/news/update-2"
            );
            if (contextualRoute === undefined || footerRoute === undefined) {
                throw new Error("Missing navigation-classification fixtures.");
            }
            contextualRoute.navigation = "contextual";
            footerRoute.navigation = "footer";
            const first = await buildLevelBundle({
                ...fixture,
                catalog: repositoryPuzzleCatalog,
                outputDirectory: root
            });
            const puzzlePage = path.join(first.publicDirectory, "records", "notices", "cleanup", "index.html");
            const terminalPage = path.join(first.publicDirectory, "records", "submit", "index.html");
            const puzzleSource = await readFile(puzzlePage, "utf8");
            const homeSource = await readFile(
                path.join(first.publicDirectory, "records", "index.html"),
                "utf8"
            );
            const indexSource = await readFile(path.join(first.publicDirectory, "index.html"), "utf8");
            const sharedStyles = await readFile(
                path.join(first.publicDirectory, "assets", "site.css"),
                "utf8"
            );
            const manifestSource = await readFile(first.manifestPath, "utf8");
            const reportSource = await readFile(first.reportPath, "utf8");

            expect(puzzleSource).toContain("RIVER CLEANUP");
            expect(puzzleSource).toContain("<!--");
            expect(puzzleSource).not.toContain(">puzzle<");
            expect(homeSource).toContain("<dl>");
            expect(homeSource).not.toContain("Open the linked public record.");
            expect(homeSource).toContain('data-archetype="organization"');
            expect(homeSource).toContain('class="breadcrumbs"');
            expect(homeSource).toContain('class="skip-link"');
            expect(homeSource).not.toContain("Submit findings");
            const primaryNavigation = homeSource.match(
                /<nav class="primary-nav"[\s\S]*?<\/nav>/
            )?.[0];
            expect(primaryNavigation).toBeDefined();
            expect(primaryNavigation).not.toContain("Community update 1");
            expect(primaryNavigation).not.toContain("Community update 2");
            expect(homeSource).toContain('<nav aria-label="Footer"><a href="/records/news/update-2">');
            expect(homeSource).toContain('href="/assets/site-1.css"');
            expect(homeSource).not.toContain('style="--site-accent:');
            expect(await readFile(path.join(first.publicDirectory, "assets", "site-1.css"), "utf8"))
                .toContain(`--site-accent:${fixture.bundle.sites[0].visualProfile.accentColor}`);
            expect(indexSource).toContain('target="_blank" rel="noopener"');
            expect(indexSource).toContain("Begin investigation");
            expect(indexSource).not.toContain('class="bundle-site-grid"');
            expect(sharedStyles).toContain('body[data-archetype="blog"]');
            expect(sharedStyles).toContain('body[data-archetype="gallery"]');
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

    it("materializes reusable supporting media from the world library", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "bundle-supporting-media-"));
        try {
            const fixture = supportingMediaFixture();
            const mediaRoot = path.join(root, "world-media");
            const generated = generateRasterMedia({
                backgroundColor: "#c9d8df",
                elements: [
                    "rect|90|90|460|220|#d9d1c2|1|8",
                    "rect|130|130|90|180|#617985|1|2",
                    "rect|270|130|90|80|#8aa6b2|1|2",
                    "rect|400|130|90|80|#8aa6b2|1|2"
                ]
            });
            await writeWorldMediaAsset({
                worldId: fixture.inputs.world.id,
                rootDirectory: mediaRoot,
                generated,
                asset: {
                    id: "records-building",
                    kind: "raster-image",
                    mediaType: "image/png",
                    worldEntityIds: ["site:community-notices"],
                    purpose: "Establish the records office",
                    accessibilityText: "Exterior of the community records office",
                    source: {
                        levelId: fixture.inputs.level.id,
                        siteId: "records",
                        routePath: "/"
                    },
                    generator: {
                        task: "supporting-media-raster",
                        modelId: "test-model",
                        providerId: "test-provider"
                    }
                }
            });

            const result = await buildLevelBundle({
                ...fixture,
                catalog: repositoryPuzzleCatalog,
                outputDirectory: path.join(root, "bundle"),
                worldMediaDirectory: mediaRoot
            });
            const mediaPath = path.join(
                result.publicDirectory,
                "assets",
                "supporting",
                "records-building.png"
            );
            expect((await readFile(mediaPath)).subarray(1, 4).toString("ascii")).toBe("PNG");
            const home = await readFile(path.join(result.publicDirectory, "records", "index.html"), "utf8");
            expect(home).toContain('src="/assets/supporting/records-building.png"');
            expect(home).toContain('alt="Exterior of the community records office"');
            expect(result.manifest.assets).toContainEqual(expect.objectContaining({
                path: "/assets/supporting/records-building.png",
                mediaType: "image/png"
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
        const server = createBundlePreviewServer({
            publicDirectory: build.publicDirectory,
            inputs: fixture.inputs,
            bundle: fixture.bundle
        });
        try {
            expect(server.listening).toBe(false);
            expect(typeof server.listen).toBe("function");
            await expect(readFile(path.join(build.publicDirectory, "records", "index.html"), "utf8"))
                .resolves.toContain("Riverside Community Records");
            await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            if (address === null || typeof address === "string") throw new Error("Missing preview-server port.");
            const origin = `http://127.0.0.1:${address.port}`;
            const target = "/records/notices/cleanup";
            const wrongSearch = await fetch(
                `${origin}/api/search?target=${encodeURIComponent(target)}&q=wrong`,
                { redirect: "manual" }
            );
            expect(wrongSearch.status).toBe(200);
            expect(await wrongSearch.text()).toContain("No matching results");
            const correctQuery = String(fixture.inputs.level.startingInputs[0].value);
            const correctSearch = await fetch(
                `${origin}/api/search?target=${encodeURIComponent(target)}&q=${encodeURIComponent(correctQuery)}`,
                { redirect: "manual" }
            );
            expect(correctSearch.status).toBe(303);
            expect(correctSearch.headers.get("location")).toBe(target);
            const completion = await fetch(`${origin}/api/validate`, {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    levelId: fixture.inputs.level.id,
                    project: "RIVER CLEANUP",
                    returnPath: "/records/submit"
                })
            });
            const completionSource = await completion.text();
            expect(completion.status).toBe(200);
            expect(completionSource).toContain("Investigation Complete");
            expect(completionSource).toContain('href="/assets/site.css"');
        } finally {
            if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
            await rm(root, { recursive: true, force: true });
        }
    });
});
