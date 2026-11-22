import { evaluateSavedGame } from "../features/game-evaluation/feedback.js";
import { readSavedGameBundle } from "../features/game-bundle/orchestration.js";

async function main(): Promise<void> {
    const [selector, ...extra] = process.argv.slice(2);
    if (!selector || extra.length > 0) {
        throw new Error("Usage: npm run game:evaluate-ready -- <game-id|game.bundle.json>");
    }
    const game = await readSavedGameBundle(selector);
    await evaluateSavedGame(game, { revise: false });
}

main().catch((error) => {
    process.stderr.write(`Game evaluation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
