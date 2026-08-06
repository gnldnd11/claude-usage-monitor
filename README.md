# Claude Usage Crab

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-room.png" width="330" alt="Agents tab: a subagent working at the desk in an isometric room, with the Crew roster of pixel characters below" />
</p>

**See which Claude Code subagents are running, right now, without leaving VS Code.** Every agent in `.claude/agents/` becomes a distinct pixel character. When one is actually invoked it walks into the Room, sits at the desk and gets to work. Live session, weekly and context usage sit in the same panel and in the status bar.

Read-only, hook-free, local. Nothing to configure.

> Unofficial community extension. Not affiliated with Anthropic.

## Agents (Beta)

A background subagent is a black box. You fire one off and then wonder whether it is working, finished, or wedged. This tab answers that at a glance.

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-room.png" width="290" alt="An agent typing at the desk while the full Crew roster shows every agent with its level" />
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-running.png" width="290" alt="A different room theme with the roster collapsed into a compact now-running strip" />
</p>
<p align="center"><sub>Agents walk in when invoked and type at the desk while they work. Fold the Crew and it becomes a compact "now running" strip with the task and elapsed time. Pick from twelve rooms in a thumbnail grid.</sub></p>

- **Who is running**, as a character in the room, not a log line you have to go looking for. Parallel calls of the same agent stand side by side as separate characters.
- **What it cost.** The harness stamps each finished subagent's tokens, tool calls and duration into the transcript, and the panel reads them back. "Which agent eats my weekly limit" is a fact here, not a guess.
- **Stuck?** An agent running far past its own usual duration is flagged amber instead of quietly vanishing, so a wedged background agent is something you notice.
- **Levels that mean something.** Finishing work earns XP, so an agent's level is a readout of how much it has actually done for you. Your history is swept once on first run, so nobody starts at Lv.1 with a year of work behind them.

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-crew-card.png" width="300" alt="Hovering a character shows a crew card with its level, XP progress, lifetime tasks, tokens and active time" />
</p>
<p align="center"><sub>Hover a character for its crew card: level and XP progress, plus the lifetime tasks, tokens and active time that earned it.</sub></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-appearance-human.png" width="250" alt="Per-agent settings with a nickname, role, model dropdown and the human character picker" />
  &nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/agents-appearance-monster.png" width="250" alt="The same settings sheet showing the monster character picker" />
</p>
<p align="center"><sub>Give an agent a nickname and a role, pick its character from 38 sprites, or change its model. The model change is written straight to the agent's <code>.claude/agents/*.md</code>. Agents you never want to see can be hidden, and brought back from the Hidden row.</sub></p>

Detection is **transcript-based and read-only**. It never blocks or changes how your agents run, and it needs no hooks or setup. Claude Code's own built-in agents (Explore, Plan, general-purpose) show up too, labelled as such, so a character you never created is never a surprise.

Because a background subagent has no knowable progress, running agents show an indeterminate bar and elapsed time, not a fabricated percentage.

## Usage panel

<p align="center">
  <img src="https://raw.githubusercontent.com/gnldnd11/claude-usage-monitor/main/media/usage-panel.png" width="330" alt="Usage panel with session, weekly, Fable and context meters, a usage ring, the crab mascot and today's stat tiles" />
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

## Features

- **Agents (Beta).** Your subagents as distinct pixel characters that walk into a room when invoked, with levels, lifetime stats and per-agent nickname, role, character and model. Read-only, hook-free.
- **Session (5h) / Weekly (7d) / Fable (7d).** The same live numbers as Claude Code's built-in usage dialog.
- **Context window.** How full the current conversation is, scoped to the workspace you are actually in, with the window tier detected per session.
- **Today's tokens and requests.** Summed across your local Claude Code sessions, with a `+N k` delta after each response. Resets at local midnight.
- **Status bar.** A compact `5h 54% · wk 46%`, turning red as you approach the limit.
- **Burn-rate warning.** A heads-up when one recent request's token spend spikes well past today's average.
- **Fold what you don't need.** Room and Crew each collapse from their own header and remember the choice, so the panel takes only the space you want to give it.

## How it works and privacy

Everything is read locally from your `~/.claude` folder. No telemetry, no third party, no server of ours.

- **Agents, tokens, requests, context** are parsed from your local session transcripts (`~/.claude/projects/**/*.jsonl`), incrementally, so a long day of transcripts does not mean re-reading them every tick.
- **Session, weekly and Fable limits** come from *listening* rather than polling. When the Claude Code extension checks its own usage in the same host process, this extension observes that response through Node's `diagnostics_channel` and reuses it. That means **zero extra API requests** in normal use, and numbers that match the built-in dialog exactly because they *are* the built-in dialog's numbers.
- **Fallback.** If that tap has been quiet for a while, the extension calls Anthropic's usage endpoint (`https://api.anthropic.com/api/oauth/usage`) itself, using your own signed-in token, or Claude Code's stored OAuth token if you have not signed in.

Your token is sent **only** to `api.anthropic.com` and nowhere else. The code is open, and it is plain JavaScript with no build step, so what ships in the `.vsix` is what is in the repo.

The usage endpoint and the transcript format are both undocumented and may change. If they do, the affected numbers may stop updating until the extension is updated.

## Getting started

Install, then open the **Explorer** sidebar. The **Claude Usage** panel appears alongside your files with **Usage** and **Agents** tabs. The status bar item shows a compact summary and opens the panel on click.

Don't want it on the left? Drag the **Claude Usage** view header into the secondary side bar on the right, or down into the bottom panel next to the Terminal. VS Code remembers where you put it.

Agents appear automatically for any `.claude/agents/*.md` in the workspace or in `~/.claude/agents/`. No hooks, no config.

## Requirements

- Claude Code (CLI or VS Code extension) signed in with a Claude account.
- macOS, Linux or Windows. Data is read from `~/.claude`.

## License

The extension source is MIT. See [LICENSE](LICENSE).

The bundled pixel art is **not** covered by the MIT licence. It is licensed third-party artwork included here for use within this extension only, and is not offered for reuse or redistribution. See the third-party notice in [LICENSE](LICENSE).
