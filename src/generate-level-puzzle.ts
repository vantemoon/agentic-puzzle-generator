import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { createProgressReporter } from "./core/progress.js";
import { isRetryableModelError } from "./core/model.js";
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

const progressReporter = createProgressReporter();

async function readLevel(filePath: string): Promise<LevelBlueprint> {
    const level = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    assertLevelBlueprint(level, repositoryPuzzleCatalog);
    return level;
}

async function discoverLevels(directory = "generated-levels"): Promise<LevelBlueprint[]> {
    const absoluteDirectory = path.resolve(directory);
    let entries;
    try {
        entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            throw new Error(`No generated level directory exists at ${absoluteDirectory}. Pass a level file explicitly.`);
        }
        throw error;
    }
    const choices: LevelBlueprint[] = [];
    for (const entry of entries.filter((candidate) => candidate.isFile() && candidate.name.endsWith(".level.json")).sort((a, b) => a.name.localeCompare(b.name))) {
        const filePath = path.join(absoluteDirectory, entry.name);
        try {
            const level = await readLevel(filePath);
            if (availablePuzzles(level).length > 0) choices.push(level);
        } catch (error) {
            progressReporter.fail(`Loading level ${entry.name}`, error);
        }
    }
    if (choices.length === 0) {
        throw new Error(`No valid generated levels were found in ${absoluteDirectory}. Pass a level file explicitly.`);
    }
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

interface CommandArguments {
    levelArgument?: string;
    puzzleArgument?: string;
    all: boolean;
    force: boolean;
}

function parseCommandArguments(args: string[]): CommandArguments {
    const positionals: string[] = [];
    let all = false;
    let force = false;
    for (const argument of args) {
        if (argument === "--all") {
            if (all) throw new Error("--all may be specified only once.");
            all = true;
        } else if (argument === "--force") {
            if (force) throw new Error("--force may be specified only once.");
            force = true;
        } else if (argument.startsWith("-")) {
            throw new Error(`Unknown option: ${argument}.`);
        } else {
            positionals.push(argument);
        }
    }
    if (positionals.length > 2 || (all && positionals.length > 1)) {
        throw new Error(
            "Usage: npm run level:generate-puzzle -- [level-file] [puzzle-id] [--force]\n"
            + "       npm run level:generate-puzzle -- [level-file] --all [--force]"
        );
    }
    return {
        levelArgument: positionals[0],
        puzzleArgument: positionals[1],
        all,
        force
    };
}

async function generateOnePuzzle(
    level: LevelBlueprint,
    puzzle: PuzzleNode,
    progress?: string
): Promise<void> {
    const handoff = createPuzzleGenerationHandoff(level, puzzle.id, repositoryPuzzleCatalog);
    const prefix = progress === undefined ? "" : `${progress} `;
    progressReporter.start(`${prefix}Generating puzzle: ${puzzle.title}`);
    const generated = await generatePuzzleFromHandoff(handoff);
    progressReporter.start(`${prefix}Writing puzzle artifacts: ${puzzle.title}`);
    const outputPath = await writeGeneratedPuzzle(level.id, generated);
    const artifactPath = generatedPuzzleArtifactEntryPath(level.id, generated);
    progressReporter.complete(`${prefix}Completed puzzle: ${puzzle.title}`);
    process.stdout.write(`Generated puzzle metadata: ${outputPath}\n`);
    process.stdout.write(`Generated deployable artifact: ${artifactPath}\n`);
}

async function generatePuzzleWithRetry(
    level: LevelBlueprint,
    puzzle: PuzzleNode,
    progress?: string
): Promise<void> {
    try {
        await generateOnePuzzle(level, puzzle, progress);
    } catch (error) {
        if (!isRetryableModelError(error)) throw error;
        const prefix = progress === undefined ? "" : `${progress} `;
        progressReporter.start(`${prefix}Retrying puzzle after a temporary model-availability error: ${puzzle.title}`);
        await generateOnePuzzle(level, puzzle, progress);
    }
}

async function generateAllPuzzles(
    level: LevelBlueprint,
    force: boolean
): Promise<void> {
    const puzzles = availablePuzzles(level);
    if (puzzles.length === 0) throw new Error(`Level ${level.id} has no supported production puzzles.`);
    const failures: Array<{ puzzle: PuzzleNode; message: string }> = [];
    let generatedCount = 0;
    let skippedCount = 0;

    for (const [index, puzzle] of puzzles.entries()) {
        const destination = generatedPuzzlePath(level.id, puzzle.id);
        if (!force && await fileExists(destination)) {
            skippedCount += 1;
            progressReporter.complete(`[${index + 1}/${puzzles.length}] Skipped puzzle already generated: ${puzzle.title}`);
            continue;
        }
        try {
            await generatePuzzleWithRetry(level, puzzle, `[${index + 1}/${puzzles.length}]`);
            generatedCount += 1;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push({ puzzle, message });
            progressReporter.fail(`[${index + 1}/${puzzles.length}] Puzzle generation for ${puzzle.title}`, message);
        }
    }

    process.stdout.write(
        `Puzzle generation summary: ${generatedCount} generated, ${skippedCount} skipped, ${failures.length} failed.\n`
    );
    if (failures.length > 0) {
        throw new Error(`One or more puzzles could not be generated:\n${failures
            .map(({ puzzle, message }) => `- ${puzzle.id}: ${message}`)
            .join("\n")}`);
    }
}

async function main(): Promise<void> {
    const { levelArgument, puzzleArgument, all, force } = parseCommandArguments(process.argv.slice(2));

    let level: LevelBlueprint;
    if (levelArgument === undefined) {
        const levels = await discoverLevels();
        level = await choose("Select a level", levels, (candidate) => `${candidate.title} (${candidate.id})`);
    } else {
        level = await readLevel(path.resolve(levelArgument));
    }

    if (all) {
        await generateAllPuzzles(level, force);
        return;
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
    if (await fileExists(destination) && !force && !await confirmOverwrite(destination)) {
        throw new Error(`Generated puzzle already exists at ${destination}.`);
    }

    await generatePuzzleWithRetry(level, puzzle);
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
    progressReporter.fail("Puzzle generation", error);
    process.exitCode = 1;
});
