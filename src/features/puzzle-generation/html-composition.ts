export interface ComposableHtmlArtifactFragments {
    head: string;
    body: string;
}

export function composableHtmlArtifactFragments(
    source: string
): ComposableHtmlArtifactFragments | undefined {
    const head = source.match(/<head(?:\s[^>]*)?>([\s\S]*?)<\/head>/i)?.[1];
    const body = source.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i)?.[1];
    if (head === undefined || body === undefined) return undefined;

    // The bundle owns document identity. Preserve the rest of the puzzle-authored
    // head, including source-inspection carriers and CSS required by DOM puzzles.
    return {
        head: head
            .replace(/<title(?:\s[^>]*)?>[\s\S]*?<\/title>/gi, "")
            .replace(/<meta\b(?=[^>]*\bcharset\s*=)[^>]*>/gi, "")
            .trim(),
        body
    };
}
