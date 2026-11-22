import {
    AUTHORED_CONTENT_MODES,
    PUZZLE_MODEL_GROUPS
} from "../shared/utilities/authored-content.js";
import { MODEL_TASK_NAMES } from "../shared/agent-runtime/model.js";
import { repositoryPuzzleCatalog } from "../features/puzzle-generation/catalog.js";

process.stdout.write("Agent tasks:\n");
for (const task of MODEL_TASK_NAMES) {
    process.stdout.write(`  ${task}\n`);
}

process.stdout.write("\nPuzzle subtypes:\n");
for (const subtype of repositoryPuzzleCatalog.entries.map((entry) => entry.subtype).sort()) {
    process.stdout.write(`  ${subtype}\n`);
}

process.stdout.write("\nPuzzle model groups and authored-content modes:\n");
for (const mode of [...AUTHORED_CONTENT_MODES, ...PUZZLE_MODEL_GROUPS]) {
    process.stdout.write(`  ${mode}\n`);
}
