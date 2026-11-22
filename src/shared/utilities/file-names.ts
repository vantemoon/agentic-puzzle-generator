/** Convert an application ID into a deterministic, filesystem-safe filename stem. */
export function safeFileStem(value: string): string {
    const stem = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");

    if (stem.length === 0) {
        throw new Error("ID cannot be converted to a safe filename.");
    }
    return stem;
}
