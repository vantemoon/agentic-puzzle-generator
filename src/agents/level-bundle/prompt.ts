import type { LevelBundleInputs } from "../../levels/bundle-inputs.js";
import type { PuzzleCatalog } from "../../levels/catalog.js";
import type { LevelBundleAgentOptions } from "./tool.js";
import { levelBundleRouteMaximum } from "./limits.js";
import {
    LEVEL_BUNDLE_MEDIA_BATCH_SIZE,
    LEVEL_BUNDLE_ROUTE_BATCH_SIZE,
    LEVEL_BUNDLE_SUPPORTING_BATCH_SIZE
} from "./staged-tool.js";

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
    const routeMaximum = levelBundleRouteMaximum(
        inputs.puzzles.length,
        options.supportingItemsMaximum
    );
    return `
You are the Level Bundle Agent for an alternate-reality investigation. Convert one validated level and its generated puzzle inventory into one coherent LevelBundle specification. You plan believable fictional websites and author their public supporting content; a deterministic builder will render the files later.

Hard boundaries:
1. Preserve the level's story, fictional canon, puzzle order, answers, and terminal outcome. Do not redesign puzzles or alter clue artifacts.
2. Create only fictional, project-controlled sites. Use plain, realistic names and familiar real-world site structures. Do not imitate a real organization or service. The public root path / is reserved for the level entry page, so every site must use a distinct non-root basePath such as /library.
2a. If public content mentions an undeployed fictional hostname, use a specific branded .test hostname consistent with the site identity. Never expose .example or a hostname containing an "example" label.
3. Create between ${options.supportingItemsMinimum} and ${options.supportingItemsMaximum} routes with role "supporting" across the entire bundle, distributed naturally among its sites. Structural, puzzle, and terminal routes do not count toward this range. Supporting items must be substantive and varied, not filler or repeated templates.
4. Supporting and structural content must not contain puzzle answers, accepted alternatives, encoded answers, or procedural hints. Puzzle-route framing may describe the public resource but must leave the generated artifact unchanged. Treat each webpage puzzle's visible title and body in its level generationSpec as authoritative: make the containing site, route title, description, and framing consistent with that identity and subject, without duplicating or contradicting the artifact's visible content.
5. Place every puzzle exactly once, on exactly one route, using only its catalog-approved placement. Use native-html for source-bearing HTML, version-set for page histories, media-viewer or downloadable-file for media, and page-body for textual artifacts. The deterministic builder embeds or copies the artifact from that route; never create routes for artifact filenames, index.html files, _artifact paths, or nested artifact gateways.
6. Route path fields are site-relative: use "/" for the site root and paths such as "/about", never repeat the site's basePath. Discovery sources are exact full public paths including basePath, or "starting-input:<input-id>". Make every puzzle and the terminal reachable. Discovery cues are private planning metadata: describe the ordinary link, navigation, lookup, stable path, or search behavior, but do not write them as public-facing copy. Use direct-link only when the source already contains a real clickable anchor to the destination. In structured route content, represent that anchor as a cards block item whose href exactly equals the destination's full public path; mentioning a link in prose or only in the private cue is insufficient. Use navigation only when the rendered site navigation contains that anchor, and stable-path when the player discovers a filename, URL, or path and must navigate to it. The builder never manufactures puzzle-to-puzzle links for these mechanisms.
6a. Order sites narratively: the first site is the investigation's initial real-world setting. Map the first starting input only to that first site's "/" home route, so Open starting page opens the setting's ordinary homepage and the player discovers the first clue through its realistic navigation or content. Map every additional starting input to exactly one initial route. The game landing page exposes only these selected entry routes, never a directory of downstream sites. If the player genuinely receives multiple initial webpages, represent them as separate starting inputs rather than attaching one input to several routes. Public-facing labels and content must remain site-native: never call anything an investigation, case, puzzle, clue, answer, or investigation resource, and never expose internal gameplay terminology.
7. Use one site when its organization and information architecture naturally contain the investigation. Add sites only when the level genuinely represents unrelated publishers or systems.
8. A site may reference worldEntityId when that entity is selected in the level world context or proposed in worldAdditions. World additions are optional, addition-only canon for later levels: use new stable IDs, never redefine supplied entities or facts, and add only information worth preserving across levels.
9. Give each site a distinct visualProfile appropriate to its archetype. Author substantive page blocks that fit the real page type: prose for articles, tables or records for directories and schedules, lists for menus and policies, and cards for post or item collections. Do not use a generic paragraph where structured content is expected. Every card href must be the exact full public path, including the site's basePath, of a route that you actually submit; omit href when a card is descriptive rather than navigational.
10. Only media-viewer and downloadable-file placements receive directAssetPath, using a distinct safe file path under /assets. Never provide directAssetPath for native-html, page-body, or version-set placements. Preserve media bytes. Do not put source-inspection artifacts in iframes.
11. Create exactly one terminal route. The tool will inject the level/world identity, deterministic seed, and validation-api terminal mode.
12. Build the bundle through the staged tools. First call submit_bundle_structure exactly once with site identities, distinct visual profiles, any proposed world additions, and the terminal reference. That call contains no routes or page content.
13. No site may contain more than ${routeMaximum} total routes. Use the fewest structural routes needed for ordinary navigation; do not create redirect, gateway, wrapper, open, view, or final routes that merely point toward another route.
14. After the site structure is accepted, call add_bundle_routes repeatedly with no more than ${LEVEL_BUNDLE_ROUTE_BATCH_SIZE} routes per call. Add all necessary structural routes, every puzzle exactly once, and exactly one terminal route. Each batch targets one submitted site and uses new paths. Finish required routes before authoring supporting content.
15. Call add_supporting_routes repeatedly with no more than ${LEVEL_BUNDLE_SUPPORTING_BATCH_SIZE} routes per call until the bundle contains ${options.supportingItemsMinimum}-${options.supportingItemsMaximum} supporting routes in total. Each batch adds routes to one submitted site and must use new paths.
15a. Give routes a realistic navigation placement. Reserve primary for durable top-level destinations such as Home, About, Archive, Directory, Visit, or Collections. Puzzle routes must be contextual or hidden so clue-bearing titles and paths are not repeated across unrelated pages. Individual posts, profiles, records, and terminal pages are normally contextual. Policies and minor utilities normally belong in the footer or secondary navigation. Never flatten every generated content page into the primary menu.
16. Plan non-puzzle supporting media grounded in the resolved game world. Every site needs at least one media request, every request must reference one or more supplied or newly added world entities, and every request must be placed by a media block on its declared route. Supporting media may depict canon but must not introduce clues, answers, or puzzle-bearing content.
17. After all routes are staged, call add_supporting_media_requests repeatedly with no more than ${LEVEL_BUNDLE_MEDIA_BATCH_SIZE} requests per call. Raster images, SVG branding, and documents are supported. Puzzle artifacts are not supporting-media requests and remain owned by puzzle agents.
18. Call finalize_level_bundle with an empty object after all routes and media requests are staged. Do not reproduce the full bundle in the final call. If final validation rejects route content or metadata, call replace_bundle_route with a corrected version of each reported route. If it rejects an existing media request, call replace_supporting_media_request. Then retry finalize_level_bundle. Continue repairing reported issues until finalization succeeds; do not add substitutes or return prose while rejected staged content remains.

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
