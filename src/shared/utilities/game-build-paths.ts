import path from "node:path";

export const GAME_BUILD_OUTPUT_ROOT = "GAME_BUILD_OUTPUT_ROOT";

export function gameBuildPaths(root = ".") {
    return {
        worldDirectory: path.resolve(root, "worlds"),
        requestDirectory: path.resolve(root, "level-requests"),
        levelDirectory: path.resolve(root, "generated-levels"),
        generatedPuzzleDirectory: path.resolve(root, "generated-puzzles"),
        bundleDirectory: path.resolve(root, "generated-bundles"),
        worldMediaDirectory: path.resolve(root, "generated-world-media")
    };
}
