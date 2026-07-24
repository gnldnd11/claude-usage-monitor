# Claude Usage Monitor

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/hero.png" width="360" alt="Claude Usage panel showing session, weekly, context meters, a usage ring, and the crab mascot" />
</p>

Live **Claude Code** usage at a glance — session & weekly limits, context window, and today's tokens & requests. Shows in the VS Code status bar and an always-visible Explorer panel. Now with an **Agents (Beta)** view that turns your subagents into pixel characters you can watch, rename, and restyle.

> Unofficial community extension. Not affiliated with Anthropic.

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/mascot-idle.gif" width="76" alt="idle crab" />
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/mascot-working.gif" width="76" alt="working crab" />
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/mascot-despair.gif" width="76" alt="despairing crab" />
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/mascot-stunned.gif" width="76" alt="stunned crab" />
</p>
<p align="center"><sub>The crab reads your session usage: calm under 50%, heads-down at 50%, unravelling past 70%, flat-out near the limit.</sub></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/responsive.png" width="440" alt="Compact bars-only view and a narrowed panel with the tiles tucked away" />
</p>
<p align="center"><sub>Collapse it to bars, or narrow it and the tiles tuck away — nothing truncates.</sub></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/customize.png" width="300" alt="In-panel settings sheet with status bar mode and per-element panel toggles" />
</p>
<p align="center"><sub>Click the gear to pick what shows in the status bar, and toggle any panel element on or off.</sub></p>

## Agents (Beta)

A living view of your Claude Code subagents. Every agent in `.claude/agents/` gets its own distinct pixel character; when one is actually invoked it walks into the **Workroom** and works at the desk — so you can see who is running, right now, at a glance.

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-cave-night.png" width="290" alt="Agents tab: two agents working in the room, with the full Crew roster of pixel characters below" />
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-backrooms.png" width="290" alt="A different room theme with the roster collapsed to a compact now-running strip" />
</p>
<p align="center"><sub>Agents walk in when invoked — red pulse while running, green check when done. Collapse the roster and it becomes a compact "now running" strip. Swap room themes from the dropdown.</sub></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-settings.png" width="300" alt="Per-agent settings: nickname, role, model dropdown, and a character appearance picker" />
</p>
<p align="center"><sub>Click a character's gear to rename it, give it a role, swap its character, or change its model — the model change is written straight to the agent's <code>.claude/agents/*.md</code>.</sub></p>

Detection is **transcript-based and read-only** — it never blocks or changes how your agents run. Because a background subagent has no knowable progress, running agents show an indeterminate bar and elapsed time, not a fabricated percentage.

## Features

- **Session (5h) / Weekly (7d)** limits — the same live numbers as Claude Code's built-in usage dialog, refreshed every 60s.
- **Context window** — how full the current conversation is (auto-detects 200K / 1M window).
- **Today's tokens & requests** — summed across all your local Claude Code sessions, resets at local midnight.
- **Status bar** — compact `S ●●●●○○ 54% · W 46%`, turns amber at 70% and red at 90%.
- **Panel** — full dashboard with progress bars, a usage ring, and live count-up animations. One click collapses it to bars-only; narrow it and the tiles tuck away so nothing truncates.
- **Agents (Beta)** — your subagents as distinct pixel characters that walk into a room when invoked; rename, re-role, restyle, or re-model each from the panel, and pick a room theme. Read-only, hook-free.

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
