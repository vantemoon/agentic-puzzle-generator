import type { PuzzleCatalog } from "./catalog.js";
import { LEVEL_SCHEMA_VERSION, type LevelBlueprint, type LevelDesignFailure, type LevelDesignRequest, type LevelReview } from "./types.js";
import { validateLevelAgainstRequest } from "./validator.js";

export interface RevisionFeedback {
    attempt: number;
    deterministicErrors: string[];
    review?: LevelReview;
}

export type LevelDesigner = (
    request: LevelDesignRequest,
    catalog: PuzzleCatalog,
    feedback?: RevisionFeedback
) => Promise<LevelBlueprint>;

export type LevelReviewer = (
    level: LevelBlueprint,
    request: LevelDesignRequest,
    attempt: number
) => Promise<LevelReview>;

export type ReviewedLevelResult =
    | { status: "success"; level: LevelBlueprint; review: LevelReview; attempts: number }
    | { status: "needs-game-design-revision"; failure: LevelDesignFailure; attempts: number };

export async function generateReviewedLevel(options: {
    request: LevelDesignRequest;
    catalog: PuzzleCatalog;
    design: LevelDesigner;
    review: LevelReviewer;
}): Promise<ReviewedLevelResult> {
    const maximumAttempts = options.request.config.reviewRetryLimit + 1;
    let feedback: RevisionFeedback | undefined;
    let latestLevel: LevelBlueprint | undefined;
    let latestReview: LevelReview | undefined;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        latestLevel = await options.design(options.request, options.catalog, feedback);
        const deterministicErrors = validateLevelAgainstRequest(latestLevel, options.request, options.catalog);
        if (deterministicErrors.length > 0) {
            feedback = { attempt, deterministicErrors };
            continue;
        }

        latestReview = await options.review(latestLevel, options.request, attempt);
        if (latestReview.levelId !== latestLevel.id || latestReview.attempt !== attempt) {
            throw new Error("Reviewer returned metadata for the wrong level or attempt.");
        }
        if (latestReview.accepted && latestReview.issues.some((issue) => issue.severity === "error")) {
            throw new Error("Reviewer cannot accept a level while reporting error-severity issues.");
        }
        if (latestReview.accepted) return { status: "success", level: latestLevel, review: latestReview, attempts: attempt };
        feedback = { attempt, deterministicErrors: [], review: latestReview };
    }

    const lastProblems = feedback?.deterministicErrors.length
        ? feedback.deterministicErrors.join("; ")
        : feedback?.review?.issues.map((issue) => issue.message).join("; ") ?? "unknown review failure";
    return {
        status: "needs-game-design-revision",
        attempts: maximumAttempts,
        failure: {
            schemaVersion: LEVEL_SCHEMA_VERSION,
            status: "needs-game-design-revision",
            requestId: options.request.levelId,
            reasonCode: "review-exhausted",
            message: `Level generation failed after ${maximumAttempts} attempts: ${lastProblems}`,
            blockedRequirement: lastProblems,
            attemptedAlternatives: [`Initial design plus ${Math.max(0, maximumAttempts - 1)} targeted revision attempts`],
            suggestions: [{
                change: "Revise the blocked game-design requirement or extend the relevant catalog.",
                impact: "Allows the level designer to produce a coherent, implementable graph without changing hard constraints silently."
            }]
        }
    };
}
