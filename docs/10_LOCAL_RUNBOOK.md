# 10. Windows 로컬 실행 Runbook

## 1. 기준 경로

```powershell
Set-Location C:\Users\admin\Desktop\my_wts
```

GitHub:

```text
https://github.com/JaiIn/my_wts
```

2026-07-24 확인 시 저장소는 비어 있다.

## 2. 초기 clone

빈 저장소를 clone할 수 있다.

```powershell
Set-Location C:\Users\admin\Desktop
git clone https://github.com/JaiIn/my_wts.git
Set-Location .\my_wts
```

이미 같은 이름의 local folder가 있고 보존할 파일이 있다면 clone으로 덮어쓰지 않는다. 먼저 `git status`와 directory 내용을 확인한 뒤 remote만 연결한다.

```powershell
git init
git remote add origin https://github.com/JaiIn/my_wts.git
```

## 3. 일반 실행

Next.js skeleton 생성 직후 환경파일을 먼저 만든다.

```powershell
Copy-Item .env.example .env.local
git check-ignore -v .env.local
```

초기에는 client ID/secret을 비워두고 live 조회 flag를 false로 둔다. script 이름과 본문은 `19_CONFIG_COMMANDS_AND_FILE_CONVENTIONS.md`를 그대로 사용한다.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

브라우저는 `http://127.0.0.1:3000`을 사용한다. 실행 로그에서 `0.0.0.0` bind가 아닌지 확인한다.

첫 실행에서는 `/signup`에서 로컬 사용자를 만든다. 이후 `/login`에서 로그인하며, sidebar의 로그아웃 버튼으로 session을 종료한다. password는 `.env.local`에 넣지 않는다.

## 4. 자격증명 없는 실행

기본값:

```dotenv
ALLOW_LIVE_TOSS_API=false
```

이 상태에서 mock/read-only 화면과 모든 기본 테스트가 동작해야 한다.

## 5. 최초 live read-only 직전

MS-04.01에서만 수행한다.

1. WTS 설정 → Open API에서 client 발급
2. 허용 IP 등록
3. `.env.local`을 직접 편집
4. 채팅에는 값이 아니라 “입력 완료”만 전달

```dotenv
TOSS_CLIENT_ID=<직접 입력>
TOSS_CLIENT_SECRET=<직접 입력>
ALLOW_LIVE_TOSS_API=true
```

`.env.local`은 commit하지 않는다.

실제 주문 활성화 환경변수는 없다. 주문·조건주문 시뮬레이터는 Toss에 매수·매도·정정·취소 요청을 보내지 않는다.

## 6. 종료

PowerShell에서 dev server 창에 `Ctrl+C`. 종료 후 listener가 남지 않았는지 필요 시 확인한다.

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```

## 7. 빠른 검사와 milestone 검사

```powershell
pnpm check:stage
pnpm check:milestone
```

매 stage에서 milestone 검사를 반복하지 않는다.

## 8. 문제 진단

| 증상 | 확인 |
|---|---|
| 401 | token 만료/재발급 충돌 |
| 403 token | WTS 허용 IP |
| 429 | Retry-After/rate headers |
| account header error | 선택된 accountSeq |
| 빈 화면 | BFF 오류와 widget partial failure |
| 느린 test | duration report, E2E/server startup |

진단 시 secret/token/raw account 응답을 붙여넣지 않는다.
