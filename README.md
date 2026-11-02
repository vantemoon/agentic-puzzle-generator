# agentic-puzzle-generator

## Generate a level from a world-aware request

Create `worlds/<world-id>.world.json` and a matching
`level-requests/<level-id>.request.json`, then run:

```bash
npm run level:design -- level-requests/<level-id>.request.json
```

The request's `world.id` selects `worlds/<world-id>.world.json`. Both files are
validated before the level-design agent starts.

## Generate a puzzle from a level

Generate one puzzle from a validated level blueprint:

```bash
npm run level:generate-puzzle -- generated-levels/investigate-alex-laptop.level.json recover-password
```

Run the command without arguments to select a level and puzzle from numbered menus:

```bash
npm run level:generate-puzzle
```

Configure agent models in the repository's `llm-models.json` file:

```json
{
  "default": { "modelId": "fast-model", "providerId": "kadi" },
  "tasks": {
    "level-design": { "modelId": "complex-model" },
    "level-review": { "modelId": "complex-model" },
    "level-bundle": { "modelId": "bundle-model" }
  },
  "puzzles": {
    "default": { "modelId": "fast-model" },
    "visual-composition": { "modelId": "vision-capable-model" },
    "caesar-cipher": { "modelId": "fast-model" }
  }
}
```

`puzzles.default` applies to every puzzle without a more specific entry.
`prose-composition` and `visual-composition` configure puzzle agents that author
those kinds of content, while a subtype entry can still override either group.
If either `modelId` or `providerId` is omitted from an entry, that field inherits
through the normal fallback. Both fields under `default` are required. Resolution
order is puzzle subtype, authored-content mode, puzzle default, then global
default. Level tasks use their task entry, then the global default. Run
`npm run models:list` to see the configurable task names, authored-content modes,
and puzzle subtypes.

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

## Plan a level bundle

After every puzzle in a level has been generated, create and build a validated level bundle:

```bash
npm run level:bundle -- generated-levels/<level-id>.level.json
```

The command verifies the world reference, private puzzle records, and artifact files before starting the Level Bundle Agent. It writes the private plan to `generated-bundles/<level-id>/level.bundle.json` and builds the public site. Missing or modified puzzle artifacts stop the command with an actionable preflight report.

Bundle runs print the selected model and write an incremental private JSONL trace under `generation-logs/<level-id>/`. A heartbeat is printed every 15 seconds while the model is producing its structured bundle submission.

Development bundles default to 10–15 supporting items per site. Override the bounds with `LEVEL_BUNDLE_SUPPORTING_MIN` and `LEVEL_BUNDLE_SUPPORTING_MAX`, or set `LEVEL_BUNDLE_SEED` for a specific deterministic content seed.

Build the validated plan into separated public and private output:

```bash
npm run level:build-bundle -- generated-levels/<level-id>.level.json
```

The deployable site is written to `generated-bundles/<level-id>/public/`. Puzzle mappings and build diagnostics remain under `private/` and must not be published.

Preview the site with authoritative local terminal validation:

```bash
npm run level:preview-bundle -- generated-levels/<level-id>.level.json
```

The preview binds to `127.0.0.1:4173` by default. Pass a second argument to select another port. The validation endpoint resolves expected fields from private level data at runtime; canonical answers are not added to the public directory.

Re-run all deterministic checks without regenerating the plan or rebuilding:

```bash
npm run level:verify-bundle -- generated-levels/<level-id>.level.json
```

Verification checks supporting-content depth, manifest hashes, clue artifact integrity, private-answer leakage outside puzzle resources, broken links, declared journey transitions, basic accessibility, and unsafe or external page dependencies. A failed report is still written under the bundle's `private/` directory.
