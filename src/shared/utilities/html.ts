export const NEW_TAB_ATTRIBUTES = ' target="_blank" rel="noopener"';

/** Escape untrusted text for either HTML text content or a quoted attribute. */
export function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
