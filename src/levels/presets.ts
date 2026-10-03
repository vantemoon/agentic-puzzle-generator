import type { LevelGenerationConfig } from "./types.js";

export type PresetName = "easy" | "medium" | "hard";

export const LEVEL_PRESETS: Record<PresetName, LevelGenerationConfig> = {
    easy: {
        structuralDifficulty: {
            preset: "easy",
            puzzleCount: { minimum: 3, maximum: 5 },
            phaseCount: { minimum: 1, maximum: 2 },
            linearity: 0.9,
            maxParallelPuzzles: 2
        },
        puzzleDifficulty: { preset: "easy", hintPolicy: "explicit" },
        transformationPolicy: { enabled: true, maxCount: 1, maxDifficulty: "easy" },
        reviewRetryLimit: 2,
        concealUnreachedContent: true,
        encourageSubtypeVariety: true
    },
    medium: {
        structuralDifficulty: {
            preset: "medium",
            puzzleCount: { minimum: 5, maximum: 8 },
            phaseCount: { minimum: 2, maximum: 4 },
            linearity: 0.55,
            maxParallelPuzzles: 3
        },
        puzzleDifficulty: { preset: "medium", hintPolicy: "contextual" },
        transformationPolicy: { enabled: true, maxCount: 2, maxDifficulty: "medium" },
        reviewRetryLimit: 2,
        concealUnreachedContent: true,
        encourageSubtypeVariety: true
    },
    hard: {
        structuralDifficulty: {
            preset: "hard",
            puzzleCount: { minimum: 7, maximum: 12 },
            phaseCount: { minimum: 3, maximum: 6 },
            linearity: 0.25,
            maxParallelPuzzles: 5
        },
        puzzleDifficulty: { preset: "hard", hintPolicy: "hidden" },
        transformationPolicy: { enabled: true, maxCount: 3, maxDifficulty: "hard" },
        reviewRetryLimit: 2,
        concealUnreachedContent: true,
        encourageSubtypeVariety: true
    }
};

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export function resolveLevelConfig(
    preset: PresetName,
    overrides: DeepPartial<LevelGenerationConfig> = {}
): LevelGenerationConfig {
    const base = LEVEL_PRESETS[preset];
    return {
        ...base,
        ...overrides,
        structuralDifficulty: {
            ...base.structuralDifficulty,
            ...overrides.structuralDifficulty,
            puzzleCount: {
                ...base.structuralDifficulty.puzzleCount,
                ...overrides.structuralDifficulty?.puzzleCount
            },
            phaseCount: {
                ...base.structuralDifficulty.phaseCount,
                ...overrides.structuralDifficulty?.phaseCount
            }
        },
        puzzleDifficulty: {
            ...base.puzzleDifficulty,
            ...overrides.puzzleDifficulty
        },
        transformationPolicy: {
            ...base.transformationPolicy,
            ...overrides.transformationPolicy
        }
    };
}
