import Type, { type Static } from "typebox";

import { LevelDesignRequestSchema } from "../level-design/types.js";
import { GameWorldSchema } from "../world/types.js";
import { StoryArchetypeSchema } from "../../shared/policies/house-style.js";

const closed = { additionalProperties: false } as const;

export const GAME_DESIGN_SCHEMA_VERSION = "1.0.0";

export const GameOpeningBriefingSchema = Type.Object({
    situation: Type.String({ minLength: 1, pattern: "\\S" }),
    goal: Type.String({ minLength: 1, pattern: "\\S" }),
    firstLead: Type.String({ minLength: 1, pattern: "\\S" })
}, closed);

export const GameLevelAssignmentSchema = Type.Object({
    parentLevelId: Type.Optional(Type.String({ minLength: 1 })),
    prerequisiteLevelIds: Type.Array(Type.String({ minLength: 1 })),
    request: LevelDesignRequestSchema
}, closed);

export const GameDesignSpecSchema = Type.Object({
    schemaVersion: Type.Literal(GAME_DESIGN_SCHEMA_VERSION),
    id: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    // Optional for version-1 files written before controlled archetypes were introduced.
    storyArchetype: Type.Optional(StoryArchetypeSchema),
    premise: Type.String({ minLength: 1 }),
    openingBriefing: Type.Optional(GameOpeningBriefingSchema),
    // Optional only for version-1 files written before campaigns declared a persistent player identity.
    playerRole: Type.Optional(Type.String({ minLength: 1 })),
    experienceGoals: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    world: GameWorldSchema,
    levels: Type.Array(GameLevelAssignmentSchema, { minItems: 2 })
}, closed);

export type GameLevelAssignment = Static<typeof GameLevelAssignmentSchema>;
export type GameDesignSpec = Static<typeof GameDesignSpecSchema>;
export type CampaignBriefing = Static<typeof GameOpeningBriefingSchema> & { title: string; playerRole?: string };

