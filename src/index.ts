import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { createCaesarAgent } from "./agents/caesar/agent.js";
import { createMorseAgent } from "./agents/morse/agent.js";
import {
    isPrivatePuzzleInstance,
    type PrivatePuzzleInstance
} from "./core/types.js";

const generationRequest =  process.argv.slice(2).join(" ") || "Create one simple puzzle.";

const agent = await createCaesarAgent();

let generatedPuzzle: PrivatePuzzleInstance | undefined;

agent.subscribe((event: AgentEvent) => {
    if (event.type === "tool_execution_start") {
        process.stderr.write(`\n[Agent] Executing tool: ${event.toolName}\n`);
    }

    if (
        event.type === "tool_execution_end" &&
        event.toolName === "create_caesar_puzzle" &&
        !event.isError &&
        isPrivatePuzzleInstance(event.result.details)
    ) {
        generatedPuzzle = event.result.details;
    }
});

await agent.prompt(generationRequest);

if (!generatedPuzzle) {
    throw new Error(agent.state.errorMessage || "Failed to generate a puzzle.");
}

console.log(JSON.stringify(generatedPuzzle, null, 2));
