import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { HTML_COMMENT_SYSTEM_PROMPT } from "./prompt.js";
import { createHtmlCommentPuzzleTool } from "./tool.js";

export async function createHtmlCommentAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel({ kind: "puzzle", subtype: "html-comment" });

    return new Agent({
        initialState: {
            systemPrompt: HTML_COMMENT_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createHtmlCommentPuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}
