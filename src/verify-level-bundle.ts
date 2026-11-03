import path from "node:path";

import { loadLevelBundleInputs } from "./levels/bundle-inputs.js";
import { levelBundlePlanPath, readLevelBundleFile } from "./levels/bundle-io.js";
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
        throw new Error("Usage: npm run level:verify-bundle -- <level-file>");
    }
    const inputs = await loadLevelBundleInputs({ levelFile, catalog: repositoryPuzzleCatalog });
    const planPath = levelBundlePlanPath(inputs.level.id);
    const bundle = await readLevelBundleFile({
        filePath: planPath,
        level: inputs.level,
        catalog: repositoryPuzzleCatalog,
        world: inputs.world
    });
    const rootDirectory = path.dirname(planPath);
    const report = await verifyLevelBundle({
        bundle,
        inputs,
        publicDirectory: path.join(rootDirectory, "public"),
        privateDirectory: path.join(rootDirectory, "private"),
        supportingItemsMinimum: integerEnvironment("LEVEL_BUNDLE_SUPPORTING_MIN", 10),
        supportingItemsMaximum: integerEnvironment("LEVEL_BUNDLE_SUPPORTING_MAX", 15)
    });
    process.stdout.write(`Bundle verification: ${report.status} (${report.routeCount} routes, ${report.assetCount} assets)\n`);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
