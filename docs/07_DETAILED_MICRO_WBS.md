# 07. my_wts 확정 Micro Stage WBS

## 0. 공통 규칙

- 한 번에 표의 한 Micro Stage만 수행한다.
- 분석·코드·관련 빠른 테스트를 같은 stage에 포함한다.
- 완료 결과와 체크리스트는 채팅으로만 보고한다.
- 보고 후 다음 stage를 자동 시작하지 않고 사용자 명령을 기다린다.
- Micro Stage 1개는 기능 commit 1개다.
- commit+push는 사용자 승인 한 번으로 함께 수행한다.
- PR+merge는 milestone 마지막에 한 번만 수행한다.
- frozen 문서는 개발 중 수정하거나 추가하지 않는다.
- 실제 Toss 주문 mutation은 모든 stage에서 금지한다.

## M00. 프로젝트 기반

확정 branch: `codex/setup/M00-foundation`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-00.01 | Next.js skeleton 직후 `.env.example`과 ignored `.env.local` 생성 | key blank, live false, ignore |
| MS-00.02 | exact dependency와 lockfile 설치 | version, install |
| MS-00.03 | 확정 디렉토리와 127.0.0.1 실행 설정 | dev, typecheck |
| MS-00.04 | lint, Vitest, Playwright, `check:stage` 기반 | sample fast test |
| MS-00.05 | frozen 문서·spec 배치와 Git remote 연결 | spec lint, remote |

M00 gate: 자격증명 없이 build와 기본 test 후 PR+merge, 사용자 대기.

## M01. 로컬 인증

확정 branch: `codex/auth/M01-local-auth`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-01.01 | users/sessions SQLite migration과 repositories | migration, unique user |
| MS-01.02 | scrypt password hash/verify와 validation | salt, timing-safe, bounds |
| MS-01.03 | signup BFF와 회원가입 화면 | success, duplicate, invalid |
| MS-01.04 | login BFF, session cookie, 로그인 화면 | cookie, generic failure |
| MS-01.05 | auth middleware, session 조회, 보호 route | redirect, API 401 |
| MS-01.06 | logout과 session 폐기 | reuse blocked |
| MS-01.07 | 로그인 제한·만료·사용자 데이터 격리 | rate, expiry, isolation |
| MS-01.08 | signup→logout→login E2E | 핵심 흐름 1개 |

M01 gate: 로컬 인증 전체 검사 후 PR+merge, 사용자 대기.

## M02. Mock 시장 화면

확정 branch: `codex/market/M02-mock-market-screen`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-02.01 | Toss 성공/오류 envelope와 decimal 공통 계약 | decoder unit |
| MS-02.02 | 종목·현재가 fixture와 mock service | KR/US/unknown |
| MS-02.03 | 종목 검색·선택과 현재가 카드 | component |
| MS-02.04 | 경고 banner와 empty/error 상태 | partial failure |
| MS-02.05 | 호가·체결 widgets | decimal/empty |
| MS-02.06 | 캔들·chart·pagination | next cursor |
| MS-02.07 | 장 캘린더·환율 | timezone |
| MS-02.08 | watchlist migration/repository/UI | 사용자 격리·재시작 |
| MS-02.09 | mock 시장 화면 E2E | 로그인 포함 |

M02 gate: 자격증명 없는 화면 시연 후 PR+merge, 사용자 대기.

## M03. Toss 조회 client 기반

확정 branch: `codex/api/M03-toss-readonly-client`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-03.01 | server-only env loader와 redacted logger | import/redaction |
| MS-03.02 | OAuth form, decoder, TokenManager | cache/single-flight |
| MS-03.03 | GET timeout·401 1회 갱신·429 정책 | mock errors |
| MS-03.04 | stocks/prices BFF | contract |
| MS-03.05 | warning/orderbook/trades BFF | contract |
| MS-03.06 | candles/calendar/exchange-rate BFF | pagination/time |
| MS-03.07 | UI를 mock transport의 BFF로 전환 | network boundary |
| MS-03.08 | 금지된 Toss mutation client/route 부재 검사 | safety |

M03 gate: live 호출 없이 full milestone test 후 PR+merge, 사용자 대기.

## M04. 최초 live read-only 시장 연동

확정 branch: `codex/api/M04-live-market-read`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-04.01 | **자격증명 게이트**: 사용자가 `.env.local`에 key를 직접 입력하고 허용 IP 확인 | 입력 완료만 확인 후 대기 |
| MS-04.02 | token+stocks 1건 live smoke | secret/token 미출력 |
| MS-04.03 | prices+warning 제한 호출 | rate header |
| MS-04.04 | candles+calendar+환율 제한 호출 | pagination/time |
| MS-04.05 | live 시장 화면과 flag OFF regression | read-only |

각 live stage는 사용자 명령 후 실행한다. M04 gate PR+merge 후 대기.

## M05. 계좌·자산 Read-only

확정 branch: `codex/account/M05-account-assets`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-05.01 | account client+BFF와 마스킹 UI | empty/multiple/type |
| MS-05.02 | **live 계좌 목록 승인** 후 마스킹 smoke | 원문 로그 없음 |
| MS-05.03 | 사용자가 계좌를 직접 선택하고 auth session에 accountRef 연결 | 자동선택 없음 |
| MS-05.04 | holdings BFF와 portfolio UI | KR/US/empty |
| MS-05.05 | buying power·sellable quantity·commission UI | decimal/unit |
| MS-05.06 | live 계좌·자산 read-only smoke | mutation 0회 |
| MS-05.07 | portfolio E2E와 계좌 변경 cache | stale 없음 |

M05 gate PR+merge 후 대기.

## M06. 주문·조건주문 내역 Read-only

확정 branch: `codex/orders/M06-order-history`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-06.01 | 일반 주문 DTO·상태 decoder | unknown/partial |
| MS-06.02 | OPEN/CLOSED 목록·cursor·filter BFF | date/limit/cursor |
| MS-06.03 | 일반 주문 상세 UI | execution/partial |
| MS-06.04 | 조건주문 목록·상세 GET BFF/UI | SINGLE/OCO/OTO |
| MS-06.05 | 승인된 live read-only history smoke | mutation 0회 |
| MS-06.06 | 내역 E2E와 다른 채널 주문 표시 | read-only |

M06 gate PR+merge 후 대기.

## M07. 실제 전송 없는 주문 시뮬레이터

확정 branch: `codex/simulator/M07-order-simulator`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-07.01 | 수량/금액 주문 validator | KR/US matrix |
| MS-07.02 | TIF·호가·미국 소수점 규칙 | boundaries |
| MS-07.03 | 예상금액·수수료 순수 계산 service | decimal exactness |
| MS-07.04 | buying power/sellable/warning read 결합 | partial failure |
| MS-07.05 | 주문 입력과 시뮬레이션 결과 UI | 상시 비실주문 문구 |
| MS-07.06 | simulator BFF/E2E와 mutation network 0회 | safety |

M07에는 실제 주문 제출·정정·취소가 없다. gate PR+merge 후 대기.

## M08. 랭킹·시장지표

확정 branch: `codex/market/M08-rankings-indicators`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-08.01 | rankings BFF/UI | type constraints |
| MS-08.02 | indicator prices/candles BFF/UI | catalog/bond |
| MS-08.03 | investor trading BFF/UI | cursor/provisional |
| MS-08.04 | 승인된 live read-only smoke | mutation 0회 |
| MS-08.05 | E2E와 milestone regression | full |

M08 gate PR+merge 후 대기.

## M09. 조건주문 시뮬레이터

확정 branch: `codex/simulator/M09-conditional-simulator`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-09.01 | SINGLE/OCO/OTO local validator | relation/price |
| MS-09.02 | expireDate·first/second preview model | boundary |
| MS-09.03 | 조건주문 입력과 결과 UI | simulation label |
| MS-09.04 | 조건주문 simulator E2E | network 0회 |
| MS-09.05 | 실제 감시·trigger·mutation 부재 검사 | safety |

M09 gate PR+merge 후 대기.

## M10. 최종 인수

확정 branch: `codex/release/M10-final-acceptance`

| ID | 구현 단위 | 단계 내 검증 |
|---|---|---|
| MS-10.01 | slow test 측정·중복 제거 | 시간 |
| MS-10.02 | unit/contract/component/integration/E2E/safety | full pass |
| MS-10.03 | auth/session/secret scan과 local runbook | security |
| MS-10.04 | Toss mutation client·route·network 0 검증 | prohibited list |
| MS-10.05 | OpenAPI drift 확인 | drift면 중단 |
| MS-10.06 | capabilities/diagnostics와 최종 local package | redaction |

M10 gate: 최종 체크리스트와 결과를 채팅으로 보고하고 사용자 명령을 기다린다.

## 시간 기준

| 검사 | 목표 |
|---|---:|
| affected test | 10초 내외 |
| `check:stage` | 60초 이내 |
| milestone unit/contract/component | 3분 이내 |
| E2E 포함 최종 인수 | 별도 실행하고 시간 측정 |

