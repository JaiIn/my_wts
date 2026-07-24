# 00. 환경파일 우선 설정

## 1. 결정

`my_wts`는 Next.js skeleton을 생성한 직후, 다른 기능 코드보다 먼저 환경파일 구조를 만든다.

```text
.env.example  → Git에 포함하는 변수명/안전 기본값 템플릿
.env.local    → 로컬 실행 전용, Git에서 제외
```

실제 파일명은 `.env.local`을 사용한다. Next.js가 기본 지원하며 비밀값이 실수로 브라우저 공개 변수에 들어가는 위험을 줄이기 쉽다. 일반 `.env`는 사용하지 않는 것을 기본으로 한다.

## 2. 최초 생성

PowerShell:

```powershell
Set-Location C:\Users\admin\Desktop\my_wts
Copy-Item .env.example .env.local
```

`.env.example`의 기준 내용은 `templates/.env.example`에 포함되어 있다.

## 3. 초기 상태

프로젝트 초기에는 실제 키가 없어도 된다.

```dotenv
TOSS_API_BASE_URL=https://openapi.tossinvest.com
TOSS_CLIENT_ID=
TOSS_CLIENT_SECRET=
ALLOW_LIVE_TOSS_API=false
LOCAL_BIND_HOST=127.0.0.1
LOCAL_PORT=3000
DATABASE_PATH=./data/my_wts.sqlite3
LOG_LEVEL=info
LOG_PATH=./logs/my_wts.log
REQUEST_TIMEOUT_GET_MS=8000
```

이 상태로 mock UI, contract test, BFF mock transport를 개발한다.

## 4. 값 입력 시점

| 변수 | 입력 시점 |
|---|---|
| `TOSS_CLIENT_ID` | MS-04.01 최초 live read-only 직전 |
| `TOSS_CLIENT_SECRET` | MS-04.01 최초 live read-only 직전 |
| `ALLOW_LIVE_TOSS_API` | MS-04의 승인된 live read-only smoke 시 |

초기 환경파일 생성과 실제 자격증명 입력은 다른 일이다. `.env.local`은 먼저 만들지만 실제 secret은 필요해질 때만 요청한다.

## 5. 공개 변수 금지

다음 이름은 사용하지 않는다.

```text
NEXT_PUBLIC_TOSS_CLIENT_ID
NEXT_PUBLIC_TOSS_CLIENT_SECRET
NEXT_PUBLIC_TOSS_ACCESS_TOKEN
VITE_TOSS_CLIENT_SECRET
```

`NEXT_PUBLIC_*`와 `VITE_*`는 브라우저 bundle에 포함될 수 있다.

## 6. Git 확인

`.gitignore` 필수:

```gitignore
.env
.env.local
.env.*.local
!.env.example
```

확인:

```powershell
git status --short
git check-ignore -v .env.local
```

`.env.local`이 Git 변경 목록에 나타나면 개발을 중단하고 ignore 설정을 먼저 고친다.

## 7. 환경변수 검증 정책

- 앱 시작 시 변수의 형식은 검증한다.
- live flag가 false이면 client ID/secret이 비어 있어도 앱이 시작되어야 한다.
- live flag가 true인데 키가 비어 있으면 명확한 server-side configuration error를 낸다.
- 실제 주문 활성화 환경변수는 정의하지 않는다.
- 환경값 자체는 오류 메시지와 로그에 포함하지 않는다.

## 8. 단계 완료 체크

- [ ] `.env.example` 생성
- [ ] `.env.local` 복사
- [ ] `.env.local` Git ignore 확인
- [ ] live 조회 flag가 false
- [ ] secret이 빈 값이며 accountSeq 환경변수가 없음
- [ ] 자격증명 없이 local mock 실행 가능
- [ ] 완료 보고 후 사용자 승인 대기
