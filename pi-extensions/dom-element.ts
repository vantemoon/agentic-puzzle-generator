import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { DOM_ELEMENT_SYSTEM_PROMPT } from "../src/agents/dom-element/prompt.js";
import { createDomElementPuzzleTool } from "../src/agents/dom-element/tool.js";

export default function domElementExtension(pi: ExtensionAPI) {
  pi.registerTool(createDomElementPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["dom-element-agent"] = DOM_ELEMENT_SYSTEM_PROMPT;
  });
}
