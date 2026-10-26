import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { repositoryPuzzleCatalog } from "./levels/catalog.js";
import {
    createPuzzleGenerationHandoff,
    generatePuzzleFromHandoff,
    generatedPuzzleArtifactEntryPath,
    generatedPuzzlePath,
    supportedPuzzleGeneratorSubtypes,
    writeGeneratedPuzzle
} from "./levels/puzzle-generation.js";
import type { LevelBlueprint, PuzzleNode } from "./levels/types.js";
import { assertLevelBlueprint } from "./levels/validator.js";

const DEFAULT_LEVEL_PATH = "src/levels/examples/open-web-example.level.json";

async function readLevel(filePath: string): Promise<LevelBlueprint> {
    const level = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    assertLevelBlueprint(level, repositoryPuzzleCatalog);
    return level;
}

async function discoverLevels(directory = "generated-levels"): Promise<LevelBlueprint[]> {
    const absoluteDirectory = path.resolve(directory);
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    const choices: LevelBlueprint[] = [];
    for (const entry of entries.filter((candidate) => candidate.isFile() && candidate.name.endsWith(".level.json")).sort((a, b) => a.name.localeCompare(b.name))) {
        const filePath = path.join(absoluteDirectory, entry.name);
        try {
            const level = await readLevel(filePath);
            if (availablePuzzles(level).length > 0) choices.push(level);
        } catch (error) {
            process.stderr.write(`Skipping invalid level ${entry.name}: ${error instanceof Error ? error.message : String(error)}\n`);
        }
    }
    if (choices.length === 0) choices.push(await readLevel(path.resolve(DEFAULT_LEVEL_PATH)));
    return choices;
}

const supportedSubtypes = new Set(supportedPuzzleGeneratorSubtypes());

function availablePuzzles(level: LevelBlueprint): PuzzleNode[] {
    return level.puzzles.filter((puzzle) =>
        puzzle.design.generationSpec.mode === "production" && supportedSubtypes.has(puzzle.design.subtype)
    );
}

async function choose<T>(
    prompt: string,
    choices: T[],
    describe: (choice: T, index: number) => string
): Promise<T> {
    if (!input.isTTY || !output.isTTY) throw new Error("Interactive selection requires a terminal.");
    if (choices.length === 0) throw new Error(`No ${prompt.toLowerCase()} options are available.`);
    const readline = createInterface({ input, output });
    try {
        while (true) {
            output.write(`\n${prompt}:\n\n`);
            choices.forEach((choice, index) => output.write(`  ${index + 1}. ${describe(choice, index)}\n`));
            const answer = await readline.question("\nChoice: ");
            const index = Number(answer) - 1;
            if (Number.isInteger(index) && index >= 0 && index < choices.length) return choices[index];
            output.write(`Enter a number from 1 to ${choices.length}.\n`);
        }
    } finally {
        readline.close();
    }
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function confirmOverwrite(filePath: string): Promise<boolean> {
    if (!input.isTTY || !output.isTTY) return false;
    const readline = createInterface({ input, output });
    try {
        const answer = await readline.question(`A generated puzzle already exists at ${filePath}. Overwrite it? [y/N] `);
        return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
    } finally {
        readline.close();
    }
}

async function main(): Promise<void> {
    const [levelArgument, puzzleArgument, ...extraArguments] = process.argv.slice(2);
    if (extraArguments.length > 0) {
        throw new Error("Usage: npm run level:generate-puzzle -- [level-file] [puzzle-id]");
    }

    let level: LevelBlueprint;
    if (levelArgument === undefined) {
        const levels = await discoverLevels();
        level = await choose("Select a level", levels, (candidate) => `${candidate.title} (${candidate.id})`);
    } else {
        level = await readLevel(path.resolve(levelArgument));
    }

    let puzzle: PuzzleNode;
    if (puzzleArgument === undefined) {
        await populateGeneratedStatuses(level);
        puzzle = await choose("Select a puzzle", availablePuzzles(level), (candidate) => {
            const destination = generatedPuzzlePath(level.id, candidate.id);
            const status = requireGeneratedStatus(destination);
            return `${candidate.title} — ${candidate.design.subtype} [${status}]`;
        });
    } else {
        const found = level.puzzles.find((candidate) => candidate.id === puzzleArgument);
        if (found === undefined) throw new Error(`Level ${level.id} has no puzzle named ${puzzleArgument}.`);
        puzzle = found;
    }

    const destination = generatedPuzzlePath(level.id, puzzle.id);
    if (await fileExists(destination) && !await confirmOverwrite(destination)) {
        throw new Error(`Generated puzzle already exists at ${destination}.`);
    }

    const handoff = createPuzzleGenerationHandoff(level, puzzle.id, repositoryPuzzleCatalog);
    process.stderr.write(`Generating ${puzzle.title} with ${handoff.subtype} agent...\n`);
    const generated = await generatePuzzleFromHandoff(handoff);
    const outputPath = await writeGeneratedPuzzle(level.id, generated);
    const artifactPath = generatedPuzzleArtifactEntryPath(level.id, generated);
    process.stdout.write(`Generated puzzle metadata: ${outputPath}\n`);
    process.stdout.write(`Generated deployable artifact: ${artifactPath}\n`);
}

function requireGeneratedStatus(filePath: string): "generated" | "not generated" {
    return generatedPaths.has(filePath) ? "generated" : "not generated";
}

const generatedPaths = new Set<string>();

async function populateGeneratedStatuses(level: LevelBlueprint): Promise<void> {
    await Promise.all(level.puzzles.map(async (puzzle) => {
        const filePath = generatedPuzzlePath(level.id, puzzle.id);
        if (await fileExists(filePath)) generatedPaths.add(filePath);
    }));
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
