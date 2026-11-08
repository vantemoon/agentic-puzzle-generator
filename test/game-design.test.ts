import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { GAME_DESIGN_SYSTEM_PROMPT, buildGameDesignPrompt } from "../src/agents/game-design/prompt.js";
import { createSubmitGameDesignTool } from "../src/agents/game-design/tool.js";
import type { GameDesignSpec } from "../src/game-design/types.js";
import { validateGameDesignSpec } from "../src/game-design/validator.js";
import type { PuzzleCatalog } from "../src/levels/catalog.js";

const TEST_CATALOG: PuzzleCatalog = { version: "repository-puzzles-test", entries: [] };

function config() {
    return {
        structuralDifficulty: {
            preset: "easy" as const,
            puzzleCount: { minimum: 3, maximum: 4 },
            phaseCount: { minimum: 2, maximum: 3 },
            linearity: 0.8,
            maxParallelPuzzles: 2
        },
        puzzleDifficulty: { preset: "easy" as const },
        transformationPolicy: { enabled: true, maxCount: 1, maxDifficulty: "easy" as const },
        reviewRetryLimit: 2,
        concealUnreachedContent: true,
        encourageSubtypeVariety: true
    };
}

function request(levelId: string, factId: string, answer: string) {
    return {
        levelId,
        world: {
            id: "blackwood-museum-case",
            revision: "1",
            entityIds: ["organization:blackwood-museum", `object:${levelId}`],
            factIds: [factId]
        },
        titleHint: levelId === "trace-missing-ledger" ? "Trace the Missing Ledger" : "Recover the Bronze Falcon",
        genre: "online-investigation" as const,
        theme: "museum theft investigation",
        setting: "Blackwood Museum public records and partner archives",
        startingSituation: `A newly discovered public record may resolve ${levelId}.`,
        playerRole: "independent museum investigator",
        playerCapabilities: ["browse fictional public websites", "inspect public records and page source"],
        playerConstraints: ["use only public fictional resources", "do not contact real people"],
        environment: {
            mode: "external-public" as const,
            platforms: ["project-hosted-web"],
            deploymentAgentRequired: true as const
        },
        narrativeContext: ["The museum needs exact evidence before it can act."],
        startingInputs: [{
            id: "case-page",
            semanticRole: "starting-resource",
            description: "The public case page where this stage begins.",
            kind: "bundle-entry" as const,
            resourceKind: "webpage"
        }],
        externalContentRequirements: [],
        requiredDiscoveries: [{
            id: "case-finding",
            semanticRole: "finding",
            description: "The exact finding that resolves this stage.",
            dataType: "string" as const,
            value: answer
        }],
        terminalAction: {
            actionType: "evidence-submission",
            description: "Submit the exact finding to the museum case portal.",
            requiredOutputs: [{
                id: "finding",
                semanticRole: "finding",
                dataType: "string" as const,
                requiredValue: answer
            }]
        },
        catalogVersion: TEST_CATALOG.version,
        config: config()
    };
}

function gameSpec(): GameDesignSpec {
    return {
        schemaVersion: "1.0.0",
        id: "blackwood-museum-case",
        title: "The Blackwood Falcon",
        premise: "A museum ledger disappears hours before a bronze artifact is stolen.",
        experienceGoals: ["Follow a mounting public-record trail", "Recover the artifact without real-world contact"],
        world: {
            schemaVersion: "1.0.0",
            id: "blackwood-museum-case",
            revision: "1",
            entities: [{
                id: "organization:blackwood-museum",
                type: "organization",
                name: "Blackwood Museum"
            }, {
                id: "object:trace-missing-ledger",
                type: "object",
                name: "Missing acquisition ledger"
            }, {
                id: "object:recover-bronze-falcon",
                type: "object",
                name: "Bronze falcon"
            }],
            facts: [{
                id: "fact:ledger-storage-code",
                subjectId: "object:trace-missing-ledger",
                relation: "last-recorded-location",
                value: { kind: "literal", value: "North Annex Cabinet 7" }
            }, {
                id: "fact:falcon-recovery-location",
                subjectId: "object:recover-bronze-falcon",
                relation: "recovery-location",
                value: { kind: "literal", value: "Bellweather Station Locker 18" }
            }]
        },
        levels: [{
            prerequisiteLevelIds: [],
            request: request("trace-missing-ledger", "fact:ledger-storage-code", "North Annex Cabinet 7")
        }, {
            parentLevelId: "trace-missing-ledger",
            prerequisiteLevelIds: ["trace-missing-ledger"],
            request: request("recover-bronze-falcon", "fact:falcon-recovery-location", "Bellweather Station Locker 18")
        }]
    };
}

function agentSubmission() {
    const spec = gameSpec();
    return {
        game: {
            id: spec.id,
            title: spec.title,
            premise: spec.premise,
            experienceGoals: spec.experienceGoals,
            world: {
                id: spec.world.id,
                entities: spec.world.entities,
                facts: spec.world.facts
            },
            levels: spec.levels.map((level) => {
                const { world, catalogVersion: _catalogVersion, ...requestWithoutWorld } = level.request;
                const { id: _id, revision: _revision, ...worldSelection } = world;
                return {
                    ...(level.parentLevelId === undefined ? {} : { parentLevelId: level.parentLevelId }),
                    prerequisiteLevelIds: level.prerequisiteLevelIds,
                    request: { ...requestWithoutWorld, world: worldSelection }
                };
            })
        }
    };
}

describe("game design agent", () => {
    it("validates a grounded multi-level campaign", () => {
        expect(validateGameDesignSpec(gameSpec(), TEST_CATALOG)).toEqual([]);
    });

    it("rejects cyclic progression and values missing from world canon", () => {
        const spec = gameSpec();
        spec.levels[0].prerequisiteLevelIds = ["recover-bronze-falcon"];
        spec.levels[1].request.requiredDiscoveries[0].value = "Unknown Warehouse";
        const errors = validateGameDesignSpec(spec, TEST_CATALOG);
        expect(errors).toContain("Level prerequisites must be acyclic.");
        expect(errors).toContain(
            "Level recover-bronze-falcon required discovery case-finding is not grounded in its selected world facts or entities."
        );
    });

    it("supports autonomous creation when no brief is supplied", () => {
        const prompt = buildGameDesignPrompt(TEST_CATALOG, "");
        expect(prompt).toContain("No constraints supplied");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("murder mystery, kidnapping investigation, stolen artifact");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("normally 3-5 levels");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("Create the GameWorld from scratch");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("Make at most three submission attempts");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("Never abandon the run after the first rejection");
    });

    it("writes a world, campaign spec, manifest, and ready level requests", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "game-design-"));
        const tool = createSubmitGameDesignTool(TEST_CATALOG, root);
        const result = await tool.execute("game-design-tool", agentSubmission() as never);

        expect(result.details.spec.levels).toHaveLength(2);
        expect(result.details.spec.world.revision).toBe("1");
        expect(result.details.files.requestPaths).toHaveLength(2);

        const savedWorld = JSON.parse(await readFile(result.details.files.worldPath, "utf8"));
        const savedManifest = JSON.parse(await readFile(result.details.files.manifestPath, "utf8"));
        const savedRequest = JSON.parse(await readFile(result.details.files.requestPaths[0], "utf8"));
        expect(savedWorld.id).toBe("blackwood-museum-case");
        expect(savedManifest.levels[1].prerequisiteLevelIds).toEqual(["trace-missing-ledger"]);
        expect(savedRequest.catalogVersion).toBe(TEST_CATALOG.version);
        expect(savedRequest.world).toMatchObject({ id: savedWorld.id, revision: "1" });
    });
});

