# awesome-claude-code 제출 양식 (사람이 직접 내야 함)

`hesreallyhim/awesome-claude-code`, 별 58,312. 2026-11-19 조사.

## 왜 내가 대신 못 내나

CONTRIBUTING.md 가 셋을 못 박았다.

```
ALL RECOMMENDATIONS MUST BE MADE USING THE WEB UI ISSUE FORM TEMPLATE,
OR YOU RISK BEING RESTRICTED FROM INTERACTING WITH THIS REPOSITORY

It is not possible to submit a resource recommendation using the gh CLI.

resource recommendations must be created by human beings.
```

PR 도 금지다. `gh` 로 내면 저장소 차단 위험이 있다. **웹 양식으로 사람이 내야 한다.**

제출 주소: https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml

## 기대치

관리자가 CONTRIBUTING 에 미리 적어 두었다.

> If "getting on the list" is any part of a promotional strategy for your project,
> you should be prepared to have a backup plan.

열린 이슈 1,278건. 내면 실리는 구조가 아니다. **비용이 양식 하나라 해 볼 값은 있지만 유입 축으로 세우면 안 된다.**

## 등재 요건

| 요건 | 우리 | 판정 |
|---|---|---|
| 첫 커밋 후 14일 경과 + 이후로도 커밋 | 2026-07 개설, 오늘도 커밋 | 통과 |
| 또는 별 100개 | 4개 | 미달 (위 조건으로 통과하므로 무관) |
| LICENSE 를 봇이 찾을 수 있을 것 | 저장소 루트에 LICENSE 있음 | 통과 |
| 공개 소스 | 공개 미러 있음 | 통과 |
| 가입·결제 요구 없음 | 없음 | 통과 |

## 채워 넣을 값

**Display Name**

```
Claude Usage Crab
```

**Category** (드롭다운에서 고름)

```
Observability & Monitoring > Usage & Cost
```

`Observability & Monitoring > Session Monitors` 도 있지만, 첫 줄을 사용량으로 세운 포지셔닝과 맞는 쪽은 Usage & Cost 다.

**Link**

```
https://github.com/gnldnd11/claude-usage-monitor
```

**Author Name**

```
gnldnd11
```

**Author Link**

```
https://github.com/gnldnd11
```

**Description** (10~500자, 서술형, 홍보 문구 금지, 독자 호명 금지, 이모지 금지, 한 줄)

```
A VS Code sidebar and status bar for Claude Code usage: 5-hour and 7-day rate limits with reset countdowns, context window, and today's tokens and requests, read incrementally from the local transcripts with no hooks and no API of its own. Subagents defined in .claude/agents/ are drawn as distinct pixel characters that walk into a room when invoked and leave when their result lands, which makes parallel runs and stalled ones visible at a glance.
```

407자. 두 문장. 「무엇을 하는가」와 「무엇이 다른가」 하나씩이고, 자평이나 독자 호명이 없다.

**Checklist** (여섯 번째는 체크하지 말 것)

```
[x] I have visited this repo before with my own eyes, and I have confirmed that this
    resource is sufficiently distinct from any existing resource
[x] All links are working and publicly accessible
[x] This resource is specific to Claude Code
[x] I have read the CONTRIBUTING.md
[x] I promise I actually did these things and not doing so is shameful and lazy
[ ] Do not check the following box - leave it unchecked.
```

첫 항목은 **직접 눈으로 봤다는 선서**다. 내기 전에 그 목록의 Usage & Cost 구획을 한 번 열어 보고, 이미 비슷한 것이 있는지 확인한 뒤에 체크해야 한다.

## 같은 목록의 이웃들

Usage & Cost 와 Status Lines 구획에 이미 실려 있는 것들. 「충분히 구별되는가」를 판단할 때 쓴다.

| 이름 | 무엇 |
|---|---|
| claude-statusbar (leeguooooo) | 상태줄. 5시간·7일 한도, 종료 시각 예측, 컨텍스트, 캐시 만료, 세션 비용. 3스타일 9테마 |
| claude-powerline (Owloops) | 상태줄 |
| TermaGITchi (TevvvB) | 세션마다 상태줄에 생물 한 마리. 저장소 위생을 표정으로 |
| cc-semaphore (patakuti) | 병렬 세션 상태를 OS 상태바·트레이로 |
| claude-code-status-bar (briansmith80) | 한도·컨텍스트·git·비용, 8테마. 순수 bash |

**전부 CLI 나 상태줄이다. VS Code 확장은 이 구획에 보이지 않았다.** 그게 우리 구별점이고, Description 첫 다섯 글자를 `A VS Code` 로 연 이유다.
