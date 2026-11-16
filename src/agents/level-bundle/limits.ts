export const LEVEL_BUNDLE_STRUCTURAL_ROUTE_ALLOWANCE = 4;
export const LEVEL_BUNDLE_TERMINAL_ROUTE_ALLOWANCE = 1;
export const LEVEL_BUNDLE_TRUNCATED_SUBMISSION_LIMIT = 2;
export const LEVEL_BUNDLE_REPEATED_FAILURE_LIMIT = 3;

export interface SupportingItemRange {
    minimum: number;
    maximum: number;
}

export function scaledSupportingItemRange(options: {
    puzzleCount: number;
    minimumFloor: number;
    maximumFloor: number;
    minimumPerPuzzle: number;
    maximumPerPuzzle: number;
}): SupportingItemRange {
    const minimum = Math.max(options.minimumFloor, options.puzzleCount * options.minimumPerPuzzle);
    const maximum = Math.max(options.maximumFloor, options.puzzleCount * options.maximumPerPuzzle);
    if (minimum > maximum) {
        throw new Error(`Scaled supporting-item minimum ${minimum} cannot exceed maximum ${maximum}.`);
    }
    return { minimum, maximum };
}

function integerEnvironment(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
    return value;
}

export function configuredSupportingItemRange(puzzleCount: number): SupportingItemRange {
    const supportingItemsMinimum = integerEnvironment("LEVEL_BUNDLE_SUPPORTING_MIN", 10);
    const supportingItemsMaximum = integerEnvironment("LEVEL_BUNDLE_SUPPORTING_MAX", 15);
    if (supportingItemsMinimum > supportingItemsMaximum) {
        throw new Error("LEVEL_BUNDLE_SUPPORTING_MIN cannot exceed LEVEL_BUNDLE_SUPPORTING_MAX.");
    }
    const supportingItemsMinimumPerPuzzle = integerEnvironment(
        "LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MIN",
        2
    );
    const supportingItemsMaximumPerPuzzle = integerEnvironment(
        "LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MAX",
        3
    );
    if (supportingItemsMinimumPerPuzzle > supportingItemsMaximumPerPuzzle) {
        throw new Error(
            "LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MIN cannot exceed " +
            "LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MAX."
        );
    }
    return scaledSupportingItemRange({
        puzzleCount,
        minimumFloor: supportingItemsMinimum,
        maximumFloor: supportingItemsMaximum,
        minimumPerPuzzle: supportingItemsMinimumPerPuzzle,
        maximumPerPuzzle: supportingItemsMaximumPerPuzzle
    });
}

export function levelBundleRouteMaximum(
    puzzleCount: number,
    supportingItemsMaximum: number
): number {
    return levelBundleCoreRouteMaximum(puzzleCount) + supportingItemsMaximum;
}

export function levelBundleCoreRouteMaximum(puzzleCount: number): number {
    return puzzleCount
        + LEVEL_BUNDLE_STRUCTURAL_ROUTE_ALLOWANCE
        + LEVEL_BUNDLE_TERMINAL_ROUTE_ALLOWANCE;
}
