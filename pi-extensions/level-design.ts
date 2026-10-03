import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { buildLevelDesignPrompt } from "../src/agents/level-design/prompt.js";
import { createSubmitLevelBlueprintTool } from "../src/agents/level-design/tool.js";
import { repositoryPuzzleCatalog } from "../src/levels/catalog.js";

export default function levelDesignExtension(pi: ExtensionAPI) {
    pi.registerTool(createSubmitLevelBlueprintTool(repositoryPuzzleCatalog));
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["level-design-agent"] = buildLevelDesignPrompt(repositoryPuzzleCatalog);
    });
}
