# 11. my_wts Git/GitHub Workflow

## 1. 저장소

```text
Repository: https://github.com/JaiIn/my_wts
Local: C:\Users\admin\Desktop\my_wts
Status checked 2026-07-24: empty repository
```

## 2. 핵심 정책

```text
Micro Stage 1개 = 기능 commit 1개
Milestone 1개 = branch 1개 + PR 1개
Stage 승인 1회 = commit + push 함께 가능
Milestone 승인 1회 = full test + PR + merge 마감 흐름
```

Git 작업 자체를 Micro Stage로 만들지 않는다. commit, push, PR, merge는 개발 결과를 기록·통합하는 부속 작업이다.

## 3. Branch

예:

```text
codex/setup/M00-foundation
codex/auth/M01-local-auth
codex/market/M02-mock-market-screen
codex/api/M03-toss-readonly-client
codex/account/M05-account-assets
codex/orders/M06-order-history
```

stage마다 branch를 새로 만들지 않는다.

## 4. Commit

형식:

```text
<type>(<scope>): <stage-id> <summary>
```

예:

```text
feat(market): MS-01.03 add price card
feat(api): MS-02.04 connect stock and price BFF
test(orders): MS-06.04 cover preview expiry
chore(config): MS-00.03 add server-only config loader
```

한 commit에 포함:

- 해당 기능 코드
- 해당 기능에 필요한 테스트
- frozen 문서가 아닌 해당 기능 코드와 테스트

테스트를 별도 commit으로 억지 분리하지 않는다. 개발 시작 후 frozen 문서는 commit에 포함하지 않는다.

## 5. Stage 완료 흐름

Codex가 제시:

```text
MS-01.03 완료
- 변경: 회원가입 BFF와 화면
- 검증: affected tests 14 passed, typecheck passed
- commit 후보: feat(auth): MS-01.03 add local signup
- 다음: MS-01.04 로그인
- 상태: 사용자 승인 대기
```

사용자 명령:

```text
승인, 커밋·푸시하고 MS-01.04는 대기
```

Codex 동작:

1. 현재 diff와 branch 재확인
2. stage 파일만 stage
3. commit
4. push
5. commit SHA/remote branch 보고
6. 다음 stage를 시작하지 않고 대기

commit 승인과 push 승인을 다시 묻지 않는다.

## 6. Milestone 마감

사용자 명령 예:

```text
M01 승인, 전체 테스트 후 PR 생성·병합
```

흐름:

1. milestone full tests
2. diff/commit history 확인
3. branch push 확인
4. PR 생성
5. checks/충돌 확인
6. 승인 범위에 따라 merge
7. local main fast-forward
8. 다음 milestone은 대기

PR 생성과 merge 사이에 문제나 보호 규칙이 없으면 불필요하게 별도 단계로 나누지 않는다. 실패·충돌·review가 생기면 그때만 중단한다.

## 7. PowerShell 예시

```powershell
Set-Location C:\Users\admin\Desktop\my_wts
git status --short --branch
git switch -c codex/auth/M01-local-auth
git add <stage files>
git diff --cached --check
git commit -m "feat(auth): MS-01.03 add local signup"
git push -u origin codex/auth/M01-local-auth
```

실제 작업에서는 `<stage files>`를 명시적으로 나열한다. 무관한 파일이 있을 때 `git add .`를 사용하지 않는다.

## 8. 보호 항목

commit 금지:

- `.env.local`
- secret/token
- account number/accountSeq 원문
- local DB
- raw API logs
- node_modules/build artifacts

force push, reset --hard, main 직접 overwrite는 사용하지 않는다.

## 9. 저장소가 빈 현재 상태

첫 commit은 M00의 최소 실행 가능한 skeleton과 필수 문서를 함께 넣는다. 문서 전체만 먼저 수십 commit으로 쌓지 않는다.

확정 순서:

1. local skeleton 생성
2. 이 ZIP의 전체 frozen baseline을 repository에 복사
3. 기본 실행과 test 확인
4. 첫 stage commit+push
