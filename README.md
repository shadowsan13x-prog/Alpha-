# 𝘼𝙇𝙋𝙃𝘼 『💠』 — Standalone Messenger Bot

This build contains the Messenger bot only. The web interface, control panel, Telegram bridge, panel session manager and session dashboard have been removed.

## Setup

1. Install Node.js 24 or newer.
2. Run `npm ci`.
3. Copy `config.example.json` to `config.json` and set `DEV_ID` to the developer's Facebook numeric ID.
4. Put a valid Messenger app-state file at `appState.json` in the project root. The uploaded archive did not include the active session file, so it must be supplied separately.
5. Run `npm start`.

For Railway, deploy this as a worker/service without an HTTP port; this build has no web panel or web server.

The default bot name and group nickname are `𝘼𝙇𝙋𝙃𝘼 『💠』`. The configured developer is `𝐊̸̷̱͠𝐀̸̷̲͞𝐈̸̷̱ 『💠』` (https://www.facebook.com/profile.php?id=61595043507005) and the default developer nickname is `𝐊̸̷̱͠𝐀̸̷̲͞𝐈̸̷̱ 『💠』`. The bot stores its own settings in `data.json`, command statistics in `quasar-stats.json`, and settings backups in `backups/settings/`. These runtime files are local and are not included in this source package.

## Commands

The default prefix is `/`; change it with `/setprefix [symbol]`.

### Owner and administration
`/owner`, `/addowner [ID]`, `/delowner [ID]`, `/addadmin [ID]`, `/deladmin [ID]`, `/admins`, `/setprefix [symbol]`, `/reset`.

### Automation
`/nm [text]` / `/nm off`, `/nick [text]` / `/nick off`, `/angel [text] [min] [max]` / `/angel off`, `/autoreply [text 1 | text 2]`, `/autoreply on`, `/autoreply off`, `/setavatar` (reply to an image), `/out`.

For `angel`, `ث` or `s` means seconds, and `د` or `m` means minutes. Example: `/angel Hello 10ث 2د`. The message is sent once immediately and then at random intervals until `/angel off`; the minimum accepted interval is one second to prevent an accidental instant-send loop.

For random auto-replies, the primary developer configures reply candidates using `/autoreply text one | text two`. Then use `/autoreply on` in a chat. Each incoming message in that chat, including command messages, gets one randomly selected reply. Stop with `/autoreply off`.

### Interaction
`/help`, `/ping`, `/info`, `/id`, `/profile`, `/say [text]`, `/time`, `/uptime`.

### Chats
`/chats`, `/chatinfo [ID]`, `/send [ID] [text]` (owner only), `/chathelp`.

### Bot settings and tools
`/status`, `/settings`, `/prefix`, `/logs`, `/backup`, `/restore`, `/open`, `/close`, `/setbio [text]`, `/unsend` (reply to a bot message), `/command load`.

## Access rules

- `DEV_ID` / `DEV_IDS` are primary developer accounts.
- The primary developer can add or remove additional owners.
- Owners can add or remove bot admins.
- When public mode is closed, non-developers cannot run commands. `/open` and `/close` remain developer-only.
- Developer-only commands include nickname protection, profile changes, avatar changes and command reload.

## Important

Never share `appState.json`, cookies, `config.json`, API keys or backup folders publicly. The source ZIP intentionally excludes active Facebook login data and secrets.


## Automatic replies
The developer sets reply choices with `/autoreply text one | text two`. In each chat, `/autoreply on` enables one randomly selected reply for every incoming message; `/autoreply off` disables it.

## Random sender time units
`/angel [message] [min] [max]` accepts `ث` for seconds and `د` for minutes (also `s` and `m`). Stop it with `/angel off`.
