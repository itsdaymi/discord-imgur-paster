/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Daymi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { copyToClipboard } from "@utils/clipboard";
import { confirmAction, getCurrentChannel, insertTextIntoChatInputBox } from "@utils/discord";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Guild } from "@vencord/discord-types";
import { Menu, SelectedChannelStore, showToast, useEffect, useState } from "@webpack/common";

import { formatLink, GuildConfig, GuildConfigs, ImgurImage, LinkFormat, parseUploadResponse, resolveFormat, shouldUpload, updateGuildConfig } from "./utils";

const Native = VencordNative.pluginHelpers.ImgurPaster as PluginNative<typeof import("./native")>;

const HISTORY_KEY = "ImgurPaster_uploads";

interface UploadRecord extends ImgurImage {
    date: number;
}

const settings = definePluginSettings({
    clientId: {
        type: OptionType.STRING,
        description: "Your imgur API Client ID (register an app at https://api.imgur.com/oauth2/addclient)",
        default: ""
    },
    defaultFormat: {
        type: OptionType.SELECT,
        description: "Link format for DMs and servers without an override (right click a server to override)",
        options: [
            { label: "imgur page (imgur.com/abc)", value: "page", default: true },
            { label: "Direct image (i.imgur.com/abc.png)", value: "direct" }
        ]
    },
    history: {
        type: OptionType.COMPONENT,
        component: () => <UploadHistory />
    },
    guilds: {
        type: OptionType.CUSTOM,
        default: {} as GuildConfigs
    }
});

function toast(text: string, variant: "default" | "success" | "critical" = "default") {
    showToast({ text, variant });
}

/** Deletes the image from imgur and forgets it. Returns the HTTP status on failure, or null on success. */
async function removeUpload(upload: UploadRecord): Promise<number | null> {
    const res = await Native.deleteImage(settings.store.clientId.trim(), upload.deletehash);
    // 404 means it is already gone, so forget it either way
    if (res.status !== 200 && res.status !== 404) return res.status;
    await DataStore.update<UploadRecord[]>(HISTORY_KEY, list => (list ?? []).filter(u => u.deletehash !== upload.deletehash));
    return null;
}

async function deleteUpload(upload: UploadRecord): Promise<boolean> {
    const failedStatus = await removeUpload(upload);
    if (failedStatus !== null) {
        toast(`Could not delete imgur image (HTTP ${failedStatus})`, "critical");
        return false;
    }
    toast("Deleted from imgur", "success");
    return true;
}

/** Deletes every upload one by one (gentle on imgur's rate limit). Returns the ones that could not be deleted. */
async function deleteAllUploads(uploads: UploadRecord[]): Promise<UploadRecord[]> {
    const failed: UploadRecord[] = [];
    for (const upload of uploads) {
        if (await removeUpload(upload) !== null) failed.push(upload);
    }
    if (failed.length) toast(`Deleted ${uploads.length - failed.length} of ${uploads.length} imgur images, ${failed.length} failed`, "critical");
    else toast(`Deleted all ${uploads.length} imgur images`, "success");
    return failed;
}

function UploadHistory() {
    const [uploads, setUploads] = useState<UploadRecord[] | null>(null);
    const [deletingAll, setDeletingAll] = useState(false);
    useEffect(() => {
        DataStore.get<UploadRecord[]>(HISTORY_KEY).then(list => setUploads(list ?? []));
    }, []);

    if (!uploads) return null;

    return (
        <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Paragraph weight="semibold">Your uploads ({uploads.length})</Paragraph>
                {uploads.length > 0 && (
                    <Button
                        size="small"
                        variant="dangerPrimary"
                        disabled={deletingAll}
                        onClick={async () => {
                            const confirmed = await confirmAction({
                                title: "Delete all imgur uploads?",
                                subtitle: `This deletes all ${uploads.length} images from imgur. It cannot be undone.`,
                                confirmText: "Delete all",
                                variant: "critical-primary"
                            });
                            if (!confirmed) return;
                            setDeletingAll(true);
                            try {
                                setUploads(await deleteAllUploads(uploads));
                            } finally {
                                setDeletingAll(false);
                            }
                        }}
                    >
                        {deletingAll ? "Deleting..." : "Delete all"}
                    </Button>
                )}
            </div>
            {!uploads.length && <Paragraph>Nothing uploaded yet.</Paragraph>}
            {[...uploads].reverse().map(u => (
                <div key={u.deletehash} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <Link href={formatLink(u, "page")} style={{ flex: 1 }}>imgur.com/{u.id}</Link>
                    <Paragraph>{new Date(u.date).toLocaleString()}</Paragraph>
                    <Button
                        size="small"
                        variant="dangerSecondary"
                        onClick={async () => {
                            if (await deleteUpload(u)) setUploads(list => list!.filter(x => x.deletehash !== u.deletehash));
                        }}
                    >
                        Delete
                    </Button>
                </div>
            ))}
        </section>
    );
}

async function upload(files: File[], channelId: string, guildId: string | null | undefined) {
    const clientId = settings.store.clientId.trim();
    if (!clientId) {
        toast("Imgur Paster: set your imgur Client ID in the plugin settings first", "critical");
        return;
    }

    toast(files.length > 1 ? `Uploading ${files.length} images to imgur...` : "Uploading to imgur...");

    try {
        const images = await Promise.all(files.map(async file => {
            const res = await Native.uploadImage(clientId, new Uint8Array(await file.arrayBuffer()), file.name || "image.png", file.type);
            const image = parseUploadResponse(res.status, res.body);
            await DataStore.update<UploadRecord[]>(HISTORY_KEY, list => [...(list ?? []), { ...image, date: Date.now() }]);
            return image;
        }));

        const format = resolveFormat(settings.store.guilds, guildId, settings.store.defaultFormat as LinkFormat);
        const text = images.map(image => formatLink(image, format)).join(" ");

        if (SelectedChannelStore.getChannelId() === channelId) {
            insertTextIntoChatInputBox(text);
            toast("imgur link pasted", "success");
        } else {
            await copyToClipboard(text);
            toast("You switched channels, so the imgur link was copied to your clipboard", "success");
        }
    } catch (e) {
        toast(`imgur upload failed: ${e instanceof Error ? e.message : e}`, "critical");
    }
}

// Ctrl+Shift+V forces an imgur upload anywhere. The paste event itself does not say whether Shift was held,
// so remember the keydown and consume it in the paste handler that follows.
let hotkeyPressedAt = 0;

function onKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === "KeyV") hotkeyPressedAt = Date.now();
}

function onPaste(e: ClipboardEvent) {
    const hotkey = Date.now() - hotkeyPressedAt < 1000;
    hotkeyPressedAt = 0;

    const files = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;

    const channel = getCurrentChannel();
    if (!channel || !shouldUpload(hotkey, settings.store.guilds, channel.guild_id)) return;

    // Never let the raw image through, even if the upload fails afterwards
    e.preventDefault();
    e.stopImmediatePropagation();
    void upload(files, channel.id, channel.guild_id);
}

const guildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    const { guilds, defaultFormat } = settings.use(["guilds", "defaultFormat"]);
    if (!guild) return;

    const config = guilds[guild.id] ?? {};
    const update = (patch: GuildConfig) => settings.store.guilds = updateGuildConfig(settings.store.guilds, guild.id, patch);

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem id="vc-imgur-paster" label="Imgur Paster">
                <Menu.MenuCheckboxItem
                    id="vc-imgur-paster-auto"
                    label="Upload pasted images to imgur"
                    checked={!!config.auto}
                    action={() => update({ auto: !config.auto })}
                />
                <Menu.MenuSeparator />
                <Menu.MenuRadioItem
                    id="vc-imgur-paster-format-default"
                    group="vc-imgur-paster-format"
                    label={`Default link (${defaultFormat === "direct" ? "direct image" : "imgur page"})`}
                    checked={!config.format}
                    action={() => update({ format: undefined })}
                />
                <Menu.MenuRadioItem
                    id="vc-imgur-paster-format-page"
                    group="vc-imgur-paster-format"
                    label="imgur page link"
                    checked={config.format === "page"}
                    action={() => update({ format: "page" })}
                />
                <Menu.MenuRadioItem
                    id="vc-imgur-paster-format-direct"
                    group="vc-imgur-paster-format"
                    label="Direct image link"
                    checked={config.format === "direct"}
                    action={() => update({ format: "direct" })}
                />
            </Menu.MenuItem>
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "ImgurPaster",
    description: "Ctrl+Shift+V uploads the clipboard image to imgur and pastes the link. Right click a server to upload every pasted image there and to pick the link format.",
    authors: [{ name: "Daymi", id: 0n }],
    settings,

    contextMenus: {
        "guild-context": guildContextMenuPatch
    },

    start() {
        document.addEventListener("keydown", onKeyDown, { capture: true });
        document.addEventListener("paste", onPaste, { capture: true });
    },

    stop() {
        document.removeEventListener("keydown", onKeyDown, { capture: true });
        document.removeEventListener("paste", onPaste, { capture: true });
    }
});
