import { readFileSync } from "node:fs";

import type { LevelBlueprint, LevelDesignRequest } from "../types.js";

const levelUrl = new URL("./open-web-example.level.json", import.meta.url);

export const openWebExampleLevel = JSON.parse(
    readFileSync(levelUrl, "utf8")
) as LevelBlueprint;

export const openWebExampleRequest: LevelDesignRequest = {
    levelId: openWebExampleLevel.id,
    titleHint: openWebExampleLevel.title,
    genre: openWebExampleLevel.genre,
    theme: openWebExampleLevel.setting.theme,
    setting: openWebExampleLevel.setting.location,
    startingSituation: openWebExampleLevel.startingSituation,
    playerRole: openWebExampleLevel.playerRole,
    playerCapabilities: openWebExampleLevel.playerCapabilities,
    playerConstraints: openWebExampleLevel.playerConstraints,
    environment: openWebExampleLevel.environment,
    narrativeContext: [
        "The city, organizations, webpages, and people in this investigation are fictional and project-controlled."
    ],
    startingInputs: openWebExampleLevel.startingInputs,
    externalContentRequirements: openWebExampleLevel.externalContentRequirements,
    requiredDiscoveries: [],
    terminalAction: {
        actionType: openWebExampleLevel.terminalAction.actionType,
        description: openWebExampleLevel.terminalAction.description,
        requiredOutputs: [{
            id: "coordinator",
            semanticRole: "person-identifier",
            dataType: "string"
        }]
    },
    catalogVersion: openWebExampleLevel.catalogVersion,
    config: openWebExampleLevel.generationConfig
};
