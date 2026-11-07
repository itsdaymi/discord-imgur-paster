<img src="assets/icon.svg" width="64" height="64" alt="">

# discord imgur paster

A [Vencord](https://vencord.dev) plugin for servers that only allow images as imgur links. Instead of attaching the clipboard image to your message, it uploads it to imgur and pastes the link into the chat box.

- **Ctrl+Shift+V** (Cmd+Shift+V on macOS) uploads the clipboard image and pastes the link, anywhere.
- **Per-server auto mode:** right click a server → **Imgur Paster** → **Upload pasted images to imgur**. In that server a plain Ctrl+V of an image goes to imgur as well.
- **Link format:** pick the default in the plugin settings (`imgur.com/abc` page link or `i.imgur.com/abc.png` direct link). You can override it per server from the same right-click menu.
- **No accidental raw posts:** once the plugin decides to handle a paste, the image is never attached to Discord, even if the upload fails. You get an error toast instead.
- **Delete later:** every upload is listed in the plugin settings with a **Delete** button, plus **Delete all**. This uses the deletehash imgur hands out for anonymous uploads. The list is stored locally only.

If you switch channels while an upload is running, the link is copied to your clipboard instead of being pasted into the wrong chat.

## Setup

### imgur Client ID

imgur no longer accepts new API app registrations. So when the plugin's **Client Id** setting is empty, it uses the Client ID that imgur.com's own web uploader uses. That needs no setup, but it's imgur's credential rather than one issued to you: imgur can change or block it at any time, and using it is a gray area under their terms. If you already have a registered imgur app, paste its Client ID into the setting and it takes precedence.

Either way, uploads are anonymous: they're public to anyone who has the link, and you can only delete them through the plugin's upload list.

### Install the plugin

Third-party plugins need a Vencord build from source. See [Installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/).

```sh
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile

# put the plugin into src/userplugins
git clone https://github.com/itsdaymi/discord-imgur-paster ../discord-imgur-paster
mkdir -p src/userplugins
cp -r ../discord-imgur-paster/imgurPaster src/userplugins/

pnpm build
pnpm inject   # first time only, points Discord at your build
```

Restart Discord and enable **ImgurPaster** under Vencord → Plugins.

The plugin uses a `native.ts` helper to talk to imgur from Discord's main process, so it works in the desktop app (Discord + Vencord, or Vesktop). It doesn't work in the browser extension.

## Notes

- imgur's API limits apply: images up to 20 MB, and roughly 50 uploads per hour per IP for anonymous uploads.
- imgur removes NSFW content and blocks users in the UK.
- Client mods are against Discord's Terms of Service. Use at your own risk.

## Development

`imgurPaster/utils.ts` (pure logic) and `imgurPaster/native.ts` (the imgur requests) have unit tests that run on plain Node 22.18+:

```sh
npm test
```

CI also typechecks, lints, and builds the plugin inside a current Vencord checkout. See `.github/workflows/ci.yml`.

## License

GPL-3.0-or-later, like Vencord.
