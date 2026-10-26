import { readFileSync } from "node:fs";

import type { LevelBlueprint, LevelDesignRequest } from "../../src/levels/types.js";

const levelUrl = new URL("./level-v4.fixture.json", import.meta.url);

export const levelFixture = JSON.parse(
    readFileSync(levelUrl, "utf8")
) as LevelBlueprint;

export const levelRequestFixture: LevelDesignRequest = {
    levelId: levelFixture.id,
    titleHint: levelFixture.title,
    genre: levelFixture.genre,
    theme: levelFixture.setting.theme,
    setting: levelFixture.setting.location,
    startingSituation: levelFixture.startingSituation,
    playerRole: levelFixture.playerRole,
    playerCapabilities: levelFixture.playerCapabilities,
    playerConstraints: levelFixture.playerConstraints,
    environment: levelFixture.environment,
    narrativeContext: [
        "The city, organizations, webpages, and people in this investigation are fictional and project-controlled."
    ],
    startingInputs: levelFixture.startingInputs,
    externalContentRequirements: levelFixture.externalContentRequirements,
    requiredDiscoveries: [],
    terminalAction: {
        actionType: levelFixture.terminalAction.actionType,
        description: levelFixture.terminalAction.description,
        requiredOutputs: [{
            id: "coordinator",
            semanticRole: "person-identifier",
            dataType: "string"
        }]
    },
    catalogVersion: levelFixture.catalogVersion,
    config: levelFixture.generationConfig
};
