# Changelog

## 1.15.0: Credits and a crab dealer

- **Credits**: every 100K weighted tokens you use earns 1 credit. Tokens are weighted like API prices: input 1, output 5, cache writes 1.25, cache reads 0.1, the same for every model. On first run, past sessions are counted once in the background, as far back as your transcripts go, so you start with what you have already earned. The balance sits in the header next to a coin that fills toward the next credit; hover for today's earnings. Hide it from the settings gear.
- **Tokens and Requests now read about half of what they did**: Claude Code writes one transcript line per content block of a single response, and every line used to be counted. Each response is now counted once, so both tiles show the real numbers.
- **Blackjack**: click the credits line to sit down at the crab's table and play your credits. Six decks, the dealer stands on soft 17, blackjack pays 3:2, double on your first two cards, split once. The extension deals and judges; the panel only draws. Credits cannot be bought or cashed out, and a round abandoned by reloading the window is void.
- **Header**: the "for Claude Code" tagline under the title is replaced by the credits line.

## 1.2.0 — Agents that report their cost

- **Per-agent cost** — each finished subagent's tokens, tool calls and duration are read straight from the transcript; the roster shows today's runs · tokens · typical duration per agent.
- **Parallel runs** — invocations are tracked per call, not per agent name, so three parallel calls of the same agent are three characters in the room (and a ×N badge on the card).
- **Stuck detection** — an agent running far past 3× its own median duration is flagged amber ("?" badge, greyed sprite) instead of silently disappearing after 15 minutes.
- **Background agents fixed** — a background launch is no longer mistaken for a completion; the agent stays "running" until its real completion arrives.
- **Incremental transcript parsing** — only newly appended bytes are parsed on each tick instead of re-reading whole files (heavy sessions run to hundreds of MB). Cold scan unchanged, steady-state ticks drop from ~150 ms+ to a few ms.
- **Context window tier** — judged by the session's peak context, so a 1M session that dips under 200K after compaction is no longer misread as a nearly-full 200K window.
- **Fable (7d) meter** — the weekly Fable-scoped limit, when your account has one, shown between Weekly and Context (toggle in settings).

## 1.1.0 — Agents (Beta)

- **Agents tab** — your Claude Code subagents shown as distinct pixel characters.
- **Workroom** — an agent walks into the room and works at the desk when it's actually invoked. Detection is transcript-based and read-only; it never blocks or changes how agents run.
- **Live states** — red pulse while running, green check when done; usage HUD and per-response token delta over the room.
- **Compact strip** — collapse the roster to a "now running" list with task text, an indeterminate bar, and elapsed time.
- **Per-agent settings** — rename, set a role, swap the character, or change the model (written to `.claude/agents/*.md`).
- **Room themes** — Blocky Cave (light/dark), Backrooms, Liminal Office.

## 1.0.x

- Usage panel: session & weekly limits, context window, today's tokens & requests, status bar summary, crab mascot, and a compact / responsive layout.
