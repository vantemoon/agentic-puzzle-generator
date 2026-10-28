import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadLevelDesignInputs } from "../src/levels/io.js";
import type { LevelDesignRequest, WorldReference } from "../src/levels/types.js";
import { validateLevelDesignRequest } from "../src/levels/validator.js";
import { resolveLevelWorld, validateWorldReference } from "../src/levels/world.js";
import type { GameWorld } from "../src/world/types.js";
import { levelRequestFixture } from "./fixtures/level-v5.js";

const WORLD: GameWorld = {
    schemaVersion: "1.0.0",
    id: "test-world",
    revision: "1",
    entities: [
        { id: "organization:library", type: "organization", name: "Riverside Public Library" },
        { id: "place:history-room", type: "place", name: "Local History Room" },
        { id: "object:photo-album", type: "object", name: "Community Center Photo Album" }
    ],
    facts: [
        {
            id: "fact:album-location",
            subjectId: "object:photo-album",
            relation: "stored-in",
            value: { kind: "entity", entityId: "place:history-room" },
            validFrom: "2025-09-01"
        }
    ]
};

const REFERENCE: WorldReference = {
    id: WORLD.id,
    revision: WORLD.revision,
    entityIds: ["object:photo-album", "place:history-room"],
    factIds: ["fact:album-location"],
    asOf: "2026-04-12"
};

function request(): LevelDesignRequest {
    return { ...structuredClone(levelRequestFixture), world: structuredClone(REFERENCE) };
}

describe("level world references", () => {
    it("resolves a self-contained world projection", () => {
        expect(validateWorldReference(REFERENCE, WORLD)).toEqual([]);
        expect(resolveLevelWorld(REFERENCE, WORLD)).toEqual({
            id: "test-world",
            revision: "1",
            asOf: "2026-04-12",
            entities: [WORLD.entities[1], WORLD.entities[2]],
            facts: WORLD.facts
        });
    });

    it("rejects mismatched, missing, and incomplete references", () => {
        expect(validateWorldReference({
            ...REFERENCE,
            id: "another-world",
            revision: "2",
            entityIds: ["object:photo-album"],
            factIds: ["fact:album-location", "fact:missing"]
        }, WORLD)).toEqual(expect.arrayContaining([
            "World reference ID another-world does not match loaded world test-world.",
            "World reference revision 2 does not match loaded revision 1.",
            "Referenced fact fact:album-location requires unselected entity place:history-room.",
            "World reference includes missing fact fact:missing."
        ]));
    });

    it("rejects facts outside the selected date", () => {
        expect(validateWorldReference({ ...REFERENCE, asOf: "2025-08-31" }, WORLD)).toContain(
            "Referenced fact fact:album-location is not valid as of 2025-08-31."
        );
    });

    it("requires a valid world reference in every level-design request", () => {
        const validRequest = request();
        expect(validateLevelDesignRequest(validRequest)).toEqual([]);
        expect(validateLevelDesignRequest({ ...validRequest, world: undefined })).toEqual([
            "Level-design request does not satisfy the canonical schema."
        ]);

        validRequest.world.entityIds.push(validRequest.world.entityIds[0]);
        expect(validateLevelDesignRequest(validRequest)).toContain(
            "Duplicate referenced world-entity ID: object:photo-album."
        );
    });

    it("loads a request and resolves its world file by ID", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "level-world-"));
        const worldDirectory = path.join(root, "worlds");
        await mkdir(worldDirectory);
        const requestFile = path.join(root, "level.request.json");
        await writeFile(requestFile, JSON.stringify(request()), "utf8");
        await writeFile(
            path.join(worldDirectory, "test-world.world.json"),
            JSON.stringify(WORLD),
            "utf8"
        );

        const loaded = await loadLevelDesignInputs({ requestFile, worldDirectory });
        expect(loaded.request.world).toEqual(REFERENCE);
        expect(loaded.world).toEqual(WORLD);
        expect(loaded.context.facts).toEqual(WORLD.facts);
        expect(loaded.worldFile).toBe(path.join(worldDirectory, "test-world.world.json"));
    });
});
