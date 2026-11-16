import { readSelectedGame, levelFileFor, loadAndVerifyLevelBundle } from "./game-bundle-orchestration.js";

async function main(): Promise<void> {
    const [gameSelector, ...extraArguments] = process.argv.slice(2);
    if (gameSelector === undefined || extraArguments.length > 0) {
        throw new Error("Usage: npm run game:verify-ready -- <game-id|game-design-file>");
    }
    const { game } = await readSelectedGame(gameSelector);
    for (const [index, assignment] of game.levels.entries()) {
        const verified = await loadAndVerifyLevelBundle(levelFileFor(assignment.request.levelId));
        process.stdout.write(
            `[${index + 1}/${game.levels.length}] Verified ${verified.inputs.level.title}: ${verified.publicDirectory}\n`
        );
    }
    process.stdout.write(`Verified all ${game.levels.length} website-based level bundles for ${game.title}.\n`);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
