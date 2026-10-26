import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { createBinaryCapitalizationPuzzle } from "../src/agents/binary-capitalization/engine.js";
import { createHtmlCommentPuzzle } from "../src/agents/html-comment/engine.js";
import { repositoryPuzzleCatalog } from "../src/levels/catalog.js";
import { openWebExampleLevel } from "../src/levels/examples/open-web-example.js";
import {
    buildPuzzleGenerationPrompt,
    createPuzzleGenerationHandoff,
    generatedPuzzleArtifactEntryPath,
    generatedPuzzlePath,
    stopAfterSuccessfulTool,
    supportedPuzzleGeneratorSubtypes,
    validateGeneratedPuzzle,
    writeGeneratedPuzzle
} from "../src/levels/puzzle-generation.js";

describe("level-to-puzzle generation handoff", () => {
    it("registers one agent for every catalog subtype", () => {
        expect(new Set(supportedPuzzleGeneratorSubtypes())).toEqual(
            new Set(repositoryPuzzleCatalog.entries.map((entry) => entry.subtype))
        );
    });

    it("keeps agent-generated visual artwork out of upstream level specifications", () => {
        const entry = repositoryPuzzleCatalog.entries.find((candidate) => candidate.subtype === "visual-clue");
        const properties = (entry?.generationSpecSchema as { properties?: Record<string, unknown> }).properties;

        expect(properties).toBeDefined();
        expect(properties).not.toHaveProperty("backgroundElements");
        expect(properties).not.toHaveProperty("clueElements");
        expect(properties).not.toHaveProperty("showClueLabel");
    });

    it("builds a production handoff for the selected puzzle", () => {
        const handoff = createPuzzleGenerationHandoff(
            openWebExampleLevel,
            "find-project-name",
            repositoryPuzzleCatalog
        );

        expect(handoff.generatorTool).toBe("create_html_comment_puzzle");
        expect(handoff.generationSpec).toEqual({
            mode: "production",
            id: "find-project-name",
            intendedSolution: "RIVER CLEANUP",
            visibleTitle: "Weekend Volunteer Notice",
            visibleBody: "Volunteers are invited to help with a riverbank cleanup. The project name was removed from the visible notice during an update.",});
        expect(buildPuzzleGenerationPrompt(handoff)).toContain(JSON.stringify(handoff.generationSpec, null, 2));
    });

    it("accepts generator normalization without changing the designed answer", () => {
        const handoff = createPuzzleGenerationHandoff(
            openWebExampleLevel,
            "find-project-name",
            repositoryPuzzleCatalog
        );
        const puzzle = createHtmlCommentPuzzle({
            id: "find-project-name",
            intendedSolution: "RIVER CLEANUP",
            visibleTitle: "Weekend Volunteer Notice",
            visibleBody: "Volunteers are invited to help with a riverbank cleanup. The project name was removed from the visible notice during an update.",});

        expect(puzzle.solution.canonical).toBe("RIVER CLEANUP");
        expect(validateGeneratedPuzzle(handoff, puzzle)).toBe(puzzle);
    });

    it("asks the visual-clue agent to author a contextual drawing plan", () => {
        const prompt = buildPuzzleGenerationPrompt({
            levelId: "level",
            puzzleId: "visual",
            puzzleType: "hidden-information",
            subtype: "visual-clue",
            generatorTool: "create_visual_clue_puzzle",
            generationSpec: {
                mode: "production",
                id: "visual",
                intendedSolution: "PIN",
                sceneTitle: "Repair Bench",
                sceneTheme: "cluttered bicycle repair workshop",
                sceneDescription: "Tools hang above a workbench.",
                clueKind: "object",
                clueLabel: "PIN"
            },
            verification: { prompt: "Answer", dataType: "string", expectedValue: "PIN" }
        });

        expect(prompt).toContain("decide showClueLabel from visual ambiguity");
        expect(prompt).not.toContain("exactly this JSON object");
    });

    it("rejects a generated puzzle for the wrong node", () => {
        const handoff = createPuzzleGenerationHandoff(
            openWebExampleLevel,
            "find-project-name",
            repositoryPuzzleCatalog
        );
        const puzzle = createHtmlCommentPuzzle({
            id: "different-id",
            intendedSolution: "RIVER CLEANUP",
            visibleTitle: "Weekend Volunteer Notice",
            visibleBody: "Volunteers are invited to help with a riverbank cleanup.",});

        expect(() => validateGeneratedPuzzle(handoff, puzzle)).toThrow("does not match find-project-name");
    });

    it("rejects demo specifications before dispatch", () => {
        const level = structuredClone(openWebExampleLevel);
        level.puzzles[0].design.generationSpec.mode = "demo";

        expect(() => createPuzzleGenerationHandoff(
            level,
            "find-project-name",
            repositoryPuzzleCatalog
        )).toThrow("must use a production generationSpec");
    });

    it("writes private metadata and a deployable artifact for HTML and text puzzles", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "generated-puzzles-"));
        const htmlPuzzle = createHtmlCommentPuzzle({
            id: "web-clue",
            intendedSolution: "RIVER CLEANUP",
            visibleTitle: "Weekend Volunteer Notice",
            visibleBody: "The project name was removed during an update.",});
        const textPuzzle = createBinaryCapitalizationPuzzle({
            id: "memo-clue",
            intendedSolution: "NORTH",
            genre: "access memo",
            carrierText: "Crews present badges at dusk while a supervisor checks every work order."
        });

        try {
            await writeGeneratedPuzzle("test-level", htmlPuzzle, root);
            await writeGeneratedPuzzle("test-level", textPuzzle, root);

            await expect(readFile(generatedPuzzlePath("test-level", "web-clue", root), "utf8"))
                .resolves.toContain('"id": "web-clue"');
            await expect(readFile(generatedPuzzleArtifactEntryPath("test-level", htmlPuzzle, root), "utf8"))
                .resolves.toContain("<!doctype html>");
            await expect(readFile(generatedPuzzleArtifactEntryPath("test-level", textPuzzle, root), "utf8"))
                .resolves.toBe(textPuzzle.artifact.kind === "text" ? textPuzzle.artifact.source : "");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("terminates the agent loop after the expected tool succeeds", async () => {
        type Hook = NonNullable<import("@earendil-works/pi-agent-core").Agent["afterToolCall"]>;
        const agent: { afterToolCall?: Hook } = {};
        stopAfterSuccessfulTool(agent, "create_caesar_puzzle");
        const context = {
            toolCall: { name: "create_caesar_puzzle" },
            isError: false
        } as Parameters<Hook>[0];

        await expect(agent.afterToolCall?.(context)).resolves.toEqual({ terminate: true });
        await expect(agent.afterToolCall?.({
            ...context,
            toolCall: { ...context.toolCall, name: "another_tool" }
        })).resolves.toBeUndefined();
        await expect(agent.afterToolCall?.({ ...context, isError: true })).resolves.toBeUndefined();
    });
});
