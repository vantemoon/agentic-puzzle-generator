import type { AgentEvent } from "@earendil-works/pi-agent-core";

import { createLevelBundleAgent } from "./agents/level-bundle/agent.js";
import type { LevelBundleSubmission } from "./agents/level-bundle/tool.js";
import { loadLevelBundleInputs } from "./levels/bundle-inputs.js";
import { buildLevelBundle } from "./levels/bundle-build.js";
import { verifyLevelBundle } from "./levels/bundle-verify.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";

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
    const agent = await createLevelBundleAgent(inputs, repositoryPuzzleCatalog, options);
    let submission: LevelBundleSubmission | undefined;
    agent.subscribe((event: AgentEvent) => {
        if (event.type === "tool_execution_end" && event.toolName === "submit_level_bundle" && !event.isError) {
            submission = event.result.details as LevelBundleSubmission;
        }
    });

    process.stderr.write(`Planning bundle for ${inputs.level.title}...\n`);
    await agent.prompt("Create and submit the validated level bundle now.");
    if (submission === undefined) {
        throw new Error(agent.state.errorMessage || "The Level Bundle Agent did not submit a bundle.");
    }
    const build = await buildLevelBundle({
        bundle: submission.bundle,
        inputs,
        catalog: repositoryPuzzleCatalog
    });
    const verification = await verifyLevelBundle({
        bundle: submission.bundle,
        inputs,
        publicDirectory: build.publicDirectory,
        privateDirectory: build.privateDirectory,
        supportingItemsMinimum,
        supportingItemsMaximum
    });
    process.stdout.write(`Level bundle plan: ${submission.outputPath}\n`);
    process.stdout.write(`Public level bundle: ${build.publicDirectory}\n`);
    process.stdout.write(`Private build report: ${build.reportPath}\n`);
    process.stdout.write(`Bundle verification: ${verification.status}\n`);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
