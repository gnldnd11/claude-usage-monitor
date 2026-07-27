# Claude Usage Crab

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-cave-night.png" width="360" alt="Agents tab: subagents as pixel characters working in a room, with the Crew roster below" />
</p>

**See which Claude Code subagents are running, right now, without leaving VS Code.** Each agent in `.claude/agents/` becomes a distinct pixel character; when one is actually invoked it walks into the Room and gets to work. Live session, weekly and context usage sit in the same panel and in the status bar.

Read-only, hook-free, local. Nothing to configure.

> Unofficial community extension. Not affiliated with Anthropic.

## Agents (Beta)

A background subagent is a black box: you fire one off and then wonder whether it is working, finished, or wedged. This tab answers that at a glance.

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-cave-night.png" width="290" alt="Two agents working in the room, with the full Crew roster of pixel characters below" />
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-backrooms.png" width="290" alt="A different room theme with the roster collapsed to a compact now-running strip" />
</p>
<p align="center"><sub>Agents walk in when invoked. Red pulse while running, green check when done. Collapse the roster and it becomes a compact "now running" strip. Swap room themes from the dropdown.</sub></p>

- **Who is running**, as a character in the room, not a line of text you have to go looking for. Parallel calls of the same agent show as separate characters, side by side.
- **What it costs** — the harness stamps each finished subagent's tokens, tool calls and duration into the transcript, and the roster rolls them up per agent: today's runs, tokens, and typical duration. "Which agent eats my weekly limit" is a fact here, not a guess.
- **Stuck?** — an agent running far past its own usual duration is flagged amber instead of silently disappearing, so a wedged background agent is something you notice, not something you wonder about.
- **Distinct character per agent**, so you recognise the roster at a glance instead of reading names.
- **Room themes** (Blocky Cave, Backrooms, Liminal Office) with session and weekly usage overlaid on the room, so you can watch agents and your limits in one view.

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-settings.png" width="300" alt="Per-agent settings: nickname, role, model dropdown, and a character appearance picker" />
</p>
<p align="center"><sub>Click a character's gear to rename it, give it a role, swap its character, or change its model. The model change is written straight to the agent's <code>.claude/agents/*.md</code>.</sub></p>

Detection is **transcript-based and read-only**. It never blocks or changes how your agents run, and it needs no hooks or setup. Because a background subagent has no knowable progress, running agents show an indeterminate bar and elapsed time, not a fabricated percentage.

## Usage panel

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/hero.png" width="360" alt="Claude Usage panel showing session, weekly, context meters, a usage ring, and the crab mascot" />
</p>

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
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/customize.png" width="230" alt="In-panel settings sheet with status bar mode and per-element panel toggles" />
</p>
<p align="center"><sub>Collapse it to bars, or narrow it and the tiles tuck away, nothing truncates. Click the gear to choose what shows in the status bar and the panel.</sub></p>

## Features

- **Agents (Beta)** — your subagents as distinct pixel characters that walk into a room when invoked. Rename, re-role, restyle, or re-model each from the panel, and pick a room theme. Read-only, hook-free.
- **Session (5h) / Weekly (7d) / Fable (7d)** — the same live numbers as Claude Code's built-in usage dialog.
- **Context window** — how full the current conversation is, scoped to the workspace you are actually in.
- **Today's tokens & requests** — summed across your local Claude Code sessions, with a `+N k` delta after each response. Resets at local midnight.
- **Status bar** — compact `S ●●●●○○ 54% · W 46%`, turns red as you approach the limit.
- **Burn-rate warning** — a heads-up when one request's token spend spikes well past today's average.

## How it works & privacy

Everything is read locally from your `~/.claude` folder. No telemetry, no third party, no server of ours.

- **Agents, tokens, requests, context** — parsed from your local session transcripts (`~/.claude/projects/**/*.jsonl`).
- **Session / weekly / Fable limits** — primarily by *listening*, not polling. When the Claude Code extension checks its own usage in the same host process, this extension observes that response through Node's `diagnostics_channel` and reuses it. That means **zero extra API requests** in normal use, and numbers that match the built-in dialog exactly because they *are* the built-in dialog's numbers.
- **Fallback** — if that tap has been quiet for a while, the extension falls back to calling Anthropic's usage endpoint (`https://api.anthropic.com/api/oauth/usage`) itself, using your own signed-in token, or Claude Code's stored OAuth token if you have not signed in.

Your token is sent **only** to `api.anthropic.com` and nowhere else. The code is open, and it is plain JavaScript with no build step, so what is in the `.vsix` is what is in the repo.

The usage endpoint and the transcript format are both undocumented and may change; if they do, the affected numbers may stop updating until the extension is updated.

## Getting started

Install, then open the **Explorer** sidebar. The **Claude Usage** panel appears alongside your files, with **Usage** and **Agents** tabs. The status bar item shows a compact summary and opens the panel on click. Use the chevron in the header to collapse to a bars-only view (your choice is remembered).

Agents show up automatically for any `.claude/agents/*.md` in the workspace or in `~/.claude/agents/`. No hooks, no config.

## Requirements

- Claude Code (CLI or VS Code extension) signed in with a Claude account.
- macOS / Linux / Windows. Data is read from `~/.claude`.

## License

The extension source is MIT. See [LICENSE](LICENSE).

The bundled pixel art is **not** covered by the MIT licence. It is licensed third-party artwork included here under its own terms, for use within this extension only. See the third-party notice in [LICENSE](LICENSE).
