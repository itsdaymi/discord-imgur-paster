import assert from "node:assert/strict";
import { test } from "node:test";

import { formatLink, IMGUR_WEB_CLIENT_ID, parseUploadResponse, resolveClientId, resolveFormat, shouldUpload, updateGuildConfig } from "../imgurPaster/utils.ts";

const image = { id: "aBc123", link: "https://i.imgur.com/aBc123.png", deletehash: "del123" };

test("resolveClientId prefers the user's Client ID, else imgur's web uploader ID", () => {
    assert.equal(resolveClientId(" mine "), "mine");
    assert.equal(resolveClientId(""), IMGUR_WEB_CLIENT_ID);
    assert.equal(resolveClientId("   "), IMGUR_WEB_CLIENT_ID);
});

test("formatLink gives the page or the direct link", () => {
    assert.equal(formatLink(image, "page"), "https://imgur.com/aBc123");
    assert.equal(formatLink(image, "direct"), "https://i.imgur.com/aBc123.png");
});

test("resolveFormat uses the server override, else the default", () => {
    const guilds = { g1: { format: "direct" as const }, g2: { auto: true } };
    assert.equal(resolveFormat(guilds, "g1", "page"), "direct");
    assert.equal(resolveFormat(guilds, "g2", "page"), "page");
    assert.equal(resolveFormat(guilds, undefined, "direct"), "direct");
});

test("shouldUpload: hotkey always, plain paste only in auto servers", () => {
    const guilds = { auto: { auto: true }, off: { format: "page" as const } };
    assert.equal(shouldUpload(true, guilds, undefined), true);
    assert.equal(shouldUpload(true, guilds, "off"), true);
    assert.equal(shouldUpload(false, guilds, "auto"), true);
    assert.equal(shouldUpload(false, guilds, "off"), false);
    assert.equal(shouldUpload(false, guilds, "unknown"), false);
    assert.equal(shouldUpload(false, guilds, null), false);
});

test("updateGuildConfig merges, clears, and drops empty entries without mutating", () => {
    const start = { g1: { auto: true } };
    const withFormat = updateGuildConfig(start, "g1", { format: "direct" });
    assert.deepEqual(withFormat, { g1: { auto: true, format: "direct" } });
    assert.deepEqual(start, { g1: { auto: true } });

    const backToDefault = updateGuildConfig(withFormat, "g1", { format: undefined });
    assert.deepEqual(backToDefault, { g1: { auto: true } });

    assert.deepEqual(updateGuildConfig(backToDefault, "g1", { auto: false }), {});
});

test("parseUploadResponse returns the image on success", () => {
    const body = JSON.stringify({ data: { ...image, type: "image/png" }, success: true, status: 200 });
    assert.deepEqual(parseUploadResponse(200, body), image);
});

test("parseUploadResponse surfaces imgur's error messages", () => {
    const stringError = JSON.stringify({ data: { error: "Invalid client_id", request: "/3/image", method: "POST" }, success: false, status: 403 });
    assert.throws(() => parseUploadResponse(403, stringError), /Invalid client_id/);

    const objectError = JSON.stringify({ data: { error: { code: 1003, message: "File type invalid (1)", type: "ImgurException" } }, success: false, status: 400 });
    assert.throws(() => parseUploadResponse(400, objectError), /File type invalid/);

    const errorsArray = JSON.stringify({ errors: [{ code: "429", detail: "Too Many Requests", status: "Too Many Requests" }] });
    assert.throws(() => parseUploadResponse(429, errorsArray), /Too Many Requests/);
});

test("parseUploadResponse handles non-JSON and network failures", () => {
    assert.throws(() => parseUploadResponse(429, "<html>slow down</html>"), /rate limit/);
    assert.throws(() => parseUploadResponse(502, "Bad Gateway"), /HTTP 502/);
    assert.throws(() => parseUploadResponse(-1, "TypeError: fetch failed"), /network error: TypeError: fetch failed/);
});
