import { createBundlePreviewServer } from "../features/level-bundle/server.js";
import {
    campaignBriefingFor,
    findSavedGameBundle,
    levelFileFor,
    loadSavedGameLevel,
    loadAndVerifyLevelBundle,
    readSelectedGame
} from "../features/game-bundle/orchestration.js";

async function main(): Promise<void> {
    const [gameSelector, portArgument, ...extraArguments] = process.argv.slice(2);
    if (gameSelector === undefined || extraArguments.length > 0) {
        throw new Error("Usage: npm run game:serve-ready -- <game-id|game-design-file|game.bundle.json> [first-port]");
    }
    const firstPort = portArgument === undefined ? 4173 : Number(portArgument);
    if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65535) {
        throw new Error("The first port must be an integer from 1 to 65535.");
    }

    const saved = await findSavedGameBundle(gameSelector);
    const design = saved ? undefined : (await readSelectedGame(gameSelector)).game;
    const game = saved ?? design!;
    if (firstPort + game.levels.length - 1 > 65535) {
        throw new Error("The selected first port does not leave enough consecutive ports for every level.");
    }

    const loaded = saved
        ? await Promise.all(saved.levels.map((level) => loadSavedGameLevel(level, saved.outputRoot)))
        : await Promise.all(design!.levels.map(({ request }, index) =>
            loadAndVerifyLevelBundle(levelFileFor(request.levelId), index === 0 ? campaignBriefingFor(design!) : undefined)));
    const prepared = loaded.map((level, index) => ({ ...level, port: firstPort + index }));

    const servers = prepared.map((level, index) => {
        const next = prepared[index + 1];
        return createBundlePreviewServer({
            publicDirectory: level.publicDirectory,
            inputs: level.inputs,
            bundle: level.bundle,
            nextLevel: next === undefined ? undefined : {
                title: next.inputs.level.title,
                url: `http://127.0.0.1:${next.port}/`
            },
            gameComplete: next === undefined
        });
    });
    const closeAll = () => {
        for (const server of servers) if (server.listening) server.close();
    };
    process.once("SIGINT", closeAll);
    process.once("SIGTERM", closeAll);

    await Promise.all(servers.map((server, index) => new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(prepared[index].port, "127.0.0.1", resolve);
    })));
    process.stdout.write(`${game.title}: http://127.0.0.1:${firstPort}/\n`);
    for (const level of prepared) {
        process.stdout.write(`  ${level.inputs.level.title}: http://127.0.0.1:${level.port}/\n`);
    }
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
