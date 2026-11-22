/** Return each duplicated value once, in the order its duplication is discovered. */
export function duplicateValues(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
    }
    return [...duplicates];
}

/** Check an exact YYYY-MM-DD calendar date without accepting date rollover. */
export function isCalendarDate(value: string): boolean {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
