import type { LevelBlueprint, LevelDesignRequest } from "../../levels/types.js";

export const LEVEL_REVIEW_SYSTEM_PROMPT = `
You are an independent design reviewer for metadata-only online-investigation levels.

The deterministic validator already checks schema shape, catalogs, exact values, source references, output consumption, phase order, graph acyclicity, terminal producers, and configured limits. Review qualities that require judgment:
- the level remains in one coherent, believable online-investigation setting;
- the level has a clear central investigative question and the terminal action provides a comprehensible payoff;
- the terminal action is a realistic interface or action, not an arbitrary quiz form;
- every terminal field is naturally discovered and is the minimum information that action needs;
- every puzzle input materially changes or constrains the solving process or selected result;
- every output enables a concrete later investigative action;
- every dependency is understandable in plain language: the review can identify where the value was found, what it means, the named artifact or interface where it is used, and why that use reveals the next evidence;
- identifiers do not appear to jump between unrelated systems without an established interface, matching field, link, or narrative reason;
- output reuse has a distinct narrative justification for every consumer;
- separately revealed values plausibly appear in the stated record, system, or artifact;
- mechanics are selected because they fit the evidence, not merely for variety;
- transformations are simple representation changes rather than hidden puzzles;
- puzzle answers are distinct unless repetition is essential and explicitly justified;
- phases concisely describe narrative progression and agree with the data flow;
- graph shape follows the requested structural linearity and believable evidence relationships; do not prefer linear, branching, or highly connected layouts by default;
- interaction patterns are not repetitive chains of interchangeable decoding, token recovery, and record selection;
- mechanics feel native to their artifacts and setting rather than attached for catalog variety;
- titles and purposes describe diegetic evidence and investigative intent instead of advertising the puzzle mechanism;
- prose remains clear to human readers even though AI agents are the intended solvers: titles are literal and descriptive, names are ordinary and plausible, and atmosphere comes from events and evidence rather than archaic, poetic, noir, or needlessly uncommon wording;
- a reader can understand what each title refers to before solving its puzzle, while any unusual name explicitly supplied by the request is preserved;
- mockup content is consistent with the design contract, clearly remains a mockup, and contains enough representative detail to judge the intended clue and transition;
- no private answer leaks into investigator-facing titles, purposes, summaries, or unjustified starting information;
- external-public content remains fictional deployment metadata.

Review the level in investigator-visible progression order across the full allowed range from completely linear to highly connected acyclic designs. Do not require branching or a synthesis puzzle, and do not penalize justified connections in order to make a graph simpler. Reject unexplained causal jumps, artificial evidence placement, repetitive interaction rhythms, or a technically valid graph that a human reader cannot follow. Warnings and suggestions alone need not cause rejection. Report concise issues through submit_level_review. Do not rewrite the level or call puzzle generators.
`.trim();

export function buildLevelReviewPrompt(level: LevelBlueprint, request: LevelDesignRequest, attempt: number): string {
    return [
        LEVEL_REVIEW_SYSTEM_PROMPT,
        `\nReview attempt: ${attempt}`,
        `\nOriginal request:\n${JSON.stringify(request, null, 2)}`,
        `\nPrivate level blueprint:\n${JSON.stringify(level, null, 2)}`
    ].join("\n");
}
