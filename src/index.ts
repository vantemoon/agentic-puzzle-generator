import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { createCaesarAgent } from "./agents/caesar/agent.js";
import { createProgressReporter } from "./core/progress.js";
import {
    isPrivatePuzzleInstance,
    type PrivatePuzzleInstance
} from "./core/types.js";

const generationRequest =  process.argv.slice(2).join(" ") || "Create one simple puzzle.";
const progress = createProgressReporter();

async function main(): Promise<void> {
    progress.start("Loading the puzzle agent");
    const agent = await createCaesarAgent();
    progress.complete("Loaded the puzzle agent");

    let generatedPuzzle: PrivatePuzzleInstance | undefined;

    agent.subscribe((event: AgentEvent) => {
        if (event.type === "tool_execution_start" && event.toolName === "create_caesar_puzzle") {
            progress.start("Validating the generated puzzle");
        }

        if (
            event.type === "tool_execution_end" &&
            event.toolName === "create_caesar_puzzle" &&
            !event.isError &&
            isPrivatePuzzleInstance(event.result.details)
        ) {
            generatedPuzzle = event.result.details;
            progress.complete("Completed puzzle generation");
        }
    });

    progress.start("Generating the puzzle");
    await agent.prompt(generationRequest);

    if (!generatedPuzzle) {
        throw new Error(agent.state.errorMessage || "The puzzle agent did not generate a puzzle.");
    }

    process.stdout.write(`${JSON.stringify(generatedPuzzle, null, 2)}\n`);
}

main().catch((error) => {
    progress.fail("Puzzle generation", error);
    process.exitCode = 1;
});
