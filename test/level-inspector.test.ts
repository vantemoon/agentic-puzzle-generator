import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { repositoryPuzzleCatalog } from "../src/levels/catalog.js";
import { validateLevelBlueprint } from "../src/levels/validator.js";

const inspectorPath = path.resolve("tools/level-inspector/index.html");
const defaultLevelPath = path.resolve("src/levels/examples/open-web-example.level.json");

describe("level metadata inspector", () => {
    it("is a self-contained interactive HTML inspector", () => {
        const html = readFileSync(inspectorPath, "utf8");
        expect(html).toContain("id=\"file-input\"");
        expect(html).toContain("id=\"graph\"");
        expect(html).toContain("id=\"side-content\"");
        expect(html).toContain("id=\"type-legend\"");
        expect(html).toContain("id=\"connection-legend\"");
        expect(html).toContain("renderTypeLegend()");
        expect(html).toContain("data passed directly");
        expect(html).toContain("investigator transforms data");
        expect(html).toContain("transform-node");
        expect(html).toContain("TERMINAL ACTION");
        expect(html).toContain("Content mockup");
        expect(html).toContain("Answer required from the player");
        expect(html).toContain("Data required by this puzzle");
        expect(html).toContain("Where this result is used next");
        expect(html).toContain("function titleLines");
        expect(html).toContain("multilineText(g,lines");
        expect(html).toContain("class=\"contract\"");
        expect(html).not.toContain("required-concepts");
        expect(html).not.toContain("directConnections");
        expect(html).not.toContain("prerequisiteEdges");
        expect(html).not.toContain("dataBindings");
        expect(html).not.toMatch(/<script[^>]+src=/);

        const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
        expect(scripts).toHaveLength(1);
        expect(() => new Function(scripts[0][1])).not.toThrow();
    });

    it("uses a valid, moderately connected open-web level by default", () => {
        const html = readFileSync(inspectorPath, "utf8");
        const match = html.match(/const SAMPLE_LEVEL=(\{.*\});\n\s*const \$/);
        expect(match).not.toBeNull();

        const level = JSON.parse(match?.[1] ?? "{}");
        const sourceLevel = JSON.parse(readFileSync(defaultLevelPath, "utf8"));
        expect(level.title).toBe("Community Cleanup Records");
        expect(level.environment.mode).toBe("external-public");
        expect(level.generationConfig.structuralDifficulty.linearity).toBe(0.5);
        expect(level.puzzles.some((puzzle: { design: { inputs: unknown[] } }) => puzzle.design.inputs.length > 1)).toBe(true);
        expect(level).toEqual(sourceLevel);
        expect(validateLevelBlueprint(level, repositoryPuzzleCatalog)).toEqual([]);
    });
});
