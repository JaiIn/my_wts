# 20. 요구사항 추적성과 최종 인수

상태: `FROZEN`

## 1. Traceability

| Requirement | Screen | BFF/domain | Milestone | Test |
|---|---|---|---|---|
| 회원가입 | signup | auth/users | M01 | unit+integration+E2E |
| 로그인/session | login/all | auth/sessions | M01 | cookie+expiry+E2E |
| 로그아웃 | sidebar | auth/session | M01 | revoke+E2E |
| 사용자 데이터 격리 | watchlist/settings | repositories | M01/M02 | isolation |
| 종목정보·시세 | market | market | M02~04 | contract+component |
| 경고·호가·체결·캔들 | market detail | market | M02~04 | contract+E2E |
| 환율·캘린더 | market | market | M02~04 | timezone |
| 계좌·holdings | settings/portfolio | accounts/portfolio | M05 | mask+contract |
| 주문정보 | portfolio/simulator | order-info GET | M05/M07 | decimal |
| 주문내역 | orders | orders GET | M06 | status+cursor |
| 조건주문내역 | conditional | conditional GET | M06 | type+cursor |
| 일반 시뮬레이터 | trade | simulation | M07 | calculation+safety |
| 랭킹·지표 | rankings/indicators | market | M08 | contract+E2E |
| 조건 시뮬레이터 | conditional simulator | simulation | M09 | validator+safety |
| diagnostics | diagnostics | system/audit | M10 | redaction |
| 실제 주문 없음 | 전체 | prohibited routes | M03~10 | static+network safety |

## 2. Milestone acceptance

| Milestone | 완료 기준 |
|---|---|
| M00 | env-first, fixed stack, local bind, test 기반 |
| M01 | signup/login/logout/session과 사용자 격리 |
| M02 | 자격증명 없는 mock WTS 시장·watchlist |
| M03 | typed read-only Toss client/BFF, mutation 부재 |
| M04 | 승인된 최소 live 시장 조회, OFF regression |
| M05 | Toss 계좌 선택·holdings·order-info read-only |
| M06 | 일반·조건주문 내역 read-only |
| M07 | 일반 주문 시뮬레이터, mutation network 0 |
| M08 | 랭킹·시장지표 |
| M09 | 조건주문 시뮬레이터, 감시·trigger 없음 |
| M10 | 전체 test/build/security/runbook |

## 3. 최종 기능 인수

- [ ] 회원가입·로그인·로그아웃
- [ ] password scrypt hash와 session cookie
- [ ] 사용자별 watchlist/settings 격리
- [ ] 모든 보호 화면 인증 강제
- [ ] 시장·랭킹·지표·계좌·자산 화면
- [ ] 일반·조건주문 내역 read-only
- [ ] 일반·조건주문 시뮬레이터
- [ ] 시뮬레이터 상시 비실주문 표시
- [ ] 내부 BFF spec과 구현 일치
- [ ] Toss OpenAPI v1.2.4 GET contract
- [ ] 자격증명 없는 mock 실행
- [ ] password/session/token/secret/accountSeq browser·log 비노출
- [ ] SQLite migration 6개 table 재현
- [ ] Toss 주문 mutation client 0개
- [ ] Toss 주문 mutation BFF route 0개
- [ ] Toss 주문 mutation network 요청 0회
- [ ] full unit/contract/component/integration/E2E/safety
- [ ] local production build와 127.0.0.1 bind
- [ ] frozen 문서 변경 없음

## 4. 실제 주문 부재 기준

아래 operation은 공식 API 조사 목록에만 존재한다.

```text
createOrder
modifyOrder
cancelOrder
createConditionalOrder
modifyConditionalOrder
cancelConditionalOrder
```

구현 완료의 조건은 이 operation을 disabled 상태로 만드는 것이 아니라 애플리케이션 코드와 BFF에서 아예 제공하지 않는 것이다.

## 5. 성능

| Metric | 기준 |
|---|---:|
| initial shell | 2초 이내 |
| local auth request | 500ms 이내 |
| mock market E2E | 30초 이내 |
| check:stage | 60초 이내 목표 |
| milestone fast suite | 3분 이내 목표 |
| market poll | 공식 rate limit 이내 |

## 6. 문서

- 모든 설계 문서 FROZEN
- 빈 구현 지시 없음
- internal/external spec parse
- Markdown link/fence check
- 개발 중 새 문서·설계 수정 금지

