import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { SUBSTITUTION_SYSTEM_PROMPT } from "../src/agents/substitution/prompt.js";
import { createSubstitutionPuzzleTool } from "../src/agents/substitution/tool.js";

export default function substitutionExtension(pi: ExtensionAPI) {
    pi.registerTool(createSubstitutionPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["substitution-agent"] = SUBSTITUTION_SYSTEM_PROMPT;
    });
}
