import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Register the tool and system-prompt section shared by simple puzzle extensions. */
export function registerPuzzleExtension(
    pi: ExtensionAPI,
    sectionName: string,
    systemPrompt: string,
    tool: AgentTool
): void {
    pi.registerTool(tool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections[sectionName] = systemPrompt;
    });
}
