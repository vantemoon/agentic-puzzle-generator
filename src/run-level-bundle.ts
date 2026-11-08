import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
    createLevelBundleAgent,
    isLevelBundleToolName
} from "./agents/level-bundle/agent.js";
import type { LevelBundleSubmission } from "./agents/level-bundle/tool.js";
import { loadLevelBundleInputs } from "./levels/bundle-inputs.js";
import { buildLevelBundle } from "./levels/bundle-build.js";
import { verifyLevelBundle } from "./levels/bundle-verify.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";
import { resolveModelConfiguration } from "./core/model.js";
import { createProgressReporter, toolResultText } from "./core/progress.js";
import { scaledSupportingItemRange } from "./agents/level-bundle/limits.js";
import { generateSupportingMedia } from "./agents/supporting-media/coordinator.js";

const progress = createProgressReporter();

function safeFileStem(id: string): string {
    const stem = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (stem.length === 0) throw new Error("Level ID cannot be converted to a safe filename.");
    return stem;
}

function closeLog(stream: ReturnType<typeof createWriteStream>): Promise<void> {
    return new Promise((resolve, reject) => {
        stream.once("error", reject);
        stream.end(resolve);
    });
}

function integerEnvironment(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
    return value;
}

const bundleToolProgress: Record<string, string> = {
    submit_bundle_structure: "Validating bundle structure",
    add_bundle_routes: "Adding required bundle routes",
    add_supporting_routes: "Adding supporting content routes",
    replace_bundle_route: "Revising a bundle route",
    add_supporting_media_requests: "Planning supporting media",
    replace_supporting_media_request: "Revising a supporting-media request",
    finalize_level_bundle: "Finalizing the bundle plan"
};

async function main(): Promise<void> {
    const [levelFile, ...extraArguments] = process.argv.slice(2);
    if (levelFile === undefined || extraArguments.length > 0) {
        throw new Error("Usage: npm run level:bundle -- <level-file>");
    }

    const inputs = await loadLevelBundleInputs({
        levelFile,
        catalog: repositoryPuzzleCatalog
    });
    const supportingItemsMinimum = integerEnvironment("LEVEL_BUNDLE_SUPPORTING_MIN", 10);
    const supportingItemsMaximum = integerEnvironment("LEVEL_BUNDLE_SUPPORTING_MAX", 15);
    if (supportingItemsMinimum > supportingItemsMaximum) {
        throw new Error("LEVEL_BUNDLE_SUPPORTING_MIN cannot exceed LEVEL_BUNDLE_SUPPORTING_MAX.");
    }
    const supportingItemsMinimumPerPuzzle = integerEnvironment(
        "LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MIN",
        2
    );
    const supportingItemsMaximumPerPuzzle = integerEnvironment(
        "LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MAX",
        3
    );
    if (supportingItemsMinimumPerPuzzle > supportingItemsMaximumPerPuzzle) {
        throw new Error(
            "LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MIN cannot exceed " +
            "LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MAX."
        );
    }
    const supportingRange = scaledSupportingItemRange({
        puzzleCount: inputs.puzzles.length,
        minimumFloor: supportingItemsMinimum,
        maximumFloor: supportingItemsMaximum,
        minimumPerPuzzle: supportingItemsMinimumPerPuzzle,
        maximumPerPuzzle: supportingItemsMaximumPerPuzzle
    });
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
    const agent = await createLevelBundleAgent(inputs, repositoryPuzzleCatalog, options);
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
        await agent.prompt("Create and submit the validated level bundle now.");
        if (submission === undefined) {
            throw new Error(
                lastSubmissionError
                || agent.state.errorMessage
                || "The Level Bundle Agent did not submit a bundle."
            );
        }
        progress.complete("Completed bundle planning");
        const mediaResults = await generateSupportingMedia({
            bundle: submission.bundle,
            inputs,
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
            generated: mediaResults.filter((result) => result.status === "generated").length,
            reused: mediaResults.filter((result) => result.status === "reused").length,
            assets: mediaResults.map((result) => result.asset.id)
        });
        progress.start("Building the public level bundle");
        const build = await buildLevelBundle({
            bundle: submission.bundle,
            inputs,
            catalog: repositoryPuzzleCatalog
        });
        record("bundle-built", { publicDirectory: build.publicDirectory, reportPath: build.reportPath });
        progress.complete("Built the public level bundle");
        progress.start("Verifying the level bundle");
        const verification = await verifyLevelBundle({
            bundle: submission.bundle,
            inputs,
            publicDirectory: build.publicDirectory,
            privateDirectory: build.privateDirectory,
            supportingItemsMinimum: options.supportingItemsMinimum,
            supportingItemsMaximum: options.supportingItemsMaximum
        });
        record("bundle-complete", { verification: verification.status });
        progress.complete("Verified the level bundle");
        progress.complete("Completed level-bundle generation");
        process.stdout.write(`Level bundle plan: ${submission.outputPath}\n`);
        process.stdout.write(`Public level bundle: ${build.publicDirectory}\n`);
        process.stdout.write(`Private build report: ${build.reportPath}\n`);
        process.stdout.write(`Bundle verification: ${verification.status}\n`);
        process.stdout.write(`Preview command: npm run level:preview-bundle -- ${levelFile}\n`);
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
