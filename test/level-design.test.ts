import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Value from "typebox/value";

import { createSubmitLevelBlueprintTool } from "../src/features/level-design/agent/tool.js";
import {
    buildLevelDesignPrompt,
    LEVEL_DESIGN_DEPLOYMENT_PROMPT,
    LEVEL_DESIGN_SYSTEM_PROMPT
} from "../src/features/level-design/agent/prompt.js";
import { LEVEL_REVIEW_SYSTEM_PROMPT } from "../src/features/level-review/agent/prompt.js";
import { repositoryPuzzleCatalog } from "../src/features/puzzle-generation/catalog.js";
import { levelFixture, levelRequestFixture } from "./fixtures/level-v5.js";
import { generateReviewedLevel } from "../src/features/level-review/orchestration.js";
import { validateLevelPatch } from "../src/features/level-review/patch.js";
import { availablePuzzleIds, toPublicLevelView } from "../src/features/level-design/projection.js";
import { LevelBlueprintSchema, type LevelBlueprint } from "../src/features/level-design/types.js";
import { validateGameLevelManifest } from "../src/features/game-design/manifest-validator.js";
import { validateLevelAgainstRequest, validateLevelBlueprint, validateLevelDesignRequest } from "../src/features/level-design/validator.js";

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
        briefing: _terminalBriefing,
        ...agentTerminalAction
    } = terminalAction;
    return { ...blueprint, terminalAction: agentTerminalAction };
}

describe("level metadata v5", () => {
    it("rejects generic example hostnames in undeployed starting URLs", () => {
        const request = structuredClone(levelRequestFixture);
        const inputId = request.startingInputs[0].id;
        request.startingInputs[0] = {
            id: inputId,
            semanticRole: "starting-url",
            description: "A supplied public page.",
            dataType: "string",
            value: "https://library.example/archive"
        };

        expect(validateLevelDesignRequest(request)).toContain(
            `Starting input ${inputId} uses placeholder hostname library.example; use a site-specific .test hostname until deployment.`
        );
        const literalInput = request.startingInputs[0];
        if (!("value" in literalInput)) throw new Error("Expected a literal starting input.");
        literalInput.value = "https://riverside-library.test/archive";
        expect(validateLevelDesignRequest(request)).toEqual([]);
    });

    it("requires readable causal transitions without forcing nonlinear structure", () => {
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("A completely linear trail, a partly connected graph");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("There is no preferred graph shape");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("highly connected acyclic graph");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("must not appear to lead to another resource by magic");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Avoid repetitive interaction rhythms");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("real-world information");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Use requiredResources for the fictional webpages");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("bundle-entry starting inputs");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Add revealContext if and only if");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Copy each required output's id and semanticRole exactly");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Make at most three submission attempts");
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
        const request = structuredClone(levelRequestFixture);
        request.terminalAction.briefing = {
            kind: "assigned",
            instruction: "The archive desk asks you to send back what you find so it can update its records."
        };
        const tool = createSubmitLevelBlueprintTool(repositoryPuzzleCatalog, request, outputDirectory);
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
        expect(savedLevel.terminalAction.briefing).toEqual(request.terminalAction.briefing);
        savedLevel.terminalAction.briefing = { kind: "discovered" };
        expect(validateLevelAgainstRequest(savedLevel, request, repositoryPuzzleCatalog))
            .toContain("Terminal action briefing must match the game-design request.");
        expect(result.details.result.status === "success" && result.details.result.blueprint.schemaVersion).toBe("5.0.0");
    });

    it("requires authored levels to specify a player action for each puzzle page", async () => {
        const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "level-access-"));
        try {
            const request = { ...levelRequestFixture, investigationQuestion: "Who coordinated the cleanup?" };
            const tool = createSubmitLevelBlueprintTool(repositoryPuzzleCatalog, request, outputDirectory);
            const blueprint = copyLevelSubmission();
            const submission = { mode: "demo", result: { status: "success", blueprint } } as const;

            await expect(tool.execute("missing-access", submission)).rejects.toThrow(
                "Puzzle find-meeting-place must declare how the player reaches its page"
            );

            for (const puzzle of blueprint.puzzles) {
                puzzle.design.inputs[0].access = { kind: "navigation" };
            }
            const meetingInput = blueprint.puzzles.find((puzzle) => puzzle.id === "find-meeting-place")!.design.inputs[0];
            meetingInput.access = { kind: "lookup", fieldLabel: "Project name" };
            expect(Value.Check(tool.parameters, submission)).toBe(true);
            const result = await tool.execute("declared-access", submission);
            expect(result.details.result.status).toBe("success");
        } finally {
            await rm(outputDirectory, { recursive: true, force: true });
        }
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

    it("rejects visual-clue blueprints that mismatch or leak the intended answer", () => {
        const level = copyLevel();
        const puzzle = level.puzzles[0];
        puzzle.design.subtype = "visual-clue";
        puzzle.design.generationSpec = {
            mode: "production",
            id: puzzle.id,
            intendedSolution: puzzle.design.verification.expectedValue,
            sceneTitle: "Archive shelf diagram",
            sceneTheme: "A public archive transfer diagram",
            sceneDescription: `The diagram points to ${puzzle.design.verification.expectedValue}.`,
            clueKind: "text",
            clueLabel: `${puzzle.design.verification.expectedValue} shelf label`
        };

        const errors = validateLevelBlueprint(level, repositoryPuzzleCatalog);
        expect(errors).toContain(
            `Puzzle ${puzzle.id} visual-clue generationSpec.clueLabel must exactly match intendedSolution.`
        );
        expect(errors).toContain(
            `Puzzle ${puzzle.id} visual-clue generationSpec.sceneDescription must not contain intendedSolution; place the exact answer only in clueLabel.`
        );
    });

    it("teaches the level-design agent visual-clue semantic constraints", () => {
        const prompt = buildLevelDesignPrompt(repositoryPuzzleCatalog);
        expect(prompt).toContain("Obey every generationSpecConstraints rule");
        expect(prompt).toContain("clueLabel must exactly equal intendedSolution");
        expect(prompt).toContain("reserve it for the clue artwork and clue-specific metadata");
    });

    it("rejects an exact permit identifier when the extraction mechanic only supports letters", () => {
        const level = copyLevel();
        const puzzle = level.puzzles[0];
        puzzle.design.subtype = "capital-letter-extraction";
        puzzle.design.generationSpec = {
            mode: "production",
            id: puzzle.id,
            intendedSolution: "PER-26-0418",
            genre: "reporter work note"
        };
        puzzle.design.verification.expectedValue = "PER-26-0418";

        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toEqual([
            expect.stringContaining(`Puzzle ${puzzle.id} has an incompatible generationSpec.intendedSolution:`),
        ]);

        puzzle.design.generationSpec.intendedSolution = "RIVER CLEANUP";
        puzzle.design.verification.expectedValue = "RIVER CLEANUP";
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toEqual([]);

        expect(buildLevelDesignPrompt(repositoryPuzzleCatalog)).toContain(
            "Choose a different subtype when the exact required answer contains digits or punctuation."
        );
    });

    it("rejects answer-bearing alt-text copy before artwork generation", () => {
        const level = copyLevel();
        const puzzle = level.puzzles.find(({ design }) => design.subtype === "alt-text")!;
        const copy = puzzle.design.generationSpec;
        const answer = String(copy.intendedSolution);
        const visibleBody = copy.visibleBody;
        const imageLabel = copy.imageLabel;
        copy.visibleBody = `The archive places ${answer} beside the event photograph.`;
        copy.imageLabel = answer;

        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            `Puzzle ${puzzle.id} alt-text generationSpec failed: The intended solution must not appear in visible page, image label, or caption. Found it in visibleBody, imageLabel. Revise the upstream copy without changing required values, or choose a mechanic that fits how the evidence is presented.`
        );

        copy.visibleBody = visibleBody;
        copy.imageLabel = imageLabel;
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toEqual([]);

        copy.altText = "Volunteers along the riverbank.";
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toEqual([
            expect.stringContaining("The natural image alt text must contain the intended solution.")
        ]);
    });

    it("requires anomalous-phrase evidence to be exact document excerpts", () => {
        const level = copyLevel();
        const puzzle = level.puzzles[0];
        puzzle.design.puzzleType = "hidden-information";
        puzzle.design.subtype = "anomalous-phrase";
        puzzle.design.generationSpec = {
            mode: "production",
            id: puzzle.id,
            intendedSolution: "Daniel Price",
            documentTemplate: "Approval author identifies the responsible person. Responsible person: {{ANOMALY}}.",
            anomalousPhrase: "Daniel Price",
            normalityContext: "The document defines how responsibility is assigned.",
            normalPatternEvidence: [
                "Approval author: full name from the sender field.",
                "Transfer actor: full name from the completion line."
            ],
            genre: "case index",
            anomalyKind: "out-of-context-entity"
        };
        puzzle.design.verification.expectedValue = "Daniel Price";

        const errors = validateLevelBlueprint(level, repositoryPuzzleCatalog);
        expect(errors).toContain(
            `Puzzle ${puzzle.id} anomalous-phrase generationSpec failed: Normal-pattern evidence must appear in the document outside the anomaly: "Approval author: full name from the sender field.".`
        );

        puzzle.design.generationSpec.documentTemplate =
            "Approval notice: signed. Transfer log: completed. Responsible person: Daniel Price.";
        puzzle.design.generationSpec.normalPatternEvidence = ["Approval notice: signed.", "Transfer log: completed."];
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)
            .filter((error) => error.includes("anomalous-phrase generationSpec"))).toEqual([]);

        const prompt = buildLevelDesignPrompt(repositoryPuzzleCatalog);
        expect(prompt).toContain("distinct exact excerpt already present in documentTemplate");
        expect(prompt).toContain("do not write abstract descriptions of evidence");
    });

    it("requires chronological dates and site-native labels for page-version puzzles", () => {
        const level = copyLevel();
        const puzzle = level.puzzles.find((candidate) => candidate.design.subtype === "page-version");
        if (puzzle === undefined) throw new Error("Missing page-version fixture.");
        puzzle.design.generationSpec.baselineDate = "2026-03-05";
        puzzle.design.generationSpec.currentDate = "2026-03-02";
        puzzle.design.generationSpec.currentLabel = "Current";

        const errors = validateLevelBlueprint(level, repositoryPuzzleCatalog);
        expect(errors).toContain(
            `Puzzle ${puzzle.id} page-version generationSpec requires real chronological baselineDate and currentDate values in YYYY-MM-DD format.`
        );
        expect(errors).toContain(
            `Puzzle ${puzzle.id} page-version generationSpec.currentLabel must use a site-native description, not Current.`
        );

        const prompt = buildLevelDesignPrompt(repositoryPuzzleCatalog);
        expect(prompt).toContain("credible states of the same webpage");
        expect(prompt).toContain("added, removed, revealed, or altered content");
        expect(prompt).toContain("baselineDate and currentDate must be real YYYY-MM-DD publication dates");
        expect(prompt).toContain("never use Baseline or Current as player-facing labels");
    });

    it("requires and preserves the request's world reference", () => {
        const withoutWorld = copyLevel() as unknown as Record<string, unknown>;
        delete withoutWorld.world;
        expect(validateLevelBlueprint(withoutWorld, repositoryPuzzleCatalog)).toEqual([
            expect.stringContaining("required properties world")
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
        level.startingInputs = request.startingInputs.map((input) => "dataType" in input && input.dataType === "string"
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
            expect.stringContaining("required properties retrievedAt")
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

    it("allows an investigation finding outside the terminal data flow", () => {
        const level = copyLevel();
        const request = structuredClone(levelRequestFixture);
        const [project] = level.puzzles;
        const coordinator = level.puzzles.find((puzzle) => puzzle.id === "identify-coordinator")!;
        const [person] = coordinator.design.outputs;
        const personName = String(coordinator.design.verification.expectedValue);
        level.investigationQuestion = request.investigationQuestion = "Which project was involved and who coordinated it?";
        level.terminalAction.description = request.terminalAction.description = "Send the project name so the desk can retrieve its file.";
        level.terminalAction.fields = [{
            id: "project", label: "Project name", semanticRole: "resource-identifier",
            source: { puzzleId: project.id, outputId: project.design.outputs[0].id }
        }];
        request.terminalAction.requiredOutputs = [{
            id: "project", semanticRole: "resource-identifier", dataType: "string",
            requiredValue: String(project.design.verification.expectedValue)
        }];
        person.requiredDiscoveryId = "assigned-coordinator";
        request.requiredDiscoveries.push({
            id: "assigned-coordinator", semanticRole: "person-identifier", description: "The name in the event recap.",
            dataType: "string", value: personName
        });

        expect(validateLevelAgainstRequest(level, request, repositoryPuzzleCatalog)).toEqual([]);
        delete person.requiredDiscoveryId;
        expect(validateLevelAgainstRequest(level, request, repositoryPuzzleCatalog))
            .toContain("Required discovery assigned-coordinator must be produced exactly once.");
    });

    it("reports the expected and produced values for a mismatched required discovery", () => {
        const level = copyLevel();
        const request = structuredClone(levelRequestFixture);
        const binding = { puzzle: level.puzzles[0], output: level.puzzles[0].design.outputs[0] };
        if (binding.output.from !== "verification") throw new Error("Expected a verification-backed fixture output.");
        const required = {
            id: "required-project-name",
            semanticRole: binding.output.semanticRole,
            description: "The project name recovered from the notice.",
            dataType: "string" as const,
            value: binding.puzzle.design.verification.expectedValue as string
        };
        request.requiredDiscoveries.push(required);
        binding.output.requiredDiscoveryId = required.id;
        binding.puzzle.design.verification.expectedValue = "WRONG VALUE";
        binding.puzzle.design.generationSpec.intendedSolution = "WRONG VALUE";

        expect(validateLevelAgainstRequest(level, request, repositoryPuzzleCatalog)).toContain(
            `Required discovery ${required.id} expected ${required.dataType} ${JSON.stringify(required.value)}, `
            + `but ${binding.puzzle.id}.${binding.output.id} resolves to string "WRONG VALUE".`
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
