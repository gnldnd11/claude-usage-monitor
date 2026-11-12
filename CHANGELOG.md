# Changelog

## 1.22.0: Grouped by account, shared only with consent

- **No team code.** PCs are grouped by the Claude account they are signed in to, so everyone on a shared account lands in one table without agreeing on a code first. The account is identified to the server only by a hash of its id; only PCs signed in to that account can read its table.
- **Nothing is sent until you agree.** The extension asks once ("Share" or "Don't share"); closing the question counts as no. It is not asked at all where VS Code telemetry is off or Claude Code is not signed in. Turn it on or off later under Weekly > Details.
- A PC that set a team code in 1.21.0 had already agreed, so it keeps sharing, now with its account; the code setting is cleared.

## 1.21.0: Team sharing

- **One account, several PCs, one table.** Under Weekly > Details, PCs that enter the same team code list each other: each person's part of the account's weekly limit, side by side, adding up to the account total. What nobody on the team recorded (claude.ai on the web, the apps, PCs without sharing) shows as its own row, so a full account with small rows says where to look next.
- **Off by default, and narrow when on.** Sent every 10 minutes while a code is set: your display name, the weekly window, the account's weekly %, and this PC's use in that window (tokens and an API-price equivalent per model). Nothing from a prompt, a file, a project or a session; the code is stored only as a hash. Clear the code to stop.
- The split uses this PC's rate (measured, or the plan reference) but never lets the rows add up to more than the account: if they would, the rate is lowered to fit, and who used how much more is unchanged by that.

## 1.20.1: A share from the first look

- **This PC's share of the weekly limit shows straight away.** It used to wait until the account's weekly % had risen three points while this PC was busy, which a nearly full account never does. Until this PC has measured its own rate, the share now uses a reference rate for the plan (Max 20x: about $20 of API-equivalent use per 1%), says so under the figure, and switches to the measured rate once there is one. The plan is read from Claude Code's credentials file where there is one; where it lives in the system keychain, Max 20x is assumed and the page says that too.
- On Windows, projects were named after the encoded folder (`c--dev-hai`) instead of the folder itself (`hai`).
- A session whose first turn was text Claude Code inserted, such as a skill's base directory, is now named after the first thing the person actually asked.

## 1.20.0: This PC's week

- **Details on the Weekly meter** opens this PC's last seven days: tokens per day (main sessions and subagents stacked), requests, and an API-equivalent figure for comparing machines, then where it went, by project, by model, by agent and by session.
- **This PC's share of the weekly limit.** Several people on one account all draw on one weekly limit, and the usage endpoint only reports the total. Each PC now estimates its own part: every time the account's weekly % moves, it is compared with what this PC used over the same stretch. Other PCs only ever push that ratio up, so the low end of it is an upper estimate of this PC's share. It appears once the account's % has risen three points while this PC was in use, is marked rough until three such stretches are in, and keeps improving after that.
- Readings come from the usage endpoint, from Claude Code's own usage fetches, and from the rate-limit headers on its responses. The first read of a week of transcripts runs in slices in the background, so the editor does not stall; after that only new bytes are read.

## 1.19.0: A coin market, dice, and ten more games

- **Coin Market**: four coins, a three-hour candle chart, and a position that is still there when you come back. Buy with credits, sell whenever you like, 0.5% on the round trip. The fee is the small one on purpose: a coin moves about 1% to 2.5% in a day, so a position left overnight is worth more than what it costs to close, while a minute of it never is. The profit on an open position shows on the games list without opening the panel, because that number moving while you were away is the only reason to look.
- **Playing cannot move a price.** The chart is the same for every window and every install, it is drawn from the minute it belongs to, and nothing you do touches it. There is no way to buy into a rise you have already seen: a price a minute ahead is not something the panel can be told, and every rule for deciding when to sell is worth the same as holding.
- **The forge ladder was far too long.** Reaching +10 used to be years of play. It is now about ten weeks at a typical day's earnings, the fee curve is gentler at the bottom and steeper at the top, and a failed strike heats the forge: six bars, each worth five points on the next attempt, cleared when you succeed. The danger does not move. Heat buys its odds out of the drops and the stays, never out of the break.
- **A success and a break now say what they cost.** The sword's price jumps on the chip at the moment it goes up, and a break prints everything that sword had eaten. The list row carries the level of the sword you are holding.
- **Dice**: **Roll Under** (drag a line anywhere from 1 to 96 and the roll lands on the same ruler you set it with; the side that wins is the side that is filled in), **Sic Bo** (three dice, one bet: small, big, any triple, or an exact total, and the cell the dice actually landed in lights up so a loss says why), **Hazard** (roll as often as you dare, each pip drops into the tray, and a 1 empties it) and **Shut the Box** (nine tiles, two dice, close any set that adds up to the roll; the tiles you cannot use this throw cannot be pressed, so there is nothing to add up).
- **Machines**: **Slots** (three real rings of 24, rolled to the position the extension picked), **Plinko** (twelve rows, thirteen cups, three risk tables, and the bead speeds up as it falls), **Wheel** (every slice has its multiplier written on it, the wide ones pay nothing and the thin one pays twelve) and **Scratch Card** (a 3x3 card you rub a square at a time, and nothing is claimed until all nine are open).
- **Card tables**: **Red Dog**, where two cards are dealt apart and the bet is whether the third falls between them.
- **Favourites**: star any game and it moves to the top of the list, out of its family. Stars follow you between windows. Each family heading folds, so a list of fourteen can be four rows and four headings.
- **Every game with a pay table returns between 96% and 97%**, the band the first four already kept, and no single rung, cup, segment or stopping rule is better than another. Each table was solved by counting every outcome rather than sampled, and a game whose table drifts out of the band refuses to start instead of paying wrong. The market is the one game without a table, so it has no "one round" to return anything: what it has instead is a price that cannot be beaten by any rule for selling, proved rather than sampled, and the 0.5% round trip on top of that.
- Credits are still earned by using Claude Code and nothing else. They cannot be bought and they cash out to nothing.

## 1.18.0: The sword forge, and art on the list

- **Sword Forge**: the crab is a blacksmith at this table. Pay the fee and the sword goes up a level, or stays where it is, or drops back one, and from the level its blade starts to glow a failed strike can break it and take the whole thing. Ten levels. A broken sword is gone and a fresh one costs nothing, so what you lose is everything you fed the old one.
- **Selling is the other half of the game**: the price is on the button before you press anything, and it climbs faster than the odds fall. A +10 sword fetches eight times a +9. Every way of choosing where to stop returns between 96.2% and 97.0%, the same band the card games keep, and no single level can be farmed.
- **The sword is kept**: unlike a hand of cards it survives reloads and windows. Two windows forging the same sword settle on one of them, and a sale that loses that settlement pays nothing and hands the sword back rather than paying twice.
- **The games list has art**: each of the four rows carries its own tile.
- **Agents is no longer marked Beta.**

## 1.17.0: Draw Poker joins the table

- **Draw Poker**: a third game at the crab's table. Jacks or better: five cards come up face up, you mark the ones to keep and one draw replaces the rest. Keeping all five is allowed, a pair of tens or less is nothing, and a paid pair of jacks hands your bet straight back.
- **The pay table is on the felt**: all nine rows sit above the cards, and the row you were paid for lights up once the last card is face up. It is an 8/5 table, so the royal pays 800 and the house keeps about 3%, the same band as the other two games. Every multiplier is a whole number, so nothing in the payout is rounded.
- **Marking cards costs nothing**: click a card or press 1 to 5. The marks never leave the panel and travel with the draw as one move, so there is no round trip per card. Enter deals and draws.
- **Games list**: three rows now. Blackjack and High-Low are unchanged.

## 1.16.0: High-Low joins the table

- **High-Low**: a second game at the crab's table. One card lies face up and you call whether the next one beats it. Aces are high, a tie carries the pot on to the new card, and you can cash out after any call. A wrong call costs your opening bet and nothing else, because the pot it grew was the house's money all along.
- **Prices that come from the shoe**: each side is priced off the cards actually left in the six decks, less the house's 3%, so the odds move as the run goes on and no card and no side is ever the better bet. A call that cannot lose returns the pot instead of shrinking it, and what a run leaves is carried into the next one.
- **Games list**: the credits line opens a list with both games on it. Blackjack is unchanged.

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
