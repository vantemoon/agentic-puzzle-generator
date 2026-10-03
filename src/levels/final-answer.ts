import type { Verification } from "./types.js";

export interface ExactAnswerResult {
    accepted: boolean;
    normalizedSubmission: string | number;
}

export function evaluateExactAnswer(submission: string | number, verification: Verification): ExactAnswerResult {
    if (verification.dataType === "string") {
        const normalizedSubmission = String(submission).trim();
        return {
            accepted: normalizedSubmission === verification.expectedValue,
            normalizedSubmission
        };
    }

    const normalizedSubmission = typeof submission === "number" ? submission : Number(submission.trim());
    return {
        accepted: Number.isFinite(normalizedSubmission) && normalizedSubmission === verification.expectedValue,
        normalizedSubmission
    };
}
