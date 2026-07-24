# 08. 단계 게이트와 완료 체크리스트

## 1. 모든 Micro Stage의 절차

체크리스트는 품질 확인 도구이지 별도 개발 산출물이 아니다. 완료 요약과 체크리스트는 채팅에서만 제공하며 파일을 생성하지 않는다.

### 시작 보고

```markdown
## MS-XX.YY 시작
- 목표:
- 담당 역할:
- 범위:
- 변경 허용 파일:
- 변경 금지:
- 검증 계획:
- 자격증명 필요 여부: 아니오/예(이유)
```

### 구현 중

- stage 밖 문제는 채팅 완료 보고의 “다음 후보”에만 기록하고 파일을 생성하지 않는다.
- 예상보다 범위가 커지면 멈추고 stage 분할을 제안한다.
- API 문서 불일치는 공식 OpenAPI를 확인하고 사용자에게 보고한다.

### 완료 보고

```markdown
# MS-XX.YY Completion Report

## 1. 완료 결과
- 목표:
- 결과:

## 2. 변경 파일
| 파일 | 변경 이유 |
|---|---|

## 3. 검증
| 명령/검사 | 결과 | 근거 |
|---|---|---|

## 4. 안전 확인
- [ ] secret/token/account 원문 없음
- [ ] stage 범위 초과 없음
- [ ] Toss 주문 mutation client·route·호출 없음
- [ ] 인증정보·session token 원문 없음
- [ ] 서버/클라이언트 경계 유지

## 5. Acceptance Criteria
- [ ] AC-1
- [ ] AC-2

## 6. 남은 제약
- ...

## 7. 다음 후보
- MS-XX.ZZ: ...

## 8. 상태
`USER_APPROVAL_REQUIRED`
```

## 2. 필수 정지 문구

각 stage가 완료되면 다음 형태로 종료한다.

```text
MS-XX.YY를 완료했습니다. 위 체크리스트와 검증 결과를 확인해 주세요.
다음 Micro Stage는 자동으로 시작하지 않습니다.
계속하려면 “MS-XX.ZZ 진행”이라고 명령해 주세요.
```

## 3. 자격증명 요청 게이트

실제 API 호출 stage 전:

```text
다음 단계부터 실제 Toss API 연결 검증이 필요합니다.
채팅에 키를 붙여넣지 마세요.
로컬 `.env.local`에 TOSS_CLIENT_ID와 TOSS_CLIENT_SECRET을 직접 입력한 뒤,
입력 완료 여부만 알려주세요. 프로젝트는 read-only Toss 연동만 사용합니다.
```

계좌 API stage 전:

```text
계좌 목록 read-only 호출로 accountSeq 후보를 확인합니다.
결과는 마스킹하여 표시하고, 사용할 계좌를 사용자가 직접 선택할 때까지 대기합니다.
```

주문 시뮬레이터 stage:

```text
다음 단계는 주문 입력과 예상값 계산을 구현하지만 실제 주문이 아닙니다.
Toss 주문 mutation client·route·환경변수는 만들지 않습니다.
완료 검증에는 실제 주문 network 요청 0회가 포함됩니다.
```

## 4. 실패 시 규칙

- 테스트 실패: 완료 처리하지 않음
- live API 실패: 자격증명 재요청 전 status/error code와 IP/환경 설정을 안전하게 진단
- 401: token lifecycle 확인
- 403: 허용 IP/권한 확인
- 429: 한도 헤더 확인, 무한 재시도 금지
- 주문 결과 불명: 재주문 금지, 내역/상세 조회

## 5. Git 게이트

stage 완료 후 다음을 한 번에 제시한다.

1. diff/빠른 검증 요약
2. commit 메시지 후보
3. 다음 stage

사용자가 `승인, 커밋·푸시`라고 명령하면 commit과 push를 같은 작업 흐름에서 연속 수행한다. commit과 push를 별도 Micro Stage나 별도 승인 게이트로 쪼개지 않는다.

PR과 merge는 milestone이 끝났을 때만 수행한다. 사용자가 `MXX 승인, PR 생성·병합`처럼 명령하면 full milestone test 확인 후 PR 생성과 병합을 하나의 milestone 마감 흐름으로 처리한다.

긴 기능 branch에서 여러 stage commit이 쌓이는 것은 정상이다.
