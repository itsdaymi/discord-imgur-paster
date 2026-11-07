import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { deleteImage, uploadImage } from "../imgurPaster/native.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
    const calls: { url: string; init: RequestInit; }[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return handler(url, init);
    }) as typeof fetch;
    return calls;
}

test("uploadImage posts the bytes as multipart with the Client-ID header", async () => {
    const calls = mockFetch(() => new Response('{"success":true}', { status: 200 }));
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const res = await uploadImage(null as any, "my-client", bytes, "shot.png", "image/png");

    assert.deepEqual(res, { status: 200, body: '{"success":true}' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.imgur.com/3/image");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(calls[0].init.headers, { Authorization: "Client-ID my-client" });

    const form = calls[0].init.body as FormData;
    const file = form.get("image") as File;
    assert.equal(file.name, "shot.png");
    assert.equal(file.type, "image/png");
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
    assert.equal(form.get("type"), "file");
    assert.ok(calls[0].init.signal instanceof AbortSignal, "upload has a timeout signal");
});

test("uploadImage passes error statuses through and reports network failures as -1", async () => {
    mockFetch(() => new Response("nope", { status: 403 }));
    assert.deepEqual(await uploadImage(null as any, "c", new Uint8Array(), "a.png", "image/png"), { status: 403, body: "nope" });

    mockFetch(() => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); });
    assert.deepEqual(await uploadImage(null as any, "c", new Uint8Array(), "a.png", "image/png"), { status: -1, body: "TimeoutError: The operation was aborted due to timeout" });

    mockFetch(() => { throw new TypeError("fetch failed"); });
    assert.deepEqual(await uploadImage(null as any, "c", new Uint8Array(), "a.png", "image/png"), { status: -1, body: "TypeError: fetch failed" });
});

test("deleteImage sends DELETE to the deletehash URL", async () => {
    const calls = mockFetch(() => new Response('{"success":true}', { status: 200 }));

    const res = await deleteImage(null as any, "my-client", "abc/def");

    assert.equal(res.status, 200);
    assert.equal(calls[0].url, "https://api.imgur.com/3/image/abc%2Fdef");
    assert.equal(calls[0].init.method, "DELETE");
    assert.ok(calls[0].init.signal instanceof AbortSignal, "delete has a timeout signal");
    assert.deepEqual(calls[0].init.headers, { Authorization: "Client-ID my-client" });
});
