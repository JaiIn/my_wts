# 21. 문서 동결 정책

상태: `FROZEN`  
동결 기준일: 2026-07-24  
Baseline: `my_wts Documentation Baseline v1.1`

## 1. 목적

개발 중 설계를 계속 바꾸거나 문서 작업이 기능 개발을 지연하는 문제를 방지한다.

## 2. 동결 대상

```text
README.md
CODEX.md
docs/**
references/**
specs/**
templates/**
```

M00 개발 시작 후 위 경로는 읽기 전용이다.

## 3. 개발 중 금지

- 기존 문서 수정
- 새 설계·보고서·runbook 추가
- stage completion report 파일 생성
- 별도 후속 작업 또는 백로그 문서 생성
- OpenAPI/YAML/SQL spec 수정
- README 상태표 갱신
- 구현 편의를 위한 계약 변경

Stage 완료 보고와 체크리스트는 채팅에서만 제공한다.

## 4. 코드가 문서와 충돌할 때

1. 구현을 중단한다.
2. 문서 기준과 충돌 내용을 사용자에게 보고한다.
3. 문서를 우회하는 코드를 작성하지 않는다.
4. 사용자가 아래 형식으로 명시 승인하기 전 변경하지 않는다.

```text
문서 변경 승인
- 대상:
- 변경 이유:
- 변경 내용:
- 영향 stage:
```

## 5. 허용되는 유일한 예외

- Toss 공식 OpenAPI가 변경되어 기존 계약으로 호출할 수 없음
- 보안상 실제 취약점이 확인됨
- 문서 내부 모순으로 두 규칙을 동시에 만족할 수 없음
- 운영체제/확정 dependency가 더 이상 실행되지 않음

단순 코드 선호, refactor 편의, 새 라이브러리 유행은 예외가 아니다.

## 6. 예외 처리

명시 승인 후에만:

1. change request ID 부여
2. 영향 문서만 최소 수정
3. BFF spec/traceability/test 동시 갱신
4. 새 baseline checksum
5. 변경 전후 diff 보고
6. 다시 동결

## 7. 문서 없는 개발 기록

다음 정보는 Git commit과 채팅 완료 보고로 충분하다.

- stage 결과
- 변경 파일
- test 결과
- commit SHA
- 알려진 구현 문제

새 Markdown report를 만들지 않는다.

## 8. Codex 강제 규칙

Codex는 개발 stage 시작 시 다음을 확인한다.

```text
Documentation mode: FROZEN
Docs write permission: DENIED
Completion report: CHAT ONLY
```

사용자가 기능 구현을 명령한 것은 문서 변경 권한을 포함하지 않는다.

## 9. Git 검증

stage commit 전:

```powershell
git diff --name-only origin/main...HEAD -- README.md CODEX.md docs references specs templates
```

현재 milestone의 승인된 baseline commit 이후 frozen path 변경이 있으면 commit을 중단한다.

## 10. 동결 완료 선언

이 ZIP이 최종 baseline이다. 개발 시작 시 전체 내용을 `my_wts` repository에 배치하고 baseline commit으로 고정한다.
