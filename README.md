# Claude Usage Monitor

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/hero.png" width="360" alt="Claude Usage panel showing session, weekly, context meters, a usage ring, and the crab mascot" />
</p>

Live **Claude Code** usage at a glance — session & weekly limits, context window, and today's tokens & requests. Shows in the VS Code status bar and an always-visible Explorer panel.

> Unofficial community extension. Not affiliated with Anthropic.

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/mascot-idle.gif" width="84" alt="idle crab" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/mascot-working.gif" width="84" alt="working crab" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/mascot-stunned.gif" width="84" alt="stunned crab" />
</p>
<p align="center"><sub>The crab reads your session usage: calm under 50%, heads-down while working, flat-out near the limit.</sub></p>

## Features

- **Session (5h) / Weekly (7d)** limits — the same live numbers as Claude Code's built-in usage dialog, refreshed every 60s.
- **Context window** — how full the current conversation is (auto-detects 200K / 1M window).
- **Today's tokens & requests** — summed across all your local Claude Code sessions, resets at local midnight.
- **Status bar** — compact `S ●●●●○○ 54% · W 46%`, turns amber at 70% and red at 90%.
- **Panel** — full dashboard with progress bars, a usage ring, and live count-up animations. One click collapses it to bars-only; narrow it and the tiles tuck away so nothing truncates.

## How it works & privacy

All data is read locally from your `~/.claude` folder:

- **Tokens, requests, context** — parsed from your local session transcripts (`~/.claude/projects/**/*.jsonl`).
- **Session / weekly limits** — to match the built-in dialog exactly, the extension reads your Claude Code OAuth token from `~/.claude/.credentials.json` and calls Anthropic's usage endpoint (`https://api.anthropic.com/api/oauth/usage`) — the same source Claude Code itself uses.

Your token is sent **only** to `api.anthropic.com` and nowhere else. No data is sent to any third party or telemetry service. The code is open — read `extension.js`.

The usage endpoint is undocumented and may change; if it does, session/weekly may stop updating until the extension is updated.

## Usage

Install, then open the **Explorer** sidebar — the **Claude Usage** panel appears alongside your files. Use the chevron in its header to collapse to a compact bars-only view (your choice is remembered). The status bar item shows a compact summary and opens the panel on click.

## Requirements

- Claude Code (CLI or VS Code extension) signed in with a Claude account.
- macOS / Linux / Windows — data is read from `~/.claude`.

## License

MIT
