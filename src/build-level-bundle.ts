import { loadLevelBundleInputs } from "./levels/bundle-inputs.js";
import { buildLevelBundle } from "./levels/bundle-build.js";
import { levelBundlePlanPath, readLevelBundleFile } from "./levels/bundle-io.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";

async function main(): Promise<void> {
    const [levelFile, ...extraArguments] = process.argv.slice(2);
    if (levelFile === undefined || extraArguments.length > 0) {
        throw new Error("Usage: npm run level:build-bundle -- <level-file>");
    }
    const inputs = await loadLevelBundleInputs({ levelFile, catalog: repositoryPuzzleCatalog });
    const bundle = await readLevelBundleFile({
        filePath: levelBundlePlanPath(inputs.level.id),
        level: inputs.level,
        catalog: repositoryPuzzleCatalog
    });
    const result = await buildLevelBundle({ bundle, inputs, catalog: repositoryPuzzleCatalog });
    process.stdout.write(`Public level bundle: ${result.publicDirectory}\n`);
    process.stdout.write(`Private build report: ${result.reportPath}\n`);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
