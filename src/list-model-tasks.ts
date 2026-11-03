import { repositoryPuzzleCatalog } from "./levels/catalog.js";

process.stdout.write("Agent tasks:\n");
for (const task of [
    "level-design",
    "level-review",
    "level-bundle",
    "supporting-media-raster",
    "supporting-media-svg",
    "supporting-media-document"
]) {
    process.stdout.write(`  ${task}\n`);
}

process.stdout.write("\nPuzzle subtypes:\n");
for (const subtype of repositoryPuzzleCatalog.entries.map((entry) => entry.subtype).sort()) {
    process.stdout.write(`  ${subtype}\n`);
}

process.stdout.write("\nAuthored-content modes:\n");
for (const mode of ["prose-composition", "visual-composition"]) {
    process.stdout.write(`  ${mode}\n`);
}
