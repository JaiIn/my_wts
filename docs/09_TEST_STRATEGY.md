# 09. 빠르고 충분한 테스트 전략

## 1. 목표

실제 위험을 줄이되 개발 속도를 해치지 않는다. 모든 stage에서 전체 suite를 실행하는 방식은 사용하지 않는다.

## 2. 세 계층

### A. Stage 검사

매 Micro Stage 완료 시:

- 변경 파일 lint/typecheck
- 영향받은 unit/component/contract test
- `git diff --check`
- 관련 secret pattern 확인

목표 60초 이내. 실행 예:

```powershell
pnpm check:stage
```

### B. Milestone 검사

PR/merge 직전:

- 전체 lint
- 전체 typecheck
- 전체 unit+contract
- 해당 milestone E2E 1~소수 개
- live read flag OFF regression

### C. 최종 인수

- 모든 unit/contract/integration
- 핵심 E2E
- safety tests
- secret scan
- dependency audit
- OpenAPI drift check
- local runbook rehearsal

## 3. 테스트 비율

| 종류 | 대상 | 실행 시점 |
|---|---|---|
| Unit | validator, decimal, mapper, policy | affected per stage |
| Contract | OpenAPI request/response fixture | client 변경 stage |
| Component | 입력/상태/오류 UI | UI 변경 stage |
| Integration | BFF→service→mock transport | slice 완료 |
| E2E | 핵심 사용자 흐름 | milestone |
| Live smoke | 실제 API 최소 호출 | 명시 승인 |
| Auth | signup/login/logout/session | M01 + milestone |

## 4. 느린 테스트 방지

- network는 기본 차단
- fake timer 사용
- fixture 최소화
- test마다 Next dev server를 새로 띄우지 않음
- E2E는 대표 흐름만
- 병렬 안전한 suite는 병렬 실행
- test duration report 유지
- slow test 임계치를 정해 분리
- 동일 계약을 여러 계층에서 중복 검증하지 않음

## 5. Live 격리

```text
pnpm test                 → network 없음
pnpm test:contract        → fixture only
pnpm test:e2e             → mock BFF
pnpm smoke:live:read      → 사용자 승인, read-only
```

live 명령은 CI, `pnpm test`, `check:stage`, milestone suite에서 절대 호출되지 않는다.

## 6. 인증과 주문 금지 필수 테스트

- signup/login/logout/session expiry
- scrypt salt와 timing-safe 비교
- 사용자별 데이터 격리
- password/session token 로그 0건
- Toss mutation client와 BFF route 부재
- create/modify/cancel Toss path network 0회
- UI에 실제 제출·정정·취소 action 없음
- 시뮬레이터에 비실주문 문구 상시 표시
- decimal exactness
- read-only 400/401/403/429/5xx/unknown result

인증 검사는 M01부터 적용하고, mutation 부재 검사는 Toss client가 생기는 M03부터 safety suite에 포함한다.

## 7. 실패 처리

- 관련 fast test 실패: 같은 stage에서 수정
- 무관한 기존 실패: 증거와 함께 분리 보고
- full suite 실패: merge 보류, 원인 stage를 특정
- flaky test: 재실행으로 통과 처리하지 말고 quarantine 사유/기한 기록
