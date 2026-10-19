import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
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
import { openWebExampleLevel, openWebExampleRequest } from "../src/levels/examples/open-web-example.js";
import { generateReviewedLevel } from "../src/levels/orchestration.js";
import { validateLevelPatch } from "../src/levels/patch.js";
import { availablePuzzleIds, toPublicLevelView } from "../src/levels/projection.js";
import type { LevelBlueprint } from "../src/levels/types.js";
import { validateGameLevelManifest, validateLevelAgainstRequest, validateLevelBlueprint } from "../src/levels/validator.js";

function copyLevel(): LevelBlueprint {
    return structuredClone(openWebExampleLevel);
}

function copyLevelSubmission(): Omit<LevelBlueprint, "schemaVersion"> {
    const { schemaVersion: _schemaVersion, ...blueprint } = copyLevel();
    return blueprint;
}

describe("level metadata v3", () => {
    it("requires readable causal transitions without forcing nonlinear structure", () => {
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("A completely linear trail, a partly connected graph");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("There is no preferred graph shape");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("highly connected acyclic graph");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("must not appear to lead to another resource by magic");
        expect(LEVEL_DESIGN_SYSTEM_PROMPT).toContain("Avoid repetitive interaction rhythms");
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
        const tool = createSubmitLevelBlueprintTool(repositoryPuzzleCatalog, undefined, outputDirectory);
        const result = await tool.execute("demo-tool-call", {
            mode: "demo",
            result: { status: "success", blueprint: copyLevelSubmission() }
        });
        const outputPath = path.join(outputDirectory, "community-cleanup-records.level.json");

        expect(result.content).toEqual([{ type: "text", text: `Level JSON: ${outputPath}` }]);
        expect(result.details.outputPath).toBe(outputPath);
        const savedLevel = JSON.parse(await readFile(outputPath, "utf8"));
        expect(savedLevel.id).toBe("community-cleanup-records");
        expect(savedLevel.schemaVersion).toBe("3.0.0");
        expect(result.details.result.status === "success" && result.details.result.blueprint.schemaVersion).toBe("3.0.0");
    });

    it("keeps the schema version out of the agent-owned submission contract", () => {
        const tool = createSubmitLevelBlueprintTool(repositoryPuzzleCatalog);
        const blueprint = copyLevelSubmission();
        expect(Value.Check(tool.parameters, {
            mode: "demo",
            result: { status: "success", blueprint }
        })).toBe(true);
        expect(Value.Check(tool.parameters, {
            mode: "demo",
            result: {
                status: "success",
                blueprint: { ...blueprint, schemaVersion: "level-blueprint-1.0" }
            }
        })).toBe(false);
    });

    it("validates a complete metadata-only level", () => {
        expect(validateLevelBlueprint(openWebExampleLevel, repositoryPuzzleCatalog)).toEqual([]);
        expect(validateLevelAgainstRequest(openWebExampleLevel, openWebExampleRequest, repositoryPuzzleCatalog)).toEqual([]);
    });

    it("keeps every checked-in generated level on the current schema", () => {
        for (const fileName of readdirSync("generated-levels").filter((name) => name.endsWith(".level.json"))) {
            const level = JSON.parse(readFileSync(path.join("generated-levels", fileName), "utf8"));
            expect(validateLevelBlueprint(level, repositoryPuzzleCatalog), fileName).toEqual([]);
        }
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

    it("reveals initial puzzles and derives later availability from input sources", () => {
        expect(availablePuzzleIds(openWebExampleLevel, [])).toEqual(["find-project-name", "find-event-date"]);
        const initial = toPublicLevelView(openWebExampleLevel);
        expect(initial.puzzles.map((puzzle) => puzzle.id)).toEqual(["find-project-name", "find-event-date"]);
        expect(JSON.stringify(initial)).not.toContain("MAYA CHEN");

        expect(availablePuzzleIds(openWebExampleLevel, ["find-project-name"])).toEqual(["find-event-date", "find-meeting-place"]);
        expect(availablePuzzleIds(openWebExampleLevel, ["find-project-name", "find-event-date", "find-meeting-place"])).toEqual(["identify-coordinator"]);
        expect(toPublicLevelView(openWebExampleLevel, openWebExampleLevel.puzzles.map((puzzle) => puzzle.id)).terminalAction.available).toBe(true);
    });

    it("protects completed puzzle IDs in progress-preserving patches", () => {
        const errors = validateLevelPatch({
            levelId: openWebExampleLevel.id,
            baseSchemaVersion: openWebExampleLevel.schemaVersion,
            mode: "progress-preserving",
            completedPuzzleIds: ["find-project-name"],
            operations: [{
                op: "remove",
                path: "/puzzles/find-project-name",
                reason: "Invalid attempt to remove completed work."
            }]
        }, openWebExampleLevel);
        expect(errors).toContain("Progress-preserving patch cannot modify completed puzzle find-project-name.");
    });

    it("retries rejected design reviews", async () => {
        let designCalls = 0;
        const result = await generateReviewedLevel({
            request: openWebExampleRequest,
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
