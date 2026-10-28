import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Value from "typebox/value";

import { createSubmitLevelBlueprintTool } from "../src/agents/level-design/tool.js";
import {
    buildLevelDesignPrompt,
    LEVEL_DESIGN_DEPLOYMENT_PROMPT,
    LEVEL_DESIGN_SYSTEM_PROMPT
} from "../src/agents/level-design/prompt.js";
import { LEVEL_REVIEW_SYSTEM_PROMPT } from "../src/agents/level-review/prompt.js";
import { repositoryPuzzleCatalog } from "../src/levels/catalog.js";
import { levelFixture, levelRequestFixture } from "./fixtures/level-v5.js";
import { generateReviewedLevel } from "../src/levels/orchestration.js";
import { validateLevelPatch } from "../src/levels/patch.js";
import { availablePuzzleIds, toPublicLevelView } from "../src/levels/projection.js";
import { LevelBlueprintSchema, type LevelBlueprint } from "../src/levels/types.js";
import { validateGameLevelManifest, validateLevelAgainstRequest, validateLevelBlueprint } from "../src/levels/validator.js";

function copyLevel(): LevelBlueprint {
    return structuredClone(levelFixture);
}

function copyLevelSubmission() {
    const {
        schemaVersion: _schemaVersion,
        catalogVersion: _catalogVersion,
        id: _id,
        world: _world,
        genre: _genre,
        environment: _environment,
        startingSituation: _startingSituation,
        playerRole: _playerRole,
        playerCapabilities: _playerCapabilities,
        playerConstraints: _playerConstraints,
        startingInputs: _startingInputs,
        generationConfig: _generationConfig,
        externalContentRequirements: _externalContentRequirements,
        terminalAction,
        ...blueprint
    } = copyLevel();
    const {
        actionType: _actionType,
        description: _terminalDescription,
        ...agentTerminalAction
    } = terminalAction;
    return { ...blueprint, terminalAction: agentTerminalAction };
}

describe("level metadata v5", () => {
    it("requires readable causal transitions without forcing nonlinear structure", () => {
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("A completely linear trail, a partly connected graph");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("There is no preferred graph shape");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("highly connected acyclic graph");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("must not appear to lead to another resource by magic");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Avoid repetitive interaction rhythms");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("real-world information");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Use requiredResources for the fictional webpages");
        expect(LEVEL_REVIEW_SYSTEM_PROMPT).toContain("Do not require branching or a synthesis puzzle");
        expect(LEVEL_REVIEW_SYSTEM_PROMPT).toContain("do not prefer linear, branching, or highly connected layouts by default");
        expect(LEVEL_REVIEW_SYSTEM_PROMPT).toContain("technically valid graph that a human reader cannot follow");
    });

    it("designs an open-web resource trail instead of a central game application", () => {
        const prompt = buildLevelDesignPrompt(repositoryPuzzleCatalog);

        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("trail across independently accessible online resources");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("concrete entry point");
        expect(LEVEL_DESIGN_DEPLOYMENT_PROMPT).toContain("Do not assume a central application");
        expect(LEVEL_DESIGN_DEPLOYMENT_PROMPT).toContain("Do not make public search-engine indexing the only route");
        expect(LEVEL_DESIGN_DEPLOYMENT_PROMPT).toContain("Use requiredResources");
        expect(LEVEL_DESIGN_DEPLOYMENT_PROMPT).toContain("Preserve request-defined externalContentRequirements");
        expect(prompt).toContain(LEVEL_DESIGN_DEPLOYMENT_PROMPT);
    });

    it("keeps investigation prose clear for human readers", () => {
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Write for human readers even though AI agents are the intended solvers");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Avoid archaic words, poetic compound names, noir phrasing");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Create atmosphere through events, evidence, and consequences");
        expect(LEVEL_REVIEW_SYSTEM_PROMPT).toContain("titles are literal and descriptive");
        expect(LEVEL_REVIEW_SYSTEM_PROMPT).toContain("needlessly uncommon wording");
    });

    it("returns the generated JSON file path in demo mode", async () => {
        const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "level-demo-"));
        const tool = createSubmitLevelBlueprintTool(repositoryPuzzleCatalog, levelRequestFixture, outputDirectory);
        const result = await tool.execute("demo-tool-call", {
            mode: "demo",
            result: { status: "success", blueprint: copyLevelSubmission() }
        });
        const outputPath = path.join(outputDirectory, "community-cleanup-records.level.json");

        expect(result.content).toEqual([{ type: "text", text: `Level JSON: ${outputPath}` }]);
        expect(result.details.outputPath).toBe(outputPath);
        const savedLevel = JSON.parse(await readFile(outputPath, "utf8"));
        expect(savedLevel.id).toBe("community-cleanup-records");
        expect(savedLevel.schemaVersion).toBe("5.0.0");
        expect(savedLevel.world).toEqual(levelRequestFixture.world);
        expect(savedLevel.environment).toEqual(levelRequestFixture.environment);
        expect(savedLevel.startingInputs).toEqual(levelRequestFixture.startingInputs);
        expect(savedLevel.terminalAction.actionType).toBe(levelRequestFixture.terminalAction.actionType);
        expect(savedLevel.terminalAction.description).toBe(levelRequestFixture.terminalAction.description);
        expect(result.details.result.status === "success" && result.details.result.blueprint.schemaVersion).toBe("5.0.0");
    });

    it("keeps request-owned fields out of the agent submission contract", () => {
        const tool = createSubmitLevelBlueprintTool(repositoryPuzzleCatalog, levelRequestFixture);
        const blueprint = copyLevelSubmission();
        expect(Value.Check(tool.parameters, {
            mode: "demo",
            result: { status: "success", blueprint }
        })).toBe(true);
        expect(Value.Check(tool.parameters, {
            mode: "demo",
            result: {
                status: "success",
                blueprint: { ...blueprint, world: levelFixture.world }
            }
        })).toBe(false);
    });

    it("validates a complete metadata-only level", () => {
        expect(validateLevelBlueprint(levelFixture, repositoryPuzzleCatalog)).toEqual([]);
        expect(validateLevelAgainstRequest(levelFixture, levelRequestFixture, repositoryPuzzleCatalog)).toEqual([]);
    });

    it("requires and preserves the request's world reference", () => {
        const withoutWorld = copyLevel() as unknown as Record<string, unknown>;
        delete withoutWorld.world;
        expect(validateLevelBlueprint(withoutWorld, repositoryPuzzleCatalog)).toEqual([
            "Level does not satisfy the canonical level schema."
        ]);

        const changedWorld = copyLevel();
        changedWorld.world.revision = "2";
        expect(validateLevelAgainstRequest(changedWorld, levelRequestFixture, repositoryPuzzleCatalog)).toContain(
            "Level world reference must match the game-design request."
        );
    });

    it("treats object property order as irrelevant when preserving request data", () => {
        const level = copyLevel();
        const request = structuredClone(levelRequestFixture);
        level.world = {
            factIds: [...request.world.factIds],
            entityIds: [...request.world.entityIds],
            revision: request.world.revision,
            id: request.world.id
        };
        level.environment = {
            deploymentAgentRequired: true,
            platforms: ["project-hosted-web"],
            mode: "external-public"
        };
        level.startingInputs = request.startingInputs.map((input) => input.dataType === "string"
            ? {
                value: input.value,
                dataType: input.dataType,
                description: input.description,
                semanticRole: input.semanticRole,
                id: input.id
            }
            : input
        );
        request.externalContentRequirements = [{
            id: "public-reference",
            description: "Consult one stable public reference.",
            provenance: [{
                sourceId: "fixture/reference.json",
                retrievedValue: "reference value",
                retrievedAt: "2026-10-26T00:00:00Z"
            }]
        }];
        level.externalContentRequirements = [{
            provenance: [{
                retrievedAt: "2026-10-26T00:00:00Z",
                retrievedValue: "reference value",
                sourceId: "fixture/reference.json"
            }],
            description: "Consult one stable public reference.",
            id: "public-reference"
        }];
        level.puzzles[0].design.externalContentRequirementIds = ["public-reference"];

        expect(validateLevelAgainstRequest(level, request, repositoryPuzzleCatalog)).toEqual([]);
    });

    it("keeps the test fixture on the current schema", () => {
        expect(levelFixture.schemaVersion).toBe("5.0.0");
        expect(validateLevelBlueprint(levelFixture, repositoryPuzzleCatalog)).toEqual([]);
    });

    it("binds each external-content requirement to at least one puzzle", () => {
        const level = copyLevel();
        level.externalContentRequirements.push({
            id: "mona-lisa-artist",
            description: "Identify the artist who painted the depicted work.",
            provenance: [{
                sourceId: "fixture/museum-reference.json",
                retrievedValue: "Leonardo da Vinci",
                retrievedAt: "2026-10-25T00:00:00Z"
            }]
        });

        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            "External-content requirement mona-lisa-artist is not used by any puzzle."
        );

        level.puzzles[0].design.externalContentRequirementIds = ["mona-lisa-artist"];
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toEqual([]);
    });

    it("rejects missing and duplicate external-content requirement references", () => {
        const level = copyLevel();
        level.puzzles[0].design.externalContentRequirementIds = ["missing", "missing"];

        const errors = validateLevelBlueprint(level, repositoryPuzzleCatalog);
        expect(errors).toContain("Puzzle find-project-name has duplicate external-content requirement missing.");
        expect(errors).toContain("Puzzle find-project-name references missing external-content requirement missing.");
    });

    it("requires retrieval timestamps in external-content provenance", () => {
        const level = copyLevel() as unknown as Record<string, unknown>;
        const typed = level as unknown as LevelBlueprint;
        typed.externalContentRequirements.push({
            id: "undated-fact",
            description: "An external fact without a retrieval timestamp.",
            provenance: [{
                sourceId: "fixture/reference.json",
                retrievedValue: "value"
            } as LevelBlueprint["externalContentRequirements"][number]["provenance"][number]]
        });
        typed.puzzles[0].design.externalContentRequirementIds = ["undated-fact"];

        expect(Value.Check(LevelBlueprintSchema, level)).toBe(false);
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toEqual([
            "Level does not satisfy the canonical level schema."
        ]);
    });

    it("preserves request-defined external-content requirements", () => {
        const level = copyLevel();
        level.externalContentRequirements.push({
            id: "outside-fact",
            description: "Research an outside fact.",
            provenance: [{
                sourceId: "fixture/reference.json",
                retrievedValue: "answer",
                retrievedAt: "2026-10-25T00:00:00Z"
            }]
        });
        level.puzzles[0].design.externalContentRequirementIds = ["outside-fact"];

        expect(validateLevelAgainstRequest(level, levelRequestFixture, repositoryPuzzleCatalog)).toContain(
            "Level external-content requirements must match the game-design request."
        );
    });

    it("rejects outside knowledge in self-contained levels", () => {
        const level = copyLevel();
        level.environment = { mode: "self-contained" };
        level.externalContentRequirements.push({
            id: "outside-fact",
            description: "Research an outside fact.",
            provenance: [{
                sourceId: "fixture/reference.json",
                retrievedValue: "answer",
                retrievedAt: "2026-10-25T00:00:00Z"
            }]
        });
        level.puzzles[0].design.externalContentRequirementIds = ["outside-fact"];

        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            "Self-contained levels cannot require knowledge from outside the game."
        );
    });

    it("rejects duplicate required-resource IDs", () => {
        const level = copyLevel();
        level.requiredResources.push(structuredClone(level.requiredResources[0]));

        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            "Duplicate required-resource ID: cleanup-notice-page."
        );
    });

    it("rejects invalid puzzle generation specs before generation", () => {
        const level = copyLevel();
        delete level.puzzles[0].design.generationSpec.visibleTitle;

        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            "Puzzle find-project-name has an invalid generationSpec for html-comment."
        );
    });

    it("rejects cycles", () => {
        const level = copyLevel();
        level.puzzles[0].design.inputs.push({
            id: "coordinator-cycle",
            source: { kind: "puzzle-output", puzzleId: "identify-coordinator", outputId: "coordinator-name" },
            use: "Create an invalid circular dependency"
        });
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            "Puzzle data flow must form a directed acyclic graph."
        );
    });

    it("rejects unused outputs", () => {
        const level = copyLevel();
        const first = level.puzzles[0];
        first.design.outputs.push({
            id: "unused-room",
            semanticRole: "location",
            description: "An unused room number.",
            from: "revealed",
            dataType: "number",
            value: 17
        });
        first.design.revealContext = "The matching facilities record displays a room number.";
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            "Puzzle output find-project-name.unused-room is not consumed downstream or by the terminal action."
        );
    });

    it("rejects identity transformations", () => {
        const level = copyLevel();
        level.puzzles[2].design.inputs[0].transform = { type: "uppercase" };
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            "Transformation uppercase on find-meeting-place.project-search does not change the source value; omit it."
        );
    });

    it("rejects mismatched semantic roles on puzzle input bindings", () => {
        const level = copyLevel();
        level.puzzles[2].design.inputs[0].expectedSemanticRoles = ["location"];
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            "Puzzle find-meeting-place input project-search expects one of roles location, but find-project-name.project-name has role project-identifier."
        );
    });

    it("accepts matched semantic roles on puzzle input bindings", () => {
        const level = copyLevel();
        level.puzzles[2].design.inputs[0].expectedSemanticRoles = ["project-identifier"];
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toEqual([]);
    });

    it("reveals initial puzzles and derives later availability from input sources", () => {
        expect(availablePuzzleIds(levelFixture, [])).toEqual(["find-project-name", "find-event-date"]);
        const initial = toPublicLevelView(levelFixture);
        expect(initial.puzzles.map((puzzle) => puzzle.id)).toEqual(["find-project-name", "find-event-date"]);
        expect(JSON.stringify(initial)).not.toContain("MAYA CHEN");

        expect(availablePuzzleIds(levelFixture, ["find-project-name"])).toEqual(["find-event-date", "find-meeting-place"]);
        expect(availablePuzzleIds(levelFixture, ["find-project-name", "find-event-date", "find-meeting-place"])).toEqual(["identify-coordinator"]);
        expect(toPublicLevelView(levelFixture, levelFixture.puzzles.map((puzzle) => puzzle.id)).terminalAction.available).toBe(true);
    });

    it("protects completed puzzle IDs in progress-preserving patches", () => {
        const errors = validateLevelPatch({
            levelId: levelFixture.id,
            baseSchemaVersion: levelFixture.schemaVersion,
            mode: "progress-preserving",
            completedPuzzleIds: ["find-project-name"],
            operations: [{
                op: "remove",
                path: "/puzzles/find-project-name",
                reason: "Invalid attempt to remove completed work."
            }]
        }, levelFixture);
        expect(errors).toContain("Progress-preserving patch cannot modify completed puzzle find-project-name.");
    });

    it("retries rejected design reviews", async () => {
        let designCalls = 0;
        const result = await generateReviewedLevel({
            request: levelRequestFixture,
            catalog: repositoryPuzzleCatalog,
            design: async () => {
                designCalls += 1;
                return copyLevel();
            },
            review: async (level, _request, attempt) => ({
                levelId: level.id,
                attempt,
                accepted: attempt === 2,
                summary: attempt === 2 ? "Coherent after revision." : "Narrative use needs revision.",
                issues: attempt === 2 ? [] : [{
                    severity: "error",
                    code: "weak-use",
                    message: "The input use needs a clearer causal explanation.",
                    suggestedFix: "Explain which interface field consumes the value."
                }]
            })
        });
        expect(result.status).toBe("success");
        expect(result.attempts).toBe(2);
        expect(designCalls).toBe(2);
    });

    it("validates mandatory nested level manifests independently from progression", () => {
        expect(validateGameLevelManifest({
            schemaVersion: "1.0.0",
            gameId: "demo-game",
            levels: [
                { id: "notice", prerequisiteLevelIds: [], levelFile: "notice.level.json" },
                { id: "recap", parentLevelId: "notice", prerequisiteLevelIds: ["notice"], levelFile: "recap.level.json" }
            ]
        })).toEqual([]);
    });
});
