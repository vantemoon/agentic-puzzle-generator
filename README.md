# agentic-puzzle-generator

## Source layout

Source code is organized by feature under `src/features/`. Each feature owns its
schemas, validation, persistence, and supporting logic. Features that use an LLM
keep their model setup, prompts, and structured tools in an `agent/` directory.

- `game-design/`: campaign design, level assignments, and manifest validation.
- `level-design/`: requests, puzzle graphs, blueprint validation, and player progress.
- `level-review/`: review schemas, revision orchestration, and patch validation.
- `puzzle-generation/`: catalog, generation handoffs, and subtype generators.
- `level-bundle/`: website plans, rendering, preview serving, and verification.
- `supporting-media/`: media generation, coordination, provenance, and reuse.
- `game-bundle/`: campaign assembly helpers and interaction verification.
- `game-evaluation/`: public evidence, quality assessment, and editorial feedback.
- `world/`: canonical entities, facts, revisions, and world file I/O.

`src/cli/` contains the command entry points. `src/shared/` contains the agent
runtime, artifact contracts and previews, writing policies, and small utilities
used by multiple features. Puzzle generator folders use canonical subtype names;
for example, Caesar code lives in
`src/features/puzzle-generation/generators/caesar-cipher/`.

The npm command names and generated output locations remain unchanged.

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

The bundle agent receives a supporting-page planning target and an upper generation budget, both scaled to level size. A narrowly scoped site can use fewer pages or omit supporting media. The evaluator judges the site against what its publisher and interface promise. Configure the target with `LEVEL_BUNDLE_SUPPORTING_MIN` and `LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MIN`, the cap with `LEVEL_BUNDLE_SUPPORTING_MAX` and `LEVEL_BUNDLE_SUPPORTING_PER_PUZZLE_MAX`, and the deterministic content seed with `LEVEL_BUNDLE_SEED`.

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
When you pass a built game ID, the preview uses the candidate recorded by
`game:build-ready`. You can also pass a saved `game.bundle.json` directly.

The first level's landing page uses the game design's public `openingBriefing`
for the setting, campaign goal, and first lead. It also shows the immediate
level objective and opens the first site from that same page.
Each level briefing shows the immediate investigation question. A terminal
assignment appears there only when the story gives it to you at the start.
Required fields and format hints appear on the terminal form.

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

To regenerate from the saved game design under the same game ID, add
`--regenerate`. It runs level design, puzzle generation, bundle and supporting
media generation, validation, and evaluation in a fresh output directory. The
preview switches to the new build after it passes the build pipeline.

```bash
npm run game:build-ready -- game_missing_reporter --regenerate
```

If regeneration fails, the build prints the staged generation directory. Resume
from that directory with `--resume <generation-directory>` to reuse completed
levels and puzzles. Use `--regenerate` for a fresh run.

The normal build validates the saved public pages and required interactions before
quality evaluation. The evaluator can suggest up to four plain-text additions
to structural and supporting pages. The build applies them once in a separate
candidate. It checks that existing HTML, routes, controls, and assets are
unchanged apart from the approved paragraphs, reruns validation, and evaluates
the revised candidate. If a revision fails validation, the build keeps the
validated baseline. Findings that require changes to the player flow stay in
the report for design revisions.

Review the quality of an already-built game with the configured model:

```bash
npm run game:evaluate-ready -- <game-id>
```

The standalone command validates the saved game and writes a report without
applying edits. The evaluator reads the public bundle files and writes to
`results/evaluations/<game-id>.md`. It reviews the plausibility of each site,
the clarity of player actions, and the connections between levels. Each level
also reviews who shared sensitive material, its intended audience, and what
the visible navigation makes available. Each suggested change includes the
expected player path, the puzzle reasoning it preserves, and a live playtest
check. The report lists which media were available and covers a static snapshot. Use
`game:verify-ready` for technical verification and the independent blind playtest.
Override the evaluator model with the optional `game-evaluation` task in
`llm-models.json`.

Verify a candidate's public files and exercise the lookup and terminal handlers on
temporary loopback ports:

```bash
npm run game:verify-ready -- <game-id> --technical-only
npm run game:serve-ready -- <game-id>
npm run game:verify-ready -- <game-id> --playtest <report.json>
```

Give an independent browser tester only the public entry URL and the report
instructions. Ask them to follow the public trail through the ending, record why
they took each major step, and cite what supplied every terminal answer. Report
any guess, unearned shortcut, misleading page, or unsupported conclusion as an
issue, even if submission worked. The tester can be a person or a browser agent
in a fresh session. Supply the fingerprint printed by technical verification when
assembling the report. The verifier rejects stale or incomplete reports.

The report format is:

```json
{
  "fingerprint": "<fingerprint from technical verification>",
  "gameComplete": true,
  "levels": [
    {
      "title": "The Public Records",
      "submissionAccepted": true,
      "steps": [
        { "from": "/", "to": "/records", "reason": "The briefing points to the public records office." },
        { "from": "/records", "to": "/records/submit", "reason": "The published record links to its request form." }
      ],
      "fields": [
        { "label": "Record number", "path": "/records", "observation": "The published record lists the reference number." }
      ]
    }
  ],
  "issues": []
}
```

Include every level in order and use public paths without query strings. List
issues as objects with an `owner` (`game-design`, `level-design`, `level-bundle`,
or `runtime`) and a `message`. Use the existing design and bundle repair paths
for reported issues, then repeat technical verification and blind play on the
revised candidate. Newly generated games require a passing report for readiness.
Older designs without an investigation question still support the original
offline technical check.

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
