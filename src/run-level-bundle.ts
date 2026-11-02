import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createLevelBundleAgent } from "./agents/level-bundle/agent.js";
import type { LevelBundleSubmission } from "./agents/level-bundle/tool.js";
import { loadLevelBundleInputs } from "./levels/bundle-inputs.js";
import { buildLevelBundle } from "./levels/bundle-build.js";
import { verifyLevelBundle } from "./levels/bundle-verify.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";
import { resolveModelConfiguration } from "./core/model.js";

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
    const options = {
        seed: process.env.LEVEL_BUNDLE_SEED || `${inputs.level.id}-bundle-v1`,
        supportingItemsMinimum,
        supportingItemsMaximum
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
    process.stderr.write(`Using ${modelSelection.providerId}/${modelSelection.modelId}.\n`);
    process.stderr.write(`Generation log: ${logPath}\n`);
    const agent = await createLevelBundleAgent(inputs, repositoryPuzzleCatalog, options);
    let submission: LevelBundleSubmission | undefined;
    agent.subscribe((event: AgentEvent) => {
        if (event.type !== "message_update") record("agent-event", event);
        if (event.type === "tool_execution_start") {
            process.stderr.write(`Agent is validating ${event.toolName} after ${Math.round((Date.now() - startedAt) / 1000)}s...\n`);
        }
        if (event.type === "tool_execution_end" && event.toolName === "submit_level_bundle" && !event.isError) {
            submission = event.result.details as LevelBundleSubmission;
        }
    });

    process.stderr.write(`Planning bundle for ${inputs.level.title}...\n`);
    const heartbeat = setInterval(() => {
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
        process.stderr.write(`Still waiting for the bundle agent (${elapsedSeconds}s)...\n`);
        record("heartbeat", { elapsedSeconds });
    }, 15_000);
    try {
        await agent.prompt("Create and submit the validated level bundle now.");
        if (submission === undefined) {
            throw new Error(agent.state.errorMessage || "The Level Bundle Agent did not submit a bundle.");
        }
        const build = await buildLevelBundle({
            bundle: submission.bundle,
            inputs,
            catalog: repositoryPuzzleCatalog
        });
        record("bundle-built", { publicDirectory: build.publicDirectory, reportPath: build.reportPath });
        const verification = await verifyLevelBundle({
            bundle: submission.bundle,
            inputs,
            publicDirectory: build.publicDirectory,
            privateDirectory: build.privateDirectory,
            supportingItemsMinimum,
            supportingItemsMaximum
        });
        record("bundle-complete", { verification: verification.status });
        process.stdout.write(`Level bundle plan: ${submission.outputPath}\n`);
        process.stdout.write(`Public level bundle: ${build.publicDirectory}\n`);
        process.stdout.write(`Private build report: ${build.reportPath}\n`);
        process.stdout.write(`Bundle verification: ${verification.status}\n`);
    } catch (error) {
        record("bundle-error", { message: error instanceof Error ? error.message : String(error) });
        throw error;
    } finally {
        clearInterval(heartbeat);
        await closeLog(log);
    }
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
