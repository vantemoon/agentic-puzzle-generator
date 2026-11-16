import Type, { type Static } from "typebox";

/**
 * Controlled case shapes for generated campaigns. A campaign chooses one primary
 * archetype. It may use other crimes or complications inside the story, but its
 * central question must stay recognizable as the selected archetype.
 */
export const StoryArchetypeSchema = Type.Union([
    Type.Literal("missing-person"),
    Type.Literal("kidnapping"),
    Type.Literal("murder"),
    Type.Literal("attempted-murder"),
    Type.Literal("wrongful-accusation"),
    Type.Literal("stolen-artifact"),
    Type.Literal("theft"),
    Type.Literal("fraud"),
    Type.Literal("embezzlement"),
    Type.Literal("forgery"),
    Type.Literal("blackmail"),
    Type.Literal("extortion"),
    Type.Literal("bribery"),
    Type.Literal("corruption"),
    Type.Literal("conspiracy"),
    Type.Literal("cover-up"),
    Type.Literal("sabotage"),
    Type.Literal("staged-accident"),
    Type.Literal("arson"),
    Type.Literal("smuggling"),
    Type.Literal("illegal-sale"),
    Type.Literal("counterfeit-goods"),
    Type.Literal("identity-theft"),
    Type.Literal("data-theft"),
    Type.Literal("corporate-misconduct"),
    Type.Literal("research-misconduct"),
    Type.Literal("evidence-tampering"),
    Type.Literal("whistleblower-suppression"),
    Type.Literal("inheritance-dispute"),
    Type.Literal("historical-mystery")
]);

export type StoryArchetype = Static<typeof StoryArchetypeSchema>;

export const STORY_ARCHETYPES: readonly StoryArchetype[] = [
    "missing-person",
    "kidnapping",
    "murder",
    "attempted-murder",
    "wrongful-accusation",
    "stolen-artifact",
    "theft",
    "fraud",
    "embezzlement",
    "forgery",
    "blackmail",
    "extortion",
    "bribery",
    "corruption",
    "conspiracy",
    "cover-up",
    "sabotage",
    "staged-accident",
    "arson",
    "smuggling",
    "illegal-sale",
    "counterfeit-goods",
    "identity-theft",
    "data-theft",
    "corporate-misconduct",
    "research-misconduct",
    "evidence-tampering",
    "whistleblower-suppression",
    "inheritance-dispute",
    "historical-mystery"
];

export const PLAIN_LANGUAGE_HOUSE_STYLE = `
Shared writing and naming style:
- Use simple, common, contemporary English. Prefer a familiar word over a poetic, archaic, technical, or unusual synonym.
- Do not coin words or invent poetic compounds such as “Afterlight.” Do not use a vague evocative word as a project, archive, operation, organization, place, site, file, or campaign name.
- Use ordinary, plausible names for people and literal, purpose-based names for organizations, places, programs, sites, files, and records.
- Make titles short, concrete, and descriptive. A reader should understand the subject of a title before solving anything.
- Avoid noir narration, taglines, melodrama, metaphors, lore-heavy labels, and mystery created only by withholding basic context.
- Build atmosphere through specific events, evidence, relationships, risks, and consequences.
- Preserve an unusual term only when it was supplied by the user or already exists in validated canon; do not spread that style to new names.
- Before submitting, perform a plain-language pass. Replace every invented, ornamental, vague, or needlessly uncommon term with the clearest familiar alternative.
`.trim();
