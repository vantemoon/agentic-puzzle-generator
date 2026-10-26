import type { AgentTool } from "@earendil-works/pi-agent-core";
import Type from "typebox";

import { LevelReviewSchema, type LevelReview } from "../../levels/types.js";

const parameters = Type.Object({ review: LevelReviewSchema }, { additionalProperties: false });

export function createSubmitLevelReviewTool(options: {
    levelId: string;
    attempt: number;
}): AgentTool<typeof parameters, LevelReview> {
    return {
        name: "submit_level_review",
        label: "Submit level review",
        description: "Submit a structured narrative and design review for a metadata-only level blueprint.",
        parameters,
        async execute(_toolCallId, params) {
            if (params.review.levelId !== options.levelId) throw new Error(`Review levelId must be ${options.levelId}.`);
            if (params.review.attempt !== options.attempt) throw new Error(`Review attempt must be ${options.attempt}.`);
            if (params.review.accepted && params.review.issues.some((issue) => issue.severity === "error")) {
                throw new Error("A review with error-severity issues cannot be accepted.");
            }
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        levelId: params.review.levelId,
                        accepted: params.review.accepted,
                        issueCount: params.review.issues.length
                    })
                }],
                details: params.review,
                terminate: true
            };
        }
    };
}
