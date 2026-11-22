import { Agent } from "../../../shared/agent-runtime/recovering-agent.js";

import { loadKadiModel } from "../../../shared/agent-runtime/model.js";
import type { LevelBlueprint, LevelDesignRequest } from "../../level-design/types.js";
import { buildLevelReviewPrompt } from "./prompt.js";
import { createSubmitLevelReviewTool } from "./tool.js";

export async function createLevelReviewAgent(
    level: LevelBlueprint,
    request: LevelDesignRequest,
    attempt: number
): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel("level-review");
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
