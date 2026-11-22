import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { GAME_DESIGN_SYSTEM_PROMPT, buildGameDesignPrompt } from "../src/features/game-design/agent/prompt.js";
import { createSubmitGameDesignTool } from "../src/features/game-design/agent/tool.js";
import type { GameDesignSpec } from "../src/features/game-design/types.js";
import { validateGameDesignSpec } from "../src/features/game-design/validator.js";
import type { PuzzleCatalog } from "../src/features/puzzle-generation/catalog.js";

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
        playerRole: "You are an independent museum investigator hired to recover the missing collection.",
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
        playerRole: "You are a museum archivist and trusted colleague of the curator whose ledger disappeared.",
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
            storyArchetype: "stolen-artifact" as const,
            premise: spec.premise,
            openingBriefing: {
                situation: "A museum ledger went missing shortly before a burglary at Blackwood Museum.",
                goal: "Find out what happened and help recover the stolen artifact.",
                firstLead: "Start with the museum's public acquisition records."
            },
            playerRole: spec.playerRole,
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
                    request: {
                        ...requestWithoutWorld,
                        investigationQuestion: "Which published record establishes what happened?",
                        terminalAction: {
                            ...requestWithoutWorld.terminalAction,
                            briefing: { kind: "discovered" as const }
                        },
                        world: worldSelection
                    }
                };
            })
        }
    };
}

describe("game design agent", () => {
    it("validates a grounded multi-level campaign", () => {
        expect(validateGameDesignSpec(gameSpec(), TEST_CATALOG)).toEqual([]);
    });

    it("lets level design choose intermediate discoveries when the campaign needs no separate exact finding", () => {
        const spec = gameSpec();
        spec.levels[0].request.requiredDiscoveries = [];
        expect(validateGameDesignSpec(spec, TEST_CATALOG)).toEqual([]);
    });

    it("flags ambiguous exact contracts before starting level design", () => {
        const spec = gameSpec();
        const request = spec.levels[0].request;
        request.requiredDiscoveries.push(structuredClone(request.requiredDiscoveries[0]));
        request.terminalAction.requiredOutputs.push(structuredClone(request.terminalAction.requiredOutputs[0]));
        const errors = validateGameDesignSpec(spec, TEST_CATALOG);
        expect(errors).toContain(`Level ${request.levelId}: Duplicate required discovery ID: ${request.requiredDiscoveries[0].id}.`);
        expect(errors).toContain(`Level ${request.levelId}: Duplicate terminal output ID: ${request.terminalAction.requiredOutputs[0].id}.`);
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

    it("rejects entity discoveries whose semantic role describes the wrong value kind", () => {
        const spec = gameSpec();
        const first = spec.levels[0].request;
        first.world.entityIds.push("person:case-witness");
        spec.world.entities.push({ id: "person:case-witness", type: "person", name: "Rosa Martinez" });
        first.requiredDiscoveries[0] = {
            id: "missed-meeting",
            semanticRole: "nonvoluntary-indicator",
            description: "Rosa Martinez confirms that the subject missed the meeting.",
            dataType: "string",
            value: "Rosa Martinez"
        };

        expect(validateGameDesignSpec(spec, TEST_CATALOG)).toContain(
            'Level trace-missing-ledger required discovery missed-meeting resolves to person "Rosa Martinez", '
            + 'but semantic role "nonvoluntary-indicator" does not identify a person. '
            + "Use a role containing one of: person, witness, suspect, victim, culprit, kidnapper, reporter, editor, contact, identity, accomplice, carrier, orderer, authoriz, identifier, name."
        );
    });

    it("rejects literal starting inputs that do not state a concrete puzzle use", () => {
        const spec = gameSpec();
        spec.levels[0].request.startingInputs.push({
            id: "case-date",
            semanticRole: "investigation-date",
            description: "The date the case began.",
            dataType: "string",
            value: "2026-05-14"
        });

        expect(validateGameDesignSpec(spec, TEST_CATALOG)).toContain(
            "Level trace-missing-ledger literal starting input case-date must describe how a puzzle will use it "
            + "to filter, locate, select, compare, interpret, or verify a resource; do not use a background fact as an input."
        );
    });

    it("requires new campaign and level roles to address the player directly", () => {
        const spec = gameSpec();
        spec.playerRole = "An independent museum investigator.";
        spec.levels[0].request.playerRole = "A records researcher.";

        const errors = validateGameDesignSpec(spec, TEST_CATALOG);
        expect(errors).toContain('Game playerRole must directly address the player and begin with "You are".');
        expect(errors).toContain(
            'Level trace-missing-ledger playerRole must directly address the player and begin with "You are".'
        );
    });

    it("supports autonomous creation when no brief is supplied", () => {
        const prompt = buildGameDesignPrompt(TEST_CATALOG, "");
        expect(prompt).toContain("No constraints supplied");
        expect(prompt).toContain("Controlled story-archetype catalog");
        expect(prompt).toContain('"kidnapping"');
        expect(prompt).toContain('"murder"');
        expect(prompt).toContain('"conspiracy"');
        expect(prompt).toContain("Do not coin words or invent poetic compounds");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("normally 3-5 levels");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("Create the GameWorld from scratch");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("persistent playerRole");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("beginning with “You are”");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("Make at most five submission attempts");
        expect(GAME_DESIGN_SYSTEM_PROMPT).toContain("Never abandon the run after the first rejection");
    });

    it("writes a world, campaign spec, manifest, and ready level requests", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "game-design-"));
        const tool = createSubmitGameDesignTool(TEST_CATALOG, root);
        const result = await tool.execute("game-design-tool", agentSubmission() as never);

        expect(result.details.spec.levels).toHaveLength(2);
        expect(result.details.spec.storyArchetype).toBe("stolen-artifact");
        expect(result.details.spec.openingBriefing).toEqual(agentSubmission().game.openingBriefing);
        expect(result.details.spec.world.revision).toBe("1");
        expect(result.details.files.requestPaths).toHaveLength(2);

        const savedWorld = JSON.parse(await readFile(result.details.files.worldPath, "utf8"));
        const savedManifest = JSON.parse(await readFile(result.details.files.manifestPath, "utf8"));
        const savedRequest = JSON.parse(await readFile(result.details.files.requestPaths[0], "utf8"));
        expect(savedRequest.terminalAction.briefing).toEqual({ kind: "discovered" });
        expect(savedWorld.id).toBe("blackwood-museum-case");
        expect(savedManifest.levels[1].prerequisiteLevelIds).toEqual(["trace-missing-ledger"]);
        expect(savedRequest.catalogVersion).toBe(TEST_CATALOG.version);
        expect(savedRequest.world).toMatchObject({ id: savedWorld.id, revision: "1" });
    });
});

