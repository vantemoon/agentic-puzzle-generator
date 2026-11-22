import Type, { type Static } from "typebox";

const closed = { additionalProperties: false } as const;
export const ReviewIssueSchema = Type.Object({
    severity: Type.Union([Type.Literal("error"), Type.Literal("warning"), Type.Literal("suggestion")]),
    code: Type.String({ minLength: 1 }),
    nodeId: Type.Optional(Type.String({ minLength: 1 })),
    message: Type.String({ minLength: 1 }),
    suggestedFix: Type.String({ minLength: 1 })
}, closed);

export const LevelReviewSchema = Type.Object({
    levelId: Type.String({ minLength: 1 }),
    attempt: Type.Integer({ minimum: 1 }),
    accepted: Type.Boolean(),
    summary: Type.String({ minLength: 1 }),
    issues: Type.Array(ReviewIssueSchema)
}, closed);

export const LevelPatchOperationSchema = Type.Union([
    Type.Object({
        op: Type.Union([Type.Literal("add"), Type.Literal("replace")]),
        path: Type.String({ pattern: "^/" }),
        value: Type.Unknown(),
        reason: Type.String({ minLength: 1 })
    }, closed),
    Type.Object({
        op: Type.Literal("remove"),
        path: Type.String({ pattern: "^/" }),
        reason: Type.String({ minLength: 1 })
    }, closed)
]);

export const LevelPatchSchema = Type.Object({
    levelId: Type.String({ minLength: 1 }),
    baseSchemaVersion: Type.String({ minLength: 1 }),
    mode: Type.Union([Type.Literal("progress-preserving"), Type.Literal("full-regeneration")]),
    unrecoverableIssue: Type.Optional(Type.String({ minLength: 1 })),
    completedPuzzleIds: Type.Array(Type.String({ minLength: 1 })),
    operations: Type.Array(LevelPatchOperationSchema, { minItems: 1 })
}, closed);

export type LevelReview = Static<typeof LevelReviewSchema>;
export type LevelPatch = Static<typeof LevelPatchSchema>;

