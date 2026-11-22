import { readFile } from "node:fs/promises";
import {
    campaignBriefingFor, findSavedGameBundle, readSelectedGame, levelFileFor, loadAndVerifyLevelBundle, loadSavedGameLevel, verifySavedGameLevel
} from "../features/game-bundle/orchestration.js";
import { assertBlindPlaytest, playtestCandidate, verifyGameInteractions } from "../features/game-bundle/playability.js";

async function main(): Promise<void> {
    const [gameSelector, mode, report, ...extraArguments] = process.argv.slice(2);
    if (gameSelector === undefined || extraArguments.length > 0
        || (mode !== undefined && mode !== "--technical-only" && mode !== "--playtest")
        || ((mode === "--playtest") !== (report !== undefined))) {
        throw new Error("Usage: npm run game:verify-ready -- <game-id|game-design-file|game.bundle.json> [--technical-only | --playtest <report.json>]");
    }
    const saved = await findSavedGameBundle(gameSelector);
    const loaded = saved ? undefined : await readSelectedGame(gameSelector);
    const levels = saved
        ? await Promise.all(saved.levels.map(async (entry) => {
            const level = await loadSavedGameLevel(entry, saved.outputRoot);
            await verifySavedGameLevel(level);
            return level;
        }))
        : await Promise.all(loaded!.game.levels.map(({ request }, index) =>
            loadAndVerifyLevelBundle(levelFileFor(request.levelId), index === 0 ? campaignBriefingFor(loaded!.game) : undefined)));
    const game = saved ?? loaded!.game;
    for (const [index, level] of levels.entries()) {
        process.stdout.write(`[${index + 1}/${levels.length}] Verified ${level.inputs.level.title}: ${level.publicDirectory}\n`);
    }
    const authored = levels.some(({ inputs }) => inputs.level.investigationQuestion !== undefined);
    if (mode !== undefined || authored) await verifyGameInteractions(levels);
    const candidate = await playtestCandidate((saved?.gameId ?? loaded!.game.id), levels);
    process.stdout.write(`Playtest fingerprint: ${candidate.fingerprint}\n`);
    if (report !== undefined) {
        assertBlindPlaytest(JSON.parse(await readFile(report, "utf8")), candidate, levels);
        process.stdout.write(`Ready: ${game.title} passed technical verification and blind playtest review.\n`);
    } else if (mode === "--technical-only" || !authored) {
        process.stdout.write("Technical verification passed. Blind playtest approval is pending.\n");
    } else {
        throw new Error("Blind playtest approval is required. Serve the candidate and pass the independent report with --playtest.");
    }
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
