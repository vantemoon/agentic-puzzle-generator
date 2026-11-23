import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { QRCode } from "jsqr";
import { describe, expect, it } from "vitest";

import { loadSavedGameLevel, readSavedGameBundle, verifySavedGameLevel } from "../src/features/game-bundle/orchestration.js";
import { createBundlePreviewServer } from "../src/features/level-bundle/server.js";

const example = path.resolve("examples/missing-reporter");
// jsQR exports a CommonJS function; its default-export declaration assumes ESM.
const jsQR = createRequire(import.meta.url)("jsqr") as (
    pixels: Uint8ClampedArray, width: number, height: number
) => QRCode | null;

function attribute(tag: string, name: string): string {
    const value = tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    if (value === undefined) throw new Error(`Missing ${name} in public form.`);
    return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"');
}

/** Decode the pixels actually published to players, independently of the generator. */
function decodeQr(svg: string): string {
    const width = Number(svg.match(/viewBox="0 0 (\d+)/)?.[1]);
    expect(width).toBeGreaterThan(0);
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (const match of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)) {
        const [x, y, w, h] = match.slice(1).map(Number);
        for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
            const offset = (row * width + col) * 4;
            pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 17;
        }
    }
    const result = jsQR(pixels, width, width);
    if (!result) throw new Error("Player-visible QR image cannot be decoded.");
    return result.data;
}

async function listen(server: Server): Promise<string> {
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No preview address.");
    return `http://127.0.0.1:${address.port}`;
}

describe("portable reporter example", () => {
    it("relocates without machine paths and completes using public evidence", async () => {
        const temporary = await mkdtemp(path.join(os.tmpdir(), "reporter-relocated-"));
        const root = path.join(temporary, "different checkout", "example");
        const servers: Server[] = [];
        try {
            await cp(example, root, { recursive: true });
            const raw = await readFile(path.join(root, "game.bundle.json"), "utf8");
            expect(raw).not.toMatch(/\/Users\/|\/home\/|[A-Z]:\\/);
            const saved = await readSavedGameBundle(path.join(root, "game.bundle.json"));
            expect(saved.outputRoot).toBe(path.join(root, "data"));
            // Private inputs are used exclusively to boot the normal server and verifier.
            // All submitted values below are derived from public HTTP responses.
            const origins: string[] = [];
            for (const entry of [...saved.levels].reverse()) {
                const prepared = await loadSavedGameLevel(entry, saved.outputRoot);
                await verifySavedGameLevel(prepared);
                const next = origins[0];
                const server = createBundlePreviewServer({ ...prepared,
                    nextLevel: next ? { title: "Next level", url: next + "/" } : undefined,
                    gameComplete: next === undefined });
                servers.push(server);
                origins.unshift(await listen(server));
            }

            const discoveries = origins.map(() => new Set(["/"]));
            const get = async (index: number, pathname: string): Promise<string> => {
                expect(discoveries[index].has(pathname), `Undiscovered player path: ${pathname}`).toBe(true);
                const response = await fetch(origins[index] + pathname);
                expect(response.status, pathname).toBe(200);
                const html = await response.text();
                for (const m of html.matchAll(/\b(?:href|src)="(\/[^"#]*)"/g)) discoveries[index].add(m[1]);
                return html;
            };
            const lookup = async (index: number, pathname: string, query: string): Promise<string> => {
                const html = await get(index, pathname);
                const form = html.match(/<form\b[^>]*action="\/api\/search"[\s\S]*?<\/form>/)?.[0];
                if (!form) throw new Error(`No public lookup at ${pathname}`);
                const target = attribute(form.match(/<input[^>]*name="target"[^>]*>/)![0], "value");
                const url = (q: string) => origins[index] + "/api/search?" + new URLSearchParams({ target, q });
                const miss = await fetch(url("no-such-record"));
                expect(await miss.text()).toContain("No matching results");
                const hit = await fetch(url(query), { redirect: "manual" });
                expect(hit.status).toBe(303);
                expect(hit.headers.get("location")).toBe(target);
                discoveries[index].add(target);
                return get(index, target);
            };
            const submit = async (index: number, pathname: string, value: string) => {
                const html = await get(index, pathname);
                const form = html.match(/<form\b[^>]*action="\/api\/validate"[\s\S]*?<\/form>/)?.[0];
                if (!form) throw new Error(`No terminal at ${pathname}`);
                const fields = [...form.matchAll(/<input\b[^>]*>/g)].map(m => m[0]);
                const body = new URLSearchParams(fields.filter(tag => attribute(tag, "type") === "hidden")
                    .map(tag => [attribute(tag, "name"), attribute(tag, "value")]));
                const input = fields.find(tag => attribute(tag, "type") === "text")!;
                const send = () => fetch(origins[index] + "/api/validate", { method: "POST", body });
                expect((await send()).status).toBe(422);
                body.set(attribute(input, "name"), value);
                const response = await send();
                expect(response.status).toBe(200);
                const result = await response.text();
                expect(result).toContain(index === 3 ? "Game complete." : origins[index + 1] + "/");
            };

            await get(0, "/"); await get(0, "/research");
            const story = await get(0, "/ledger/stories/waterfront-utility-delays");
            expect(story).toContain("Harbor Point");
            const history = await get(0, "/ledger/corrections/waterfront-utility-reference");
            // The archive supplies this public address as text rather than a link.
            expect(history).toContain("/contracts"); discoveries[0].add("/contracts");
            const correction = await get(0, "/ledger/corrections/waterfront-utility-reference/_artifact/versions/2025-06-18.html");
            const contract = correction.match(/HP-\d{4}-\d{3}/)![0];
            await get(0, "/contracts");
            const award = await lookup(0, "/contracts/search", contract);
            const image = await get(0, "/assets/contracts/award-041.svg");
            expect(image).toContain("Calder Development");
            expect(award).toContain("Payment files");
            await submit(0, "/contracts/search", contract);

            await get(1, "/"); await get(1, "/contracts");
            await get(1, "/contracts/awards/site-preparation");
            await lookup(1, "/payments", contract);
            const invoice = decodeQr(await get(1, "/assets/payment-labels/northline-invoice.svg"));
            const invoicePage = await lookup(1, "/payments/retrieve", invoice);
            expect(invoicePage).toContain(invoice);
            await submit(1, "/payments/retrieve", invoice);

            await get(2, "/"); await get(2, "/invoice-files");
            await get(2, "/parking-records/lookup"); await get(2, "/parking-records/session-record");
            const plate = decodeQr(await get(2, "/assets/parking-ticket.svg"));
            const roster = await get(2, "/calder-vehicles/assignments");
            expect(roster).toContain(plate); expect(roster).toContain("Owen Blake");
            await get(2, "/camera-log/matches"); await get(2, "/camera-log/record");
            const reviewed = await get(2, "/camera-log/record/_artifact/versions/2025-09-19.html");
            expect(reviewed).toContain(plate);
            const address = reviewed.match(/\d+ Mason Street/)![0];
            await get(2, "/camera-log/case-attachment");
            await submit(2, "/police-case/submit-evidence", plate);

            await get(3, "/"); await get(3, "/case-portal");
            const directory = await lookup(3, "/property-directory", address);
            expect(directory).toContain("Unit 3"); expect(directory).toContain("Northline Survey");
            await get(3, "/property-directory/tenant-record");
            const manager = await get(3, "/property-directory/tenant-record/_artifact/versions/2025-08-29.html");
            expect(manager).toContain("Daniel Price");
            await get(3, "/property-directory/entrance-notice");
            const report = await get(3, "/case-portal/location-review");
            const location = report.match(/data-verified-location="([^"]+)"/)![1];
            expect(location).toBe(address + ", Unit 3");
            await submit(3, "/case-portal/send-location", location);

            for (const origin of origins) {
                for (const pathname of ["/private/", "/game.bundle.json", "/../game-design.json"]) {
                    expect((await fetch(origin + pathname)).status).toBe(404);
                }
            }
        } finally {
            await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
            await rm(temporary, { recursive: true, force: true });
        }
    }, 30_000);
});
