import path from "node:path";

export function pagePathIssues(publicPath: string): string[] {
    const fileExtension = path.posix.extname(publicPath);
    return fileExtension
        ? [`Use an extensionless URL for web page ${publicPath}. Keep file extensions on actual assets.`]
        : [];
}
