import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import type { LevelBlueprint, LevelDesignRequest } from "../../levels/types.js";
import { buildLevelReviewPrompt } from "./prompt.js";
import { createSubmitLevelReviewTool } from "./tool.js";

export async function createLevelReviewAgent(
    level: LevelBlueprint,
    request: LevelDesignRequest,
    attempt: number
): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();
    return new Agent({
        initialState: {
            systemPrompt: buildLevelReviewPrompt(level, request, attempt),
            model,
            thinkingLevel: "off",
            tools: [createSubmitLevelReviewTool({ levelId: level.id, attempt })]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
