import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { createLevelDesignAgent } from "./agents/level-design/agent.js";
import type { LevelDesignSubmission } from "./agents/level-design/tool.js";
import { createProgressReporter, toolResultText } from "./core/progress.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";
import { loadLevelDesignInputs } from "./levels/io.js";

const progress = createProgressReporter();
const requestFile = process.argv[2];
if (requestFile === undefined || process.argv.length !== 3) {
    process.stderr.write("Usage: npm run level:design -- <level-request.json>\n");
    process.exitCode = 1;
} else {
    try {
        progress.start("Loading the level-design request");
        const inputs = await loadLevelDesignInputs({ requestFile });
        progress.start("Loading the level-design agent");
        const agent = await createLevelDesignAgent(repositoryPuzzleCatalog, inputs.request);
        progress.complete("Loaded the level-design agent");
        let submission: LevelDesignSubmission | undefined;
        let lastSubmissionError: string | undefined;
        let validationAttempt = 0;

        agent.subscribe((event: AgentEvent) => {
            if (event.type === "tool_execution_start" && event.toolName === "submit_level_design") {
                validationAttempt += 1;
                progress.start(`Validating the level design (attempt ${validationAttempt})`);
            }
            if (event.type === "tool_execution_end" && event.toolName === "submit_level_design" && !event.isError) {
                submission = event.result.details as LevelDesignSubmission;
                progress.complete("Completed level design");
            }
            if (event.type === "tool_execution_end" && event.toolName === "submit_level_design" && event.isError) {
                lastSubmissionError = toolResultText(event.result);
                progress.fail(
                    `Level-design validation attempt ${validationAttempt}`,
                    lastSubmissionError ?? "The submission was rejected."
                );
                progress.start("Revising the rejected level design");
            }
        });

        progress.start("Designing the level structure and puzzle progression");
        await agent.prompt("Create and submit the validated level design now.");
        if (submission === undefined) {
            throw new Error(
                lastSubmissionError
                || agent.state.errorMessage
                || "The Level Design Agent did not submit a result."
            );
        }
        process.stdout.write(`${submission.outputPath}\n`);
    } catch (error) {
        progress.fail("Level design", error);
        process.exitCode = 1;
    }
}
