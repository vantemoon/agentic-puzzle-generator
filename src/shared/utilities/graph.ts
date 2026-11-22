export function graphShape(ids: string[], edges: Array<{ from: string; to: string }>): {
    hasCycle: boolean;
    maxWidth: number;
} {
    const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
    const indegree = new Map(ids.map((id) => [id, 0]));
    for (const edge of edges) {
        if (!outgoing.has(edge.from) || !indegree.has(edge.to)) continue;
        outgoing.get(edge.from)?.push(edge.to);
        indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    }

    let frontier = ids.filter((id) => indegree.get(id) === 0);
    let visited = 0;
    let maxWidth = frontier.length;
    while (frontier.length > 0) {
        visited += frontier.length;
        const next: string[] = [];
        for (const id of frontier) {
            for (const target of outgoing.get(id) ?? []) {
                const remaining = (indegree.get(target) ?? 0) - 1;
                indegree.set(target, remaining);
                if (remaining === 0) next.push(target);
            }
        }
        frontier = next;
        maxWidth = Math.max(maxWidth, frontier.length);
    }

    return { hasCycle: visited !== ids.length, maxWidth };
}


