import { loadLevelBundleInputs } from "./levels/bundle-inputs.js";
import { buildLevelBundle } from "./levels/bundle-build.js";
import { levelBundlePlanPath, readLevelBundleFile } from "./levels/bundle-io.js";
import { createBundlePreviewServer } from "./levels/bundle-server.js";
import { verifyLevelBundle } from "./levels/bundle-verify.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";

async function main(): Promise<void> {
    const [levelFile, portArgument, ...extraArguments] = process.argv.slice(2);
    if (levelFile === undefined || extraArguments.length > 0) {
        throw new Error("Usage: npm run level:preview-bundle -- <level-file> [port]");
    }
    const port = portArgument === undefined ? 4173 : Number(portArgument);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Preview port must be an integer from 1 to 65535.");

    const inputs = await loadLevelBundleInputs({ levelFile, catalog: repositoryPuzzleCatalog });
    const bundle = await readLevelBundleFile({
        filePath: levelBundlePlanPath(inputs.level.id),
        level: inputs.level,
        catalog: repositoryPuzzleCatalog
    });
    const build = await buildLevelBundle({ bundle, inputs, catalog: repositoryPuzzleCatalog });
    await verifyLevelBundle({
        bundle,
        inputs,
        publicDirectory: build.publicDirectory,
        privateDirectory: build.privateDirectory
    });
    const server = createBundlePreviewServer({ publicDirectory: build.publicDirectory, inputs });
    server.listen(port, "127.0.0.1", () => {
        process.stdout.write(`Level bundle preview: http://127.0.0.1:${port}/\n`);
    });
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
