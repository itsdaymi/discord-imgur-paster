/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Daymi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Runs in Electron's main process, so requests are not subject to Discord's CSP or CORS.

import type { IpcMainInvokeEvent } from "electron";

const API = "https://api.imgur.com/3/image";
// Without a timeout a stalled request would leave the "Uploading..." toast as the last word forever
const TIMEOUT_MS = 120_000;

export interface NativeResponse {
    status: number;
    body: string;
}

export async function uploadImage(_: IpcMainInvokeEvent, clientId: string, data: Uint8Array<ArrayBuffer>, filename: string, mime: string): Promise<NativeResponse> {
    const form = new FormData();
    form.append("image", new Blob([data], { type: mime }), filename);
    form.append("type", "file");

    try {
        const res = await fetch(API, {
            method: "POST",
            headers: { Authorization: `Client-ID ${clientId}` },
            body: form,
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        return { status: res.status, body: await res.text() };
    } catch (e) {
        return { status: -1, body: String(e) };
    }
}

export async function deleteImage(_: IpcMainInvokeEvent, clientId: string, deletehash: string): Promise<NativeResponse> {
    try {
        const res = await fetch(`${API}/${encodeURIComponent(deletehash)}`, {
            method: "DELETE",
            headers: { Authorization: `Client-ID ${clientId}` },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
        return { status: res.status, body: await res.text() };
    } catch (e) {
        return { status: -1, body: String(e) };
    }
}
