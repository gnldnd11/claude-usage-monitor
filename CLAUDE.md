# Claude Usage Crab

> VS Code 확장. Claude Code 사용량을 상태바와 패널에 보여준다.
> **발행됨**: VS Code 마켓플레이스 `saegim.claude-usage-crab` (2026-07-21).

---

## 스택

| | |
|---|---|
| 형태 | VS Code 확장 (`engines.vscode ^1.75.0`) |
| 언어 | **순수 JavaScript.** TypeScript 아님 |
| 의존성 | **0개.** 빌드 스텝도 번들러도 없다 |
| 규모 | 제품 약 17K줄 + 테스트 약 15K줄 (2026-11-06) |

**의존성 0과 빌드 스텝 0은 의도된 설계다.** 라이브러리를 추가하려면 그 값을 먼저 설명해야 한다.

## 카지노는 디렉터리다

게임 5개가 있고(1.25.0 에서 아홉을 폐지했다), **게임 하나 = 디렉터리 하나**다. `games/<id>/meta.js` + `games/<id>/panel.js`.
`games/registry.js`가 디렉터리를 읽어서 목록을 만들므로 **게임을 추가할 때 공유 파일을 고칠 일이 없다.**
`extension.js`·`webview.js`·`html.js`·`styles.js`에 게임 이름이 한 번도 안 나온다. 그 성질을 깨지 않는다.

```
games/<id>/meta.js    등록 정보 + 호스트 쪽(table 스펙 또는 createHandler)
games/<id>/panel.js   화면. 웹뷰 스크립트로 로드된다
<id>.js (루트)        엔진. 판정과 가격은 전부 여기
```

| 무엇 | 어디 |
|---|---|
| 계약(파일 배치·메시지·검증) | `games/README.md` |
| 화면 규격(폭·골격·바닥·결·연출 ms) | `docs/game-panels.md` |
| 공유 바닥 | `webview.js`의 `window.CUC`, `games/casino.js` |

**호스트가 판정하고 웹뷰는 그린다.** 패널이 배수·확률·배당·잔액을 계산하면 결함이다.
진행 중인 라운드의 `seed`는 `phase === 'done'` 전에는 화면에 오지 않는다.
**지불에 쓰이는 돈은 병합되는 기록 안에 둔다.** 창 단위 카운터에 두면 두 창이 같은 것을 두 번 받는다.

**이 프로젝트의 코드 주석은 영어로 쓴다.** 모노레포 기본은 한국어지만 여기는 공개 미러로 나가고,
엔진 머리말이 전부 영어라 섞으면 한 파일 안에서 언어가 갈린다. 채팅 답변과 문서는 그대로 한국어다.
(2026-11-05. 엔진 담당 에이전트 둘이 같은 질문을 올려서 적는다.)

## 데이터 출처

관측 대상이 협조하지 않는다. Claude Code는 이 확장을 위한 API를 열어주지 않는다.
그래서 **이미 디스크에 쓰이는 것과 이미 네트워크로 오가는 것만** 읽는다.

| 데이터 | 출처 |
|---|---|
| 토큰·요청·컨텍스트 | `~/.claude` 트랜스크립트 JSONL. append된 바이트만 증분 파싱 |
| 세션·주간 사용량 | `/api/oauth/usage` (크레덴셜 토큰) |

훅이 없다는 건 **에이전트 실행을 방해할 방법이 구조적으로 없다**는 뜻이기도 하다. 이 성질을 깨지 않는다.

### 공유 서버는 이 저장소가 아니다

`team.js` 가 치는 `https://saegimai.up.railway.app/api/v1/usage-share` 는 **다른 저장소에서 배포된다.**

```
모노레포   projects/saegim-ai/backend        작업본. 여기 커밋해도 안 올라간다
배포 레포   gnldnd11/saegim-backend          Railway 가 보는 곳. 루트에 Dockerfile
```

Railway 가 모노레포 서브디렉터리의 Dockerfile 을 못 잡아서 떼어 놨다.
**`git push saegimAI main` 으로는 백엔드가 배포되지 않는다.** 배포 레포를 클론해서
바뀐 파일을 복사하고 `git push origin HEAD:main` 해야 Railway 가 돈다.

**확인은 라우터로 한다.** 서버가 살아 있어도 그 문만 없을 수 있다.

```
/health                      200  서버는 뜸
/api/v1/weather              422  v1 라우터는 붙음
/api/v1/usage-share/summary  404  이 문이 없음   <- 404 면 라우터 미등록
                             422  있으면 쿼리 누락으로 422
```

*** 왜 여기 적나 ***
`/api/v1/usage-share` 를 2026-11-11 에 모노레포에 냈는데 배포 레포로 싱크를 안 했다.
배포 레포의 마지막 모노레포 싱크는 09-17 이었다. 그래서 **12일 동안 그 문이 없었고**,
확장은 404 를 「Sharing server not reachable」 로 그려 왔다. 그 사이 서버가 필요 없는
로컬 계산(`othersFloor`)만 돌아서 화면이 그럴듯했고, 11-23 에 사용자가 그 줄을 보고 물었다.
**백엔드를 고쳤으면 배포 레포에 올렸는지 위 404 로 확인한다.**

---

## 발행 절차 (순서 중요)

```
0. 미러의 이슈를 읽는다  gh issue list --repo gnldnd11/claude-usage-monitor --state open
1. subtree push          (공개 미러 레포로 먼저)
2. vsce publish          (패키징은 맨 뒤)
```

**순서를 바꾸면 사고다.** 그리고 `--packagePath`를 쓰지 않는다.

**0번이 왜 절차인가.** 이 절차에 「보낸다」만 있고 「돌아온 것을 읽는다」가 없었다.
그래서 2026-11-13 까지 이슈 둘을 아무도 몰랐다. 하나는 09-26 에 올라와 7주를 방치했다.
미러 저장소의 watcher 가 0 이라 깃허브도 메일을 안 보낸다. **묻지 않으면 안 온다.**
`~/.claude/scripts/crab-metrics.py` 가 매일 이슈 수를 찍지만 그건 사후 통보이고,
발행 전에 읽는 것은 이 줄이 한다.

- 원본: 이 모노레포 `projects/claude-usage-monitor`
- 공개 미러: github `gnldnd11` (remote `usage-monitor`, subtree)
- 상세 절차와 보안 체크리스트는 저장소 문서 참조

### Open VSX (미등록, 2026-11-20 확인)

Cursor·Windsurf 같은 VS Code 포크는 MS 마켓을 못 쓰고 **Open VSX** 를 본다.
거기 없으면 그 사람들은 이 확장을 **검색으로 못 찾는다.** 코드 변경은 없고 발행만 추가하면 된다.

```
현재   https://open-vsx.org/api/saegim  ->  Namespace not found
```

**사람이 먼저 해야 하는 두 가지.** 토큰은 사용자 것이고 세션이 찾지 않는다.

```
1. open-vsx.org 에 GitHub 로 로그인
2. Settings -> Access Tokens 에서 토큰 발급
```

그 뒤는 명령 둘이다. `vsce` 와 같이 `npx` 로 부르고 패키지를 설치하지 않는다.

```
npx ovsx create-namespace saegim -p <토큰>
npx ovsx publish -p <토큰>
```

**순서는 MS 마켓 발행 뒤**다. 둘이 어긋나면 포크 쪽이 구버전을 받는데, 먼저 올려 두면 되돌릴 방법이 없다.

## 리스팅 그림

`media/` 가 README 와 마켓 첫 화면에 그대로 나간다. 둘로 갈린다.

| 무엇 | 어떻게 | 왜 |
|---|---|---|
| 게임 5종 + 주간 시트 (라이트·다크 12장) | `node tools/shoot-panels.mjs` | 엔진이 시드로 만든 **진짜 라운드**다 |
| `usage-panel.png`, `agents-*.png` 등 | **사람이 자기 화면을 캡처** | 사용량 수치는 지어낼 수밖에 없고, **지어낸 숫자를 리스팅에 올리지 않는다** |

도구에 `usage`·`agents`·`cross`·`shop` 샷이 있지만 **`measure: true` 라 `tools/.measure/` 로만 나간다.**
그 선은 의도된 것이다(`tools/shoot-panels.mjs` 머리말). 바꾸려면 그 판단부터 뒤집어야 한다.

**그래서 사람이 안 찍으면 그 그림들은 영원히 낡는다.** 2026-11-20 에 `usage-panel.png` 가
2026-07-28 캡처였다. 머리글도 탭 배지도 막대 수도 지금 제품과 달랐다. 화면을 크게 고치면 같이 찍는다.

## 방 테마 추가

방은 **정사각형이 아니라 1.8:1 실내 비네트**다.
절차 원장은 `docs/room-authoring.md`. 매번 새로 조사하지 않는다.

- 배경 투명화를 시도하지 않는다. 여러 번 실패했다
- 방 이름은 상표를 피한다

## 마스코트

4상태: idle · working · 절망 · stunned.
에셋은 전량 AI 제작. 이모지·SF Symbol을 쓰지 않는다.

---

## 검증

빌드 스텝이 없으므로 타입 체크나 번들 검증이 없다.
**확장을 실제로 로드해서 동작을 봐야 한다.** 상태바 갱신, 패널 렌더, 트랜스크립트 파싱을 눈으로 확인한다.

수백 MB짜리 트랜스크립트가 실제로 존재한다. 증분 파싱이 깨지지 않는지가 핵심 회귀 지점이다.
