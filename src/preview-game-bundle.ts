import type { GameDesignSpec } from "./game-design/types.js";
import { createBundlePreviewServer } from "./levels/bundle-server.js";
import {
    levelFileFor,
    loadAndVerifyLevelBundle,
    readSelectedGame
} from "./game-bundle-orchestration.js";

async function main(): Promise<void> {
    const [gameSelector, portArgument, ...extraArguments] = process.argv.slice(2);
    if (gameSelector === undefined || extraArguments.length > 0) {
        throw new Error("Usage: npm run game:serve-ready -- <game-id|game-design-file> [first-port]");
    }
    const firstPort = portArgument === undefined ? 4173 : Number(portArgument);
    if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65535) {
        throw new Error("The first port must be an integer from 1 to 65535.");
    }

    const { game } = await readSelectedGame(gameSelector);
    if (firstPort + game.levels.length - 1 > 65535) {
        throw new Error("The selected first port does not leave enough consecutive ports for every level.");
    }

    const prepared: Array<{
        assignment: GameDesignSpec["levels"][number];
        inputs: Awaited<ReturnType<typeof loadAndVerifyLevelBundle>>["inputs"];
        bundle: Awaited<ReturnType<typeof loadAndVerifyLevelBundle>>["bundle"];
        publicDirectory: string;
        port: number;
    }> = [];
    for (const [index, assignment] of game.levels.entries()) {
        const verified = await loadAndVerifyLevelBundle(levelFileFor(assignment.request.levelId));
        prepared.push({ assignment, ...verified, port: firstPort + index });
    }

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
