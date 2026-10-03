import type { LevelBlueprint, PuzzleInput, PuzzleNode } from "./types.js";

export interface PublicPuzzleMetadata {
    id: string;
    phaseId: string;
    title: string;
    purpose: string;
    puzzleType: string;
    subtype: string;
    difficulty: PuzzleNode["design"]["difficulty"];
    hintPolicy: PuzzleNode["design"]["hintPolicy"];
    inputs: PuzzleInput[];
    outputs: Array<{ id: string; semanticRole: string; description: string }>;
    verificationPrompt: string;
    status: "available" | "completed";
}

export interface PublicLevelView {
    schemaVersion: string;
    id: string;
    title: string;
    summary: string;
    genre: "online-investigation";
    setting: LevelBlueprint["setting"];
    startingSituation: string;
    visiblePhases: LevelBlueprint["phases"];
    puzzles: PublicPuzzleMetadata[];
    terminalAction: {
        id: string;
        actionType: string;
        title: string;
        description: string;
        fields: Array<{ id: string; label: string }>;
        available: boolean;
    };
}

export function availablePuzzleIds(level: LevelBlueprint, completedPuzzleIds: Iterable<string>): string[] {
    const completed = new Set(completedPuzzleIds);
    return level.puzzles
        .filter((puzzle) => !completed.has(puzzle.id))
        .filter((puzzle) => puzzle.design.inputs.every((input) =>
            input.source.kind === "starting-input" || completed.has(input.source.puzzleId)
        ))
        .map((puzzle) => puzzle.id);
}

export function toPublicLevelView(
    level: LevelBlueprint,
    completedPuzzleIds: Iterable<string> = []
): PublicLevelView {
    const completed = new Set(completedPuzzleIds);
    const available = new Set(availablePuzzleIds(level, completed));
    const visiblePuzzleIds = level.generationConfig.concealUnreachedContent
        ? new Set([...completed, ...available])
        : new Set(level.puzzles.map((puzzle) => puzzle.id));
    const visiblePuzzles = level.puzzles.filter((puzzle) => visiblePuzzleIds.has(puzzle.id));
    const visiblePhaseIds = new Set(visiblePuzzles.map((puzzle) => puzzle.phaseId));
    const terminalAvailable = level.terminalAction.fields.every((field) => completed.has(field.source.puzzleId));

    return {
        schemaVersion: level.schemaVersion,
        id: level.id,
        title: level.title,
        summary: level.summary,
        genre: level.genre,
        setting: level.setting,
        startingSituation: level.startingSituation,
        visiblePhases: level.phases.filter((phase) => visiblePhaseIds.has(phase.id)),
        puzzles: visiblePuzzles.map((puzzle) => ({
            id: puzzle.id,
            phaseId: puzzle.phaseId,
            title: puzzle.title,
            purpose: puzzle.purpose,
            puzzleType: puzzle.design.puzzleType,
            subtype: puzzle.design.subtype,
            difficulty: puzzle.design.difficulty,
            hintPolicy: puzzle.design.hintPolicy,
            inputs: puzzle.design.inputs,
            outputs: puzzle.design.outputs.map((output) => ({
                id: output.id,
                semanticRole: output.semanticRole,
                description: output.description
            })),
            verificationPrompt: puzzle.design.verification.prompt,
            status: completed.has(puzzle.id) ? "completed" : "available"
        })),
        terminalAction: {
            id: level.terminalAction.id,
            actionType: level.terminalAction.actionType,
            title: level.terminalAction.title,
            description: level.terminalAction.description,
            fields: level.terminalAction.fields.map((field) => ({ id: field.id, label: field.label })),
            available: terminalAvailable
        }
    };
}
