import type { LevelBundleInputs } from "../../levels/bundle-inputs.js";
import type { PuzzleCatalog } from "../../levels/catalog.js";
import type { LevelBundleAgentOptions } from "./tool.js";

function artifactSummary(inputs: LevelBundleInputs, catalog: PuzzleCatalog): unknown[] {
    return inputs.puzzles.map(({ puzzle }) => {
        const capability = catalog.entries.find((entry) => entry.subtype === puzzle.subtype)?.bundle;
        return {
            id: puzzle.id,
            puzzleType: puzzle.puzzleType,
            subtype: puzzle.subtype,
            publicPrompt: puzzle.prompt,
            artifact: puzzle.artifact.kind === "html"
                ? {
                    kind: puzzle.artifact.kind,
                    mediaType: puzzle.artifact.mediaType,
                    entryPath: puzzle.artifact.entryPath,
                    files: puzzle.artifact.files.map((file) => file.path)
                }
                : { kind: puzzle.artifact.kind, mediaType: puzzle.artifact.mediaType },
            bundleCapabilities: capability
        };
    });
}

export function buildLevelBundlePrompt(
    inputs: LevelBundleInputs,
    catalog: PuzzleCatalog,
    options: LevelBundleAgentOptions
): string {
    return `
You are the Level Bundle Agent for an alternate-reality investigation. Convert one validated level and its generated puzzle inventory into one coherent LevelBundle specification. You plan believable fictional websites and author their public supporting content; a deterministic builder will render the files later.

Hard boundaries:
1. Preserve the level's story, fictional canon, puzzle order, answers, and terminal outcome. Do not redesign puzzles or alter clue artifacts.
2. Create only fictional, project-controlled sites. Use plain, realistic names and familiar real-world site structures. Do not imitate a real organization or service.
3. Create between ${options.supportingItemsMinimum} and ${options.supportingItemsMaximum} routes with role "supporting" on every site. Structural, puzzle, and terminal routes do not count toward this range. Supporting items must be substantive and varied, not filler or repeated templates.
4. Supporting and structural content must not contain puzzle answers, accepted alternatives, encoded answers, or procedural hints. Puzzle-route framing may describe the public resource but must leave the generated artifact unchanged.
5. Place every puzzle exactly once using only its catalog-approved placement. Use native-html for source-bearing HTML, version-set for page histories, media-viewer or downloadable-file for media, and page-body for textual artifacts.
6. Every non-root route declares discovery. A discovery source is either an exact full public route path or "starting-input:<input-id>". Make every puzzle and the terminal reachable. The cue must describe the ordinary link, navigation, lookup, stable path, or search instruction that exposes the destination.
7. Use one site when its organization and information architecture naturally contain the investigation. Add sites only when the level genuinely represents unrelated publishers or systems.
8. A site may reference worldEntityId only when that entity is selected in the level world context. Do not invent new canon about named world entities. Incidental non-canonical supporting material may be authored when it does not contradict the supplied facts.
9. Use concise page content: a descriptive title, a one-sentence description, and one to three short body paragraphs. Essential content must be server-renderable and understandable without JavaScript.
10. For media-viewer and downloadable-file placements, provide a safe directAssetPath. Preserve media bytes. Do not put source-inspection artifacts in iframes.
11. Create exactly one terminal route. The tool will inject the level/world identity, deterministic seed, and validation-api terminal mode.
12. Call submit_level_bundle exactly once. Do not return prose instead of the tool call.

Level blueprint:
${JSON.stringify(inputs.level, null, 2)}

Resolved fictional world context:
${JSON.stringify(inputs.context, null, 2)}

Generated puzzle inventory (binary and full artifact bodies intentionally omitted):
${JSON.stringify(artifactSummary(inputs, catalog), null, 2)}

Bundle generation options:
${JSON.stringify(options, null, 2)}
`.trim();
}
