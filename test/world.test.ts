import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { readGameWorldFile, writeGameWorldFile } from "../src/world/io.js";
import type { GameWorld } from "../src/world/types.js";
import { assertGameWorld, validateGameWorld } from "../src/world/validator.js";

const WORLD_FIXTURE: GameWorld = {
    schemaVersion: "1.0.0",
    id: "test-world",
    revision: "1",
    entities: [
        { id: "person:rowan", type: "person", name: "Rowan Hale" },
        { id: "organization:archive", type: "organization", name: "Civic Archive" },
        { id: "object:archive-key", type: "object", name: "Archive Key" },
        { id: "site:archive", type: "site", name: "Civic Archive Portal" }
    ],
    facts: [
        {
            id: "fact:rowan-affiliation",
            subjectId: "person:rowan",
            relation: "works-for",
            value: { kind: "entity", entityId: "organization:archive" }
        },
        {
            id: "fact:archive-owner",
            subjectId: "site:archive",
            relation: "owned-by",
            value: { kind: "entity", entityId: "organization:archive" }
        },
        {
            id: "fact:key-label",
            subjectId: "object:archive-key",
            relation: "label",
            value: { kind: "literal", value: "Records Room" },
            validFrom: "2024-01-01"
        }
    ]
};

function copyWorld(): GameWorld {
    return structuredClone(WORLD_FIXTURE);
}

describe("game-world metadata", () => {
    it("validates fictional canon", () => {
        expect(validateGameWorld(WORLD_FIXTURE)).toEqual([]);
        expect(() => assertGameWorld(WORLD_FIXTURE)).not.toThrow();
    });

    it("rejects unsupported schema versions", () => {
        expect(validateGameWorld({ ...copyWorld(), schemaVersion: "2.0.0" })).toEqual([
            "Unsupported game-world schema version 2.0.0; expected 1.0.0."
        ]);
    });

    it("rejects duplicate entity and fact IDs", () => {
        const world = copyWorld();
        world.entities.push(structuredClone(world.entities[0]));
        world.facts.push(structuredClone(world.facts[0]));

        expect(validateGameWorld(world)).toEqual(expect.arrayContaining([
            "Duplicate world-entity ID: person:rowan.",
            "Duplicate world-fact ID: fact:rowan-affiliation."
        ]));
    });

    it("rejects missing subjects, missing targets, and self-relationships", () => {
        const world = copyWorld();
        world.facts.push({
            id: "fact:missing-subject",
            subjectId: "person:missing",
            relation: "owns",
            value: { kind: "entity", entityId: "site:missing" }
        });
        world.facts.push({
            id: "fact:self-reference",
            subjectId: "person:rowan",
            relation: "knows",
            value: { kind: "entity", entityId: "person:rowan" }
        });

        expect(validateGameWorld(world)).toEqual(expect.arrayContaining([
            "World fact fact:missing-subject references missing subject person:missing.",
            "World fact fact:missing-subject references missing entity site:missing.",
            "World fact fact:self-reference cannot relate an entity to itself."
        ]));
    });

    it("rejects invalid and reversed fact dates", () => {
        const world = copyWorld();
        world.facts.push({
            id: "fact:invalid-date",
            subjectId: "object:archive-key",
            relation: "registered-name",
            value: { kind: "literal", value: "MV Kestrel" },
            validFrom: "2024-02-30"
        });
        world.facts.push({
            id: "fact:reversed-range",
            subjectId: "object:archive-key",
            relation: "registered-name",
            value: { kind: "literal", value: "MV Kestrel" },
            validFrom: "2024-10-20",
            validTo: "2024-10-19"
        });

        expect(validateGameWorld(world)).toEqual(expect.arrayContaining([
            "World fact fact:invalid-date has invalid validFrom date 2024-02-30.",
            "World fact fact:reversed-range validFrom must not be later than validTo."
        ]));
    });

    it("writes and reads validated world files", async () => {
        const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "game-world-"));
        const outputPath = await writeGameWorldFile({
            world: WORLD_FIXTURE,
            outputDirectory
        });

        expect(outputPath).toBe(path.join(outputDirectory, "test-world.world.json"));
        expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(WORLD_FIXTURE);
        await expect(readGameWorldFile(outputPath)).resolves.toEqual(WORLD_FIXTURE);
    });

    it("refuses to read or write invalid worlds", async () => {
        const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "invalid-game-world-"));
        const filePath = path.join(outputDirectory, "invalid.world.json");
        await writeFile(filePath, JSON.stringify({ schemaVersion: "1.0.0" }), "utf8");

        await expect(readGameWorldFile(filePath)).rejects.toThrow("Invalid game world");
        await expect(writeGameWorldFile({
            world: { ...copyWorld(), facts: [{
                id: "fact:bad",
                subjectId: "missing",
                relation: "owns",
                value: { kind: "literal", value: true }
            }] },
            outputDirectory
        })).rejects.toThrow("references missing subject");
    });
});
