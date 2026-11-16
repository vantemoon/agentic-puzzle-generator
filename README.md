# agentic-puzzle-generator

## Design a multi-level game

Create a new fictional game world and a connected set of level-design requests from a short brief:

```bash
npm run game:design -- "Design a stolen-artifact investigation set around a university museum"
```

Omit the brief to let the game-design agent invent a high-stakes investigation autonomously:

```bash
npm run game:design
```

New designs select one primary story archetype from the repository's controlled
catalog (for example, kidnapping, murder, conspiracy, fraud, sabotage, or stolen
artifact). All writing stages share the same plain-language naming rules: use
ordinary descriptive words and names, and do not coin evocative terms or poetic
compound names. Existing version-1 design files without an explicit archetype
remain readable.

The command writes the canonical world under `worlds/`, a private campaign spec
and level manifest under `game-designs/`, and one validated request per level
under `level-requests/`. Each request can be passed directly to `level:design`.
Event-driven progress milestones are written to stderr while the final
game-design spec path remains the command's single stdout result.

## Generate a level from a world-aware request

Create `worlds/<world-id>.world.json` and a matching
`level-requests/<level-id>.request.json`, then run:

```bash
npm run level:design -- level-requests/<level-id>.request.json
```

The command starts the level-design agent immediately, writes the validated
blueprint under `generated-levels/`, prints its absolute path, and exits.

The request's `world.id` selects `worlds/<world-id>.world.json`. Both files are
validated before the level-design agent starts.

The main world file contains shared canon. It may declare an ordered
`revisionPointers` list whose files contain immutable, addition-only entities and
facts. A level remains pinned to `world.revision`; loading that level resolves the
base world plus every addition through the requested revision. Revision files must
identify their parent revision and the level or process that introduced them.

## Generate a puzzle from a level

Generate one puzzle from a validated level blueprint:

```bash
npm run level:generate-puzzle -- generated-levels/investigate-alex-laptop.level.json recover-password
```

Run the command without arguments to select a level and puzzle from numbered menus:

```bash
npm run level:generate-puzzle
```

Generate every supported production puzzle in a level sequentially:

```bash
npm run level:generate-puzzle -- generated-levels/<level-id>.level.json --all
```

Batch generation skips puzzles that already have generated metadata. Add `--force`
to regenerate and overwrite every puzzle in the level:

```bash
npm run level:generate-puzzle -- generated-levels/<level-id>.level.json --all --force
```

Batch mode attempts every eligible puzzle and reports all failures in one summary.

Configure agent models in the repository's `llm-models.json` file:

```json
{
  "default": { "modelId": "fast-model", "providerId": "kadi" },
  "tasks": {
    "level-design": { "modelId": "complex-model" },
    "level-review": { "modelId": "complex-model" },
    "level-bundle": { "modelId": "bundle-model" },
    "supporting-media-raster": { "modelId": "visual-model" },
    "supporting-media-svg": { "modelId": "visual-model" },
    "supporting-media-document": { "modelId": "writing-model" }
  },
  "puzzles": {
    "default": { "modelId": "fast-model" },
    "webpage-composition": { "modelId": "web-capable-model" },
    "visual-composition": { "modelId": "vision-capable-model" },
    "caesar-cipher": { "modelId": "fast-model" }
  }
}
```

`puzzles.default` applies to every puzzle without a more specific entry.
`prose-composition`, `visual-composition`, and `webpage-composition` configure
puzzle-agent groups that author those kinds of artifacts, while a subtype entry
can still override its group.
If either `modelId` or `providerId` is omitted from an entry, that field inherits
through the normal fallback. Both fields under `default` are required. Resolution
order is puzzle subtype, webpage group, authored-content mode, puzzle default,
then global default. Level and supporting-media tasks use their task entry, then the global default. Run
`npm run models:list` to see the configurable task names, puzzle model groups,
authored-content modes, and puzzle subtypes.

Only puzzle subtypes that need a different model require their own entry. List
every valid configurable task and puzzle subtype with:

```bash
npm run models:list
```

Supplying only a level file skips the level menu and displays its puzzle menu. Generation writes both private metadata and a deployable artifact under `generated-puzzles/<level-id>/`:

- `<puzzle-id>.puzzle.json` — private generation/solution metadata; do not publish it.
- `<puzzle-id>/index.html` — HTML artifact entry point, when the puzzle produces a webpage.
- `<puzzle-id>/puzzle.txt`, `puzzle.svg`, `puzzle.png`, or `puzzle.wav` — the corresponding non-HTML artifact.

Deploy the puzzle artifact directory, not the private `.puzzle.json` file.

## Generate a complete level bundle

After every puzzle in a level has been generated, create and build a validated level bundle:

```bash
npm run level:bundle -- generated-levels/<level-id>.level.json
```

This is the single bundle-generation command. It verifies the world reference,
private puzzle records, and artifact files; creates the bundle plan; generates or
reuses supporting media; builds the public site and private diagnostics; and runs
deterministic verification. Missing or modified puzzle artifacts stop the command
with an actionable preflight report.

Bundle plans use structured page blocks for prose, lists, records, tables, cards,
and supporting-media placements. Every site declares its own visual profile.
Supporting-media requests must reference game-world entities, while optional
`worldAdditions` propose addition-only canon for later promotion. Puzzle artifacts
remain owned by puzzle agents and are placed without being rewritten.

After the plan is accepted, the Supporting Media Agent generates or reuses raster,
SVG, and document assets under `generated-world-media/<world-id>/`. Its media
library records world-entity references, provenance, model selection, and content
hashes so later levels can reuse the same established asset. Each media mode has
an independent entry in `llm-models.json`.

Bundle runs print event-driven planning and validation progress while writing an incremental private JSONL trace under `generation-logs/<level-id>/`. The agent submits site definitions, required routes, and supporting pages in bounded batches before deterministic final assembly.

Development bundles use 10–15 supporting pages as a bundle-wide floor and scale to 2–3 supporting pages per puzzle for larger levels. Override the floors with `LEVEL_BUNDLE_SUPPORTING_MIN` and `LEVEL_BUNDLE_SUPPORTING_MAX`, the density with `LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MIN` and `LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MAX`, or set `LEVEL_BUNDLE_SEED` for a specific deterministic content seed.

The deployable site is written to `generated-bundles/<level-id>/public/`. Puzzle mappings and build diagnostics remain under `private/` and must not be published.

Bundle generation runs deterministic verification after building the public
output. Verification checks supporting-content depth, manifest hashes, clue
artifact integrity, private-answer leakage outside puzzle resources, broken links,
declared journey transitions, basic accessibility, and unsafe or external page
dependencies. A failed report is still written under the bundle's `private/`
directory.

Preview the site with authoritative local terminal validation:

```bash
npm run level:preview-bundle -- generated-levels/<level-id>.level.json
```

The preview binds to `127.0.0.1:4173` by default. Pass a second argument to select another port. The validation endpoint resolves expected fields from private level data at runtime; canonical answers are not added to the public directory.

Open the printed `http://127.0.0.1:4173/` address in a browser. Do not open the generated `public/index.html` directly: the bundle uses site-root links and a server-backed answer-validation endpoint, so navigation and validation require the preview server (or a deployed web server).

## Preview a connected game bundle

After every level in a game design has generated puzzles and a verified level bundle,
start the whole campaign with one command:

```bash
npm run game:preview-bundle -- game-designs/<game-id>.game-design.json
```

The command rebuilds and verifies every level before serving the campaign. Open the
first printed URL. A successful terminal submission links directly to the next
level; the final level ends on its accepted outcome. Each level uses one consecutive
localhost port so its existing root-relative fictional sites continue to work.

Build every website-based level bundle for a game, generating missing level
blueprints, puzzle artifacts, bundle plans, supporting pages, and supporting
media as needed:

```bash
npm run game:build-ready -- game_missing_reporter
npm run game:serve-ready -- game_missing_reporter
```

The build parameter selects the game, not an individual level. It can be either
the game ID or a path to a game-design JSON file. Existing valid puzzle artifacts,
supporting media, and verified bundles are reused. Missing or invalid pieces are
regenerated through the normal puzzle and level-bundle agents:

```bash
npm run game:build-ready -- game-designs/game_missing_reporter.game-design.json
```

Verify every completed level bundle without starting the preview server:

```bash
npm run game:verify-ready -- game_missing_reporter
```

Each deployable fictional website remains under
`generated-bundles/<level-id>/public/`. Private mappings and verification reports
remain beside it under `private/`. The game-level manifest is written to
`generated-games/<game-id>/game.bundle.json`; it references those verified level
bundles instead of flattening their puzzles into sequential pages.

## Inspect game designs

Launch the unified, read-only design inspector:

```bash
npm run level:inspect
```

Open `http://127.0.0.1:4173/`, then load or drag in a JSON file. The inspector automatically recognizes complete game designs, standalone game worlds, level-design requests, and generated levels. Complete game designs provide Game Structure and Game World tabs; generated levels retain the puzzle data-flow view. Level-request details include their required discoveries, difficulty configuration, world scope, and complete terminal action.
