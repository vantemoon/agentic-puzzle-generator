import { generateSupportingMedia } from "./agents/supporting-media/coordinator.js";
import { loadLevelBundleInputs } from "./levels/bundle-inputs.js";
import { levelBundlePlanPath, readLevelBundleFile } from "./levels/bundle-io.js";
import { repositoryPuzzleCatalog } from "./levels/catalog.js";

async function main(): Promise<void> {
    const [levelFile, ...extraArguments] = process.argv.slice(2);
    if (levelFile === undefined || extraArguments.length > 0) {
        throw new Error("Usage: npm run level:generate-media -- <level-file>");
    }
    const inputs = await loadLevelBundleInputs({
        levelFile,
        catalog: repositoryPuzzleCatalog
    });
    const bundle = await readLevelBundleFile({
        filePath: levelBundlePlanPath(inputs.level.id),
        level: inputs.level,
        catalog: repositoryPuzzleCatalog,
        world: inputs.world
    });
    const results = await generateSupportingMedia({
        bundle,
        inputs,
        onStatus: (message) => process.stderr.write(`${message}\n`)
    });
    process.stdout.write(
        `Supporting media: ${results.filter((result) => result.status === "generated").length} generated, `
        + `${results.filter((result) => result.status === "reused").length} reused.\n`
    );
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
