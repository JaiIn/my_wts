# 13. 역할별 개발 가이드

역할은 별도 branch나 승인 단계를 만드는 장치가 아니다. 현재 Micro Stage에서 한 개발자 또는 Codex가 필요한 역할만 수행한다.

## 1. Coordinator

- 현재 stage 범위와 인수 조건 확인
- 완료 체크리스트를 채팅으로 보고
- 사용자 명령 전 다음 stage 시작 금지
- milestone 끝에만 full test와 PR
- frozen 문서 수정 금지

## 2. Environment

담당: M00, M03.

- `.env.example`과 ignored `.env.local`
- 127.0.0.1 bind
- server-only config
- `ALLOW_LIVE_TOSS_API=false` 기본값
- secret redaction

금지: 배포 설정, `NEXT_PUBLIC_*` Toss key, 실제 주문 flag.

## 3. Local Authentication

담당: M01.

주요 범위:

```text
src/domain/auth/**
src/application/auth/**
src/infrastructure/auth/**
app/api/v1/auth/**
app/login/**
app/signup/**
```

- scrypt hash/verify
- users/sessions repositories
- signup/login/logout/session
- HttpOnly cookie
- rate limit과 expiry
- 사용자별 데이터 격리

금지: 평문 password, token 원문 DB 저장, 사용자 존재 여부가 드러나는 로그인 오류, 외부 IdP.

## 4. Frontend

담당: 모든 UI stage.

- auth, 시장, 계좌, 자산, 내역, 시뮬레이터 화면
- loading/empty/error/stale
- 접근성과 keyboard
- BFF만 호출
- 시뮬레이터에 비실주문 문구 상시 표시

금지: Toss 직접 호출, secret 접근, 실제 제출·정정·취소 action.

## 5. Toss Auth & Read-only Client

담당: M03~M06, M08.

- OAuth form과 TokenManager
- GET timeout, 401 token refresh 1회, rate limit
- request/response validation
- account header server-only
- mutation client 부재 safety test

금지:

```text
createOrder
modifyOrder
cancelOrder
createConditionalOrder
modifyConditionalOrder
cancelConditionalOrder
```

## 6. Market Data

담당: M02~M04, M08.

- 가격·종목·경고·호가·체결·캔들
- 캘린더·환율·랭킹·지표
- batch/cache/pagination
- widget 부분 실패

## 7. Account & Portfolio

담당: M05.

- 계좌 마스킹과 사용자의 명시적 선택
- accountRef와 로그인 session 연결
- holdings, buying power, sellable quantity, commissions
- 사용자 계좌 선택 변경 시 cache invalidate

금지: accountSeq browser/DB/log 노출, 첫 계좌 자동 선택.

## 8. History

담당: M06.

- 일반·조건주문 OPEN/CLOSED 목록
- cursor pagination
- 상세·execution·상태 표시
- 다른 채널에서 생성된 항목 표시

금지: mutation client import, 정정·취소 action.

## 9. Simulation

담당: M07, M09.

- 일반 주문 decimal 계산과 validation
- SINGLE/OCO/OTO validation
- buying power·sellable·경고 GET 참고
- `SIMULATION_ONLY`, `submitted=false`, `persisted=false`

금지: preview ID, clientOrderId, 주문 제출, background 감시, 결과 저장.

## 10. Test & Quality

- stage: affected fast tests
- milestone: full relevant suite
- auth/session/password redaction
- user isolation
- unhandled network 차단
- Toss mutation route/client/network 0 검증
- 느린 test 측정과 중복 제거

## 11. Git

- Micro Stage 1개 = 기능 commit 1개
- 사용자 승인 1회로 commit+push
- milestone 끝에 PR+merge
- `.env.local`, DB, logs 제외
- frozen 문서 변경 감지

## 12. 역할 인수인계

```text
stage / 결과 / 변경 파일 / fast test / 안전 확인 / commit 후보 / 다음 stage / 사용자 승인 대기
```

