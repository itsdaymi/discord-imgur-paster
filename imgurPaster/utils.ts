/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Daymi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Pure helpers with no Vencord/Discord imports, so they can be unit tested with plain Node.

export type LinkFormat = "page" | "direct";

export interface GuildConfig {
    /** Upload images pasted with plain Ctrl+V to imgur in this server */
    auto?: boolean;
    /** Link format override for this server; falls back to the global default */
    format?: LinkFormat;
}

export type GuildConfigs = Record<string, GuildConfig>;

export interface ImgurImage {
    id: string;
    link: string;
    deletehash: string;
}

export function formatLink(image: ImgurImage, format: LinkFormat): string {
    return format === "direct" ? image.link : `https://imgur.com/${image.id}`;
}

export function resolveFormat(guilds: GuildConfigs, guildId: string | null | undefined, fallback: LinkFormat): LinkFormat {
    return (guildId && guilds[guildId]?.format) || fallback;
}

export function shouldUpload(hotkey: boolean, guilds: GuildConfigs, guildId: string | null | undefined): boolean {
    return hotkey || (!!guildId && !!guilds[guildId]?.auto);
}

/** Returns a copy of `guilds` with `patch` applied to `guildId`, dropping the entry once it holds no settings. */
export function updateGuildConfig(guilds: GuildConfigs, guildId: string, patch: GuildConfig): GuildConfigs {
    const merged: GuildConfig = { ...guilds[guildId], ...patch };
    if (!merged.auto) delete merged.auto;
    if (!merged.format) delete merged.format;

    const next = { ...guilds };
    if (Object.keys(merged).length) next[guildId] = merged;
    else delete next[guildId];
    return next;
}

function describeError(data: any): string | undefined {
    const err = data?.data?.error ?? data?.errors?.[0];
    if (typeof err === "string") return err;
    return err?.message ?? err?.detail;
}

/** Parses an imgur upload response. Throws an Error with a readable message on failure. */
export function parseUploadResponse(status: number, body: string): ImgurImage {
    // status -1 is how native.ts reports a request that never got a response
    if (status === -1) throw new Error(`network error: ${body}`);

    let data: any;
    try {
        data = JSON.parse(body);
    } catch {
        throw new Error(status === 429 ? "imgur rate limit hit, try again later" : `imgur returned HTTP ${status}`);
    }

    const image = data?.data;
    if (status >= 200 && status < 300 && data?.success !== false && image?.id && image?.link && image?.deletehash) {
        return { id: image.id, link: image.link, deletehash: image.deletehash };
    }

    throw new Error(describeError(data) ?? `imgur returned HTTP ${status}`);
}
