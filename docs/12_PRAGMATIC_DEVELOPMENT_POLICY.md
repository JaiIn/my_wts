# 12. 실용적 개발 정책

## 1. ai_stock에서 개선할 점

이번 `my_wts`는 다음 병목을 반복하지 않는다.

| 기존 문제 | my_wts 보완 |
|---|---|
| 로컬 프로젝트에 과도한 규제 | secret·local auth 경계에만 강한 통제 |
| 규제 기반 구축이 한 달 이상 | M01 인증 후 M02에서 즉시 보이는 mock UI |
| 개발할수록 test가 지나치게 느림 | stage/milestone/final suite 분리 |
| commit, push, merge가 각각 단계 | stage 승인 한 번에 commit+push |
| 모든 단계에 긴 보고서 | 짧은 completion note 하나 |
| preflight/hardening 반복 | 같은 위험의 중복 stage 금지 |
| 수평 레이어만 오래 구축 | 작동하는 수직 slice 우선 |

## 2. 위험 비례 원칙

### 가벼운 절차

- CSS/layout
- mock UI
- read-only mapper
- 문구/접근성
- 로컬 설정

affected tests와 짧은 checklist면 충분하다.

### 중간 절차

- live read-only API
- account/holdings
- token lifecycle
- persistence

명시적 live 승인, redaction, contract test가 필요하다.

### 강한 절차

- secret 경계
- password/session 경계
- 금지된 Toss mutation route 검출

scrypt/session tests, redaction, same-origin, mutation 부재 검사가 필요하다.

## 3. YAGNI

다음은 실제 필요가 생기기 전 구현하지 않는다.

- 외부 다중 tenant
- role/permission matrix
- 배포 pipeline
- Kubernetes/Docker 운영 체계
- event bus
- 범용 plugin system
- 복잡한 repository abstraction
- 분산 cache
- telemetry backend
- 자동매매 engine

## 4. 완료 기준의 크기

Stage 완료에 필요한 최소 증거:

- 기능이 acceptance criterion을 만족
- 영향 test 통과
- type/lint 문제 없음
- 민감정보 노출과 금지 mutation 호출 없음
- commit 후보가 하나의 의도를 가짐

필요 없는 것:

- 매번 전체 suite
- 매번 server smoke
- 매번 별도 preflight 문서
- 같은 기능의 fixture expansion/hardening을 별도 단계로 반복
- 매번 PR/merge

## 5. 속도 경보

다음이면 계획을 재검토한다.

- 사용자에게 보이는 첫 화면 전에 5개 이상 infrastructure stage
- read-only 기능 하나에 2주 이상
- `check:stage` 60초 초과가 반복
- 전체 suite가 기능 수보다 더 빠르게 증가
- production이 아닌데 운영용 추상화가 늘어남
- 보고서 파일 수가 기능 파일 수에 근접

## 6. 품질 부채 처리

발견 즉시 모든 것을 고치지 않는다.

- 현재 stage를 깨뜨리는 문제: 즉시 수정
- 보안/금지 mutation 위험: 즉시 중단·수정
- 유지보수 개선: backlog
- 미사용 기능 확장: 하지 않음

backlog 항목은 구체적인 증상, 영향, 재현 근거가 있을 때만 만든다.

## 7. 사용자 승인

모든 Micro Stage 후 기다린다는 규칙은 유지한다. 다만 사용자는 한 명령으로 연속 부속 작업을 승인할 수 있다.

예:

```text
MS-01.03 승인. 커밋과 push까지 하고 다음 단계는 대기.
```

또는:

```text
MS-01.03 승인. 커밋과 push 후 MS-01.04도 진행.
```

두 번째 명령은 다음 stage 시작까지 명시적으로 승인한 것이므로 다시 묻지 않고 진행할 수 있다. 그 다음 stage 완료 시 다시 멈춘다.
