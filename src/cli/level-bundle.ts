import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
    createLevelBundleAgent,
    isLevelBundleToolName
} from "../features/level-bundle/agent/agent.js";
import type { LevelBundleSubmission } from "../features/level-bundle/agent/tool.js";
import { safeFileStem } from "../shared/utilities/file-names.js";
import { GAME_BUILD_OUTPUT_ROOT, gameBuildPaths } from "../shared/utilities/game-build-paths.js";
import { loadLevelBundleInputs } from "../features/level-bundle/inputs.js";
import { buildLevelBundle } from "../features/level-bundle/build.js";
import {
    BundleVerificationError,
    verifyLevelBundle
} from "../features/level-bundle/verify.js";
import { repositoryPuzzleCatalog } from "../features/puzzle-generation/catalog.js";
import { resolveModelConfiguration } from "../shared/agent-runtime/model.js";
import { promptAgentWithRecovery } from "../shared/agent-runtime/agent-runner.js";
import { createProgressReporter, toolResultText } from "../shared/agent-runtime/progress.js";
import { configuredSupportingItemRange } from "../features/level-bundle/limits.js";
import { generateSupportingMedia } from "../features/supporting-media/coordinator.js";

const progress = createProgressReporter();

function closeLog(stream: ReturnType<typeof createWriteStream>): Promise<void> {
    return new Promise((resolve, reject) => {
        stream.once("error", reject);
        stream.end(resolve);
    });
}

const bundleToolProgress: Record<string, string> = {
    submit_bundle_structure: "Validating bundle structure",
    add_bundle_routes: "Adding required bundle routes",
    add_supporting_routes: "Adding supporting content routes",
    replace_bundle_route: "Revising a bundle route",
    replace_bundle_site: "Revising a bundle site",
    add_supporting_media_requests: "Planning supporting media",
    replace_supporting_media_request: "Revising a supporting-media request",
    finalize_level_bundle: "Finalizing the bundle plan"
};

async function main(): Promise<void> {
    const [levelFile, ...extraArguments] = process.argv.slice(2);
    if (levelFile === undefined || extraArguments.length > 0) {
        throw new Error("Usage: npm run level:bundle -- <level-file>");
    }

    const paths = gameBuildPaths(process.env[GAME_BUILD_OUTPUT_ROOT]);
    const inputs = await loadLevelBundleInputs({
        levelFile,
        worldDirectory: paths.worldDirectory,
        generatedPuzzleDirectory: paths.generatedPuzzleDirectory,
        catalog: repositoryPuzzleCatalog
    });
    const supportingRange = configuredSupportingItemRange(inputs.puzzles.length);
    const options = {
        seed: process.env.LEVEL_BUNDLE_SEED || `${inputs.level.id}-bundle-v1`,
        supportingItemsMinimum: supportingRange.minimum,
        supportingItemsMaximum: supportingRange.maximum
    };
    const modelSelection = resolveModelConfiguration("level-bundle");
    const logDirectory = path.resolve("generation-logs", safeFileStem(inputs.level.id));
    await mkdir(logDirectory, { recursive: true });
    const logPath = path.join(logDirectory, `${new Date().toISOString().replaceAll(":", "-")}.bundle.jsonl`);
    const log = createWriteStream(logPath, { flags: "a" });
    const startedAt = Date.now();
    const record = (kind: string, details: unknown = {}): void => {
        log.write(`${JSON.stringify({
            timestamp: new Date().toISOString(),
            elapsedMs: Date.now() - startedAt,
            kind,
            details
        })}\n`);
    };
    record("bundle-start", {
        levelId: inputs.level.id,
        model: modelSelection,
        options
    });
    progress.start("Loading the level-bundle agent");
    const agent = await createLevelBundleAgent(inputs, repositoryPuzzleCatalog, options, paths.bundleDirectory);
    progress.complete("Loaded the level-bundle agent");
    let submission: LevelBundleSubmission | undefined;
    let lastSubmissionError: string | undefined;
    agent.subscribe((event: AgentEvent) => {
        if (event.type !== "message_update") record("agent-event", event);
        if (event.type === "tool_execution_start") {
            const message = bundleToolProgress[event.toolName];
            if (message !== undefined) progress.start(message);
        }
        if (event.type === "tool_execution_end" && event.toolName === "finalize_level_bundle" && !event.isError) {
            submission = event.result.details as LevelBundleSubmission;
        }
        if (event.type === "tool_execution_end" && isLevelBundleToolName(event.toolName) && event.isError) {
            lastSubmissionError = toolResultText(event.result);
        }
    });

    progress.start(`Planning level bundle: ${inputs.level.title}`);
    try {
        await promptAgentWithRecovery(agent, "Create and submit the validated level bundle now.", {
            preserveConversationOnRetry: true,
            retryPrompt: "The previous provider request timed out or failed transiently. Continue from the existing staged level bundle and complete the next required repair or finalization step. Do not recreate accepted sites, routes, or media requests.",
            onRetry: (attempt, error) => progress.start(
                `Retrying level-bundle model call (attempt ${attempt}): ${error.message}`
            )
        });
        if (submission === undefined) {
            throw new Error(
                lastSubmissionError
                || agent.state.errorMessage
                || "The Level Bundle Agent did not submit a bundle."
            );
        }
        progress.complete("Completed bundle planning");
        let currentSubmission = submission;
        const maximumVerificationAttempts = 3;
        for (let verificationAttempt = 1; verificationAttempt <= maximumVerificationAttempts; verificationAttempt += 1) {
            const mediaResults = await generateSupportingMedia({
                bundle: currentSubmission.bundle,
                inputs,
                rootDirectory: paths.worldMediaDirectory,
                onStatus: (status) => status.state === "start"
                    ? progress.start(status.message)
                    : progress.complete(status.message),
                onEvent: (event, request) => {
                    if (event.type !== "message_update") {
                        record("supporting-media-agent-event", { requestId: request.id, event });
                    }
                }
            });
            record("supporting-media-complete", {
                verificationAttempt,
                generated: mediaResults.filter((result) => result.status === "generated").length,
                reused: mediaResults.filter((result) => result.status === "reused").length,
                assets: mediaResults.map((result) => result.asset.id)
            });
            progress.start("Building the public level bundle");
            const build = await buildLevelBundle({
                bundle: currentSubmission.bundle,
                inputs,
                catalog: repositoryPuzzleCatalog,
                outputDirectory: paths.bundleDirectory,
                worldMediaDirectory: paths.worldMediaDirectory
            });
            record("bundle-built", {
                verificationAttempt,
                publicDirectory: build.publicDirectory,
                reportPath: build.reportPath
            });
            progress.complete("Built the public level bundle");
            progress.start(`Verifying the level bundle (attempt ${verificationAttempt})`);
            try {
                const verification = await verifyLevelBundle({
                    bundle: currentSubmission.bundle,
                    inputs,
                    publicDirectory: build.publicDirectory,
                    privateDirectory: build.privateDirectory,
                    supportingItemsMaximum: options.supportingItemsMaximum
                });
                record("bundle-complete", { verification: verification.status, verificationAttempt });
                progress.complete("Verified the level bundle");
                progress.complete("Completed level-bundle generation");
                process.stdout.write(`Level bundle plan: ${currentSubmission.outputPath}\n`);
                process.stdout.write(`Public level bundle: ${build.publicDirectory}\n`);
                process.stdout.write(`Private build report: ${build.reportPath}\n`);
                process.stdout.write(`Bundle verification: ${verification.status}\n`);
                process.stdout.write(`Preview command: npm run level:preview-bundle -- ${levelFile}\n`);
                return;
            } catch (error) {
                if (!(error instanceof BundleVerificationError)
                    || verificationAttempt === maximumVerificationAttempts) throw error;
                record("bundle-verification-rejected", {
                    verificationAttempt,
                    issues: error.report.issues
                });
                progress.fail(`Bundle verification attempt ${verificationAttempt}`, error);
                progress.start("Redirecting verification issues to the level-bundle agent");
                submission = undefined;
                await promptAgentWithRecovery(agent, [
                    "The built bundle failed deterministic post-build verification.",
                    "Repair every issue in the existing staged bundle. Preserve puzzle artifacts, answers, story canon, site IDs, base paths, route roles, and valid content.",
                    "Use replace_bundle_site for site-wide identity or visual-profile leaks, replace_bundle_route for route issues, and replace_supporting_media_request for media-request issues. Then call finalize_level_bundle again.",
                    `Verification report:\n${JSON.stringify(error.report.issues, null, 2)}`
                ].join("\n\n"), {
                    preserveConversationOnRetry: true,
                    retryPrompt: "The previous provider request timed out or failed transiently. Continue repairing the existing staged level bundle from the current verification feedback. Do not recreate accepted content."
                });
                if (submission === undefined) {
                    throw new Error(
                        lastSubmissionError
                        || agent.state.errorMessage
                        || "The Level Bundle Agent did not submit a repaired bundle."
                    );
                }
                currentSubmission = submission;
                progress.complete("Repaired the bundle plan after verification feedback");
            }
        }
    } catch (error) {
        record("bundle-error", { message: error instanceof Error ? error.message : String(error) });
        throw error;
    } finally {
        await closeLog(log);
    }
}

main().catch((error) => {
    progress.fail("Level-bundle generation", error);
    process.exitCode = 1;
});
