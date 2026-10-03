import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import Value from "typebox/value";

import { createSubmitLevelBlueprintTool } from "../src/agents/level-design/tool.js";
import { repositoryPuzzleCatalog } from "../src/levels/catalog.js";
import { laptopInvestigationLevel, laptopInvestigationRequest } from "../src/levels/examples/laptop-investigation.js";
import { generateReviewedLevel } from "../src/levels/orchestration.js";
import { validateLevelPatch } from "../src/levels/patch.js";
import { availablePuzzleIds, toPublicLevelView } from "../src/levels/projection.js";
import type { LevelBlueprint } from "../src/levels/types.js";
import { validateGameLevelManifest, validateLevelAgainstRequest, validateLevelBlueprint } from "../src/levels/validator.js";

function copyLevel(): LevelBlueprint {
    return structuredClone(laptopInvestigationLevel);
}

function copyLevelSubmission(): Omit<LevelBlueprint, "schemaVersion"> {
    const { schemaVersion: _schemaVersion, ...blueprint } = copyLevel();
    return blueprint;
}

describe("level metadata v3", () => {
    it("returns the generated JSON file path in demo mode", async () => {
        const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "level-demo-"));
        const tool = createSubmitLevelBlueprintTool(repositoryPuzzleCatalog, undefined, outputDirectory);
        const result = await tool.execute("demo-tool-call", {
            mode: "demo",
            result: { status: "success", blueprint: copyLevelSubmission() }
        });
        const outputPath = path.join(outputDirectory, "investigate-alex-laptop.level.json");

        expect(result.content).toEqual([{ type: "text", text: `Level JSON: ${outputPath}` }]);
        expect(result.details.outputPath).toBe(outputPath);
        const savedLevel = JSON.parse(await readFile(outputPath, "utf8"));
        expect(savedLevel.id).toBe("investigate-alex-laptop");
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
        expect(validateLevelBlueprint(laptopInvestigationLevel, repositoryPuzzleCatalog)).toEqual([]);
        expect(validateLevelAgainstRequest(laptopInvestigationLevel, laptopInvestigationRequest, repositoryPuzzleCatalog)).toEqual([]);
    });

    it("keeps every checked-in generated level on the current schema", () => {
        for (const fileName of readdirSync("generated-levels").filter((name) => name.endsWith(".level.json"))) {
            const level = JSON.parse(readFileSync(path.join("generated-levels", fileName), "utf8"));
            expect(validateLevelBlueprint(level, repositoryPuzzleCatalog), fileName).toEqual([]);
        }
    });

    it("rejects cycles", () => {
        const level = copyLevel();
        level.puzzles[0].design.inputs.push({
            id: "password-cycle",
            source: { kind: "puzzle-output", puzzleId: "recover-password", outputId: "password" },
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
            "Puzzle output identify-employee.unused-room is not consumed downstream or by the terminal action."
        );
    });

    it("rejects identity transformations", () => {
        const level = copyLevel();
        level.puzzles[1].design.inputs[0].transform = { type: "uppercase" };
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toContain(
            "Transformation uppercase on find-account-name.employee-name does not change the source value; omit it."
        );
    });

    it("reveals initial puzzles and derives later availability from input sources", () => {
        expect(availablePuzzleIds(laptopInvestigationLevel, [])).toEqual(["identify-employee"]);
        const initial = toPublicLevelView(laptopInvestigationLevel);
        expect(initial.puzzles.map((puzzle) => puzzle.id)).toEqual(["identify-employee"]);
        expect(JSON.stringify(initial)).not.toContain("MORGAN REED");

        expect(availablePuzzleIds(laptopInvestigationLevel, ["identify-employee"])).toEqual(["find-account-name"]);
        expect(availablePuzzleIds(laptopInvestigationLevel, ["identify-employee", "find-account-name"])).toEqual(["recover-password"]);
        expect(toPublicLevelView(laptopInvestigationLevel, laptopInvestigationLevel.puzzles.map((puzzle) => puzzle.id)).terminalAction.available).toBe(true);
    });

    it("protects completed puzzle IDs in progress-preserving patches", () => {
        const errors = validateLevelPatch({
            levelId: laptopInvestigationLevel.id,
            baseSchemaVersion: laptopInvestigationLevel.schemaVersion,
            mode: "progress-preserving",
            completedPuzzleIds: ["identify-employee"],
            operations: [{
                op: "remove",
                path: "/puzzles/identify-employee",
                reason: "Invalid attempt to remove completed work."
            }]
        }, laptopInvestigationLevel);
        expect(errors).toContain("Progress-preserving patch cannot modify completed puzzle identify-employee.");
    });

    it("retries rejected design reviews", async () => {
        let designCalls = 0;
        const result = await generateReviewedLevel({
            request: laptopInvestigationRequest,
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
                { id: "laptop", prerequisiteLevelIds: [], levelFile: "laptop.level.json" },
                { id: "inbox", parentLevelId: "laptop", prerequisiteLevelIds: ["laptop"], levelFile: "inbox.level.json" }
            ]
        })).toEqual([]);
    });
});
