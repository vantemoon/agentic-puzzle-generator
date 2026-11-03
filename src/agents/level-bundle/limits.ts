export const LEVEL_BUNDLE_STRUCTURAL_ROUTE_ALLOWANCE = 4;
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

export function levelBundleRouteMaximum(
    puzzleCount: number,
    supportingItemsMaximum: number
): number {
    return puzzleCount + supportingItemsMaximum + LEVEL_BUNDLE_STRUCTURAL_ROUTE_ALLOWANCE;
}
