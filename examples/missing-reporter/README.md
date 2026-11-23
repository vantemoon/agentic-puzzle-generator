# The Missing Reporter — portable example

This is a fixed, offline-playable snapshot of `game_missing_reporter_demo_v2`.
It contains four levels and requires no model credentials or generation calls.
All people, companies, records, and events in the game are fictional.

From the repository root, with Node.js 26 and npm installed:

```sh
npm ci
npm run example:reporter
```

Open **http://127.0.0.1:4173/** and follow the case briefing. Keep the terminal
running. The four levels use localhost ports 4173–4176. Stop with Ctrl+C.
To choose other consecutive ports, run `npm run example:reporter -- 5200`.
Use the server rather than opening HTML files directly: lookups and answer
submission use local HTTP endpoints. Links may open a new tab.

Two clues use QR codes. Scan the published image with a QR reader or a phone
camera; the codes contain short identifiers, not external links. Other clues
use image descriptions, dated page versions, and public HTML source. Browser
developer tools are part of the intended play experience. Avoid reading
`game-design.json`, `data/`, or the automated test before playing: those contain
authoring data, solutions, and spoilers used by the local validator.

## Verification

```sh
npm run typecheck
npm test
npm run example:reporter:verify
```

`npm test` includes the reporter regression. It copies this example to another
directory, verifies artifact hashes and contracts, decodes the published QR
pixels with an independent reader, follows public links and lookups, derives
answers from public responses, and reaches Game complete. Missing lookup values
and incorrect terminal submissions are also checked. Tests need permission to
bind temporary localhost ports.

`example:reporter:verify` runs the existing technical verifier. It deliberately
does not claim independent blind-playtest approval; see PLAYTEST.md for the
separate manual player run and its limits.

## Snapshot contents and portability

`game.bundle.json` uses paths relative to its own directory. `data/` includes
only this candidate's world, requests, blueprints, puzzle records/artifacts,
bundle plans, and rebuilt public sites. Original generation logs and
machine-local diagnostic reports are omitted. Startup does not rebuild or alter
the snapshot. The server serves only each level's `public/` directory.

The snapshot is approximately 1.2 MB on disk and is intentionally versioned as
an example. The root generated-output directories remain ignored.

The package corrects two issues found during player testing: the first award
image now agrees with the campaign's contractor and award date; the parking
attachment page now describes its actual direct-link interaction rather than a
nonexistent search field. Answers and puzzle mechanics are unchanged.

## GitLab testing

The root `.gitlab-ci.yml` uses Node 26, installs locked dependencies, runs type
checking and all tests, and verifies this example. A GitLab runner must be
available. CI does not host the game for browser testers; testers clone the
repository and use the run command above. No model API keys are needed.

CI also checks `npm audit --audit-level=low`. The dependency security update uses
Pi SDK 1.6.0 and pins its minimatch dependency to 11.0.9 to cover newer upstream
advisories. The full test suite includes an offline Pi runtime startup check.

Include this entire example directory when committing. Use a private project
if the included authoring solutions should be visible only to your testers.
