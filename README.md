# agentic-puzzle-generator

## Generate a puzzle from a level

Generate one puzzle from a validated level blueprint:

```bash
npm run level:generate-puzzle -- generated-levels/investigate-alex-laptop.level.json recover-password
```

Run the command without arguments to select a level and puzzle from numbered menus:

```bash
npm run level:generate-puzzle
```

Puzzle generation defaults to `kadi-openai/openai/gpt-5.6-sol`. To try another
Kadi model, set `KADI_MODEL_ID`; the loader automatically checks both Kadi
providers. You can select one explicitly with `KADI_PROVIDER_ID`:

```bash
KADI_PROVIDER_ID=kadi KADI_MODEL_ID=moonshot/kimi-k2.6 npm run level:generate-puzzle
```

Supplying only a level file skips the level menu and displays its puzzle menu. Generation writes both private metadata and a deployable artifact under `generated-puzzles/<level-id>/`:

- `<puzzle-id>.puzzle.json` — private generation/solution metadata; do not publish it.
- `<puzzle-id>/index.html` — HTML artifact entry point, when the puzzle produces a webpage.
- `<puzzle-id>/puzzle.txt`, `puzzle.svg`, `puzzle.png`, or `puzzle.wav` — the corresponding non-HTML artifact.

Deploy the puzzle artifact directory, not the private `.puzzle.json` file.
