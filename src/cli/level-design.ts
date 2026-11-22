import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { createLevelDesignAgent } from "../features/level-design/agent/agent.js";
import { GAME_BUILD_OUTPUT_ROOT, gameBuildPaths } from "../shared/utilities/game-build-paths.js";
import type { LevelDesignSubmission } from "../features/level-design/agent/tool.js";
import { promptAgentWithRecovery } from "../shared/agent-runtime/agent-runner.js";
import { createProgressReporter, toolResultText } from "../shared/agent-runtime/progress.js";
import { repositoryPuzzleCatalog } from "../features/puzzle-generation/catalog.js";
import { loadLevelDesignInputs } from "../features/level-design/io.js";

const progress = createProgressReporter();
const requestFile = process.argv[2];
if (requestFile === undefined || process.argv.length !== 3) {
    process.stderr.write("Usage: npm run level:design -- <level-request.json>\n");
    process.exitCode = 1;
} else {
    try {
        progress.start("Loading the level-design request");
        const paths = gameBuildPaths(process.env[GAME_BUILD_OUTPUT_ROOT]);
        const inputs = await loadLevelDesignInputs({ requestFile, worldDirectory: paths.worldDirectory });
        progress.start("Loading the level-design agent");
        const agent = await createLevelDesignAgent(repositoryPuzzleCatalog, inputs.request, paths.levelDirectory);
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
                if (submission.result.status === "success") progress.complete("Completed level design");
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
        await promptAgentWithRecovery(agent, "Create and submit the validated level design now.", {
            onRetry: (attempt, error) => progress.start(
                `Retrying level-design model call (attempt ${attempt}): ${error.message}`
            )
        });
        if (submission === undefined) {
            throw new Error(
                lastSubmissionError
                || agent.state.errorMessage
                || "The Level Design Agent did not submit a result."
            );
        }
        if (submission.result.status === "needs-game-design-revision") {
            throw new Error(`Game design needs revision for ${submission.result.requestId}: ${submission.result.message}\n`
                + `Blocked requirement: ${submission.result.blockedRequirement}\nRevision report: ${submission.outputPath}`);
        }
        process.stdout.write(`${submission.outputPath}\n`);
    } catch (error) {
        progress.fail("Level design", error);
        process.exitCode = 1;
    }
}
