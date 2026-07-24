# 22. 로컬 회원가입·로그인·로그아웃

상태: `FROZEN`

## 1. 범위

`my_wts`는 인터넷 인증 서비스가 아닌 로컬 SQLite 인증을 사용한다.

- 회원가입
- 로그인
- 로그아웃
- 로그인 세션
- 사용자별 관심종목·화면 설정·선택 계좌 분리

이 인증은 로컬 앱의 사용자 구분과 브라우저 세션 보호를 위한 것이다. 토스증권 OAuth2와는 별개다. 이메일 인증, 비밀번호 찾기, 소셜 로그인, 관리자·권한 역할, 외부 사용자 초대는 구현하지 않는다.

## 2. 화면

| Route | 기능 | 비로그인 접근 |
|---|---|---:|
| `/signup` | 로컬 회원가입 | O |
| `/login` | 로그인 | O |
| `/` 및 WTS 화면 | 대시보드 | X |

로그인하지 않은 사용자가 보호 화면에 접근하면 `/login?next=<상대경로>`로 이동한다. `next`는 `/`로 시작하는 내부 상대경로만 허용한다.

회원가입 입력:

- 사용자명: 3~32자, `[A-Za-z0-9._-]`
- 표시 이름: 1~40자
- 비밀번호: 10~128자
- 비밀번호 확인

로그인 입력:

- 사용자명
- 비밀번호

로그아웃은 sidebar 하단의 버튼으로 수행하며 성공 후 `/login`으로 이동한다.

## 3. 비밀번호

Node.js 내장 `crypto.scrypt`를 사용한다.

```text
algorithm: scrypt
N: 32768
r: 8
p: 1
salt: random 16 bytes
derived key: 64 bytes
encoding: base64url
comparison: timingSafeEqual
```

DB에는 다음 versioned 문자열만 저장한다.

```text
scrypt$v1$N=32768,r=8,p=1$<salt>$<derivedKey>
```

평문 비밀번호는 저장·로그·응답하지 않는다. 비밀번호 최대 길이는 scrypt 자원 고갈 방지를 위해 128자로 제한한다.

## 4. 사용자명

- 입력값 양끝 공백 제거
- DB 식별용 `username_normalized`는 Unicode NFKC 후 소문자 변환
- v1은 ASCII 규칙만 허용
- 중복 오류는 `USERNAME_ALREADY_EXISTS`
- 표시 이름은 HTML로 해석하지 않고 text로만 렌더링

## 5. 세션

로그인 성공 시 `crypto.randomBytes(32)`로 opaque token을 만든다. 브라우저에는 원문 token, DB에는 SHA-256 hash만 저장한다.

| 항목 | 값 |
|---|---|
| Cookie | `my_wts_session` |
| HttpOnly | true |
| SameSite | Strict |
| Secure | false — 127.0.0.1 HTTP 전용 |
| Path | `/` |
| Idle expiry | 12시간 |
| Absolute expiry | 7일 |
| Rotation | 로그인할 때마다 |

인증된 요청 시 마지막 사용 시각을 최대 15분에 한 번 갱신한다. 로그아웃은 DB session을 폐기한 뒤 cookie를 `Max-Age=0`으로 제거한다. 서버 재시작 후에도 만료되지 않은 로그인 session은 유지된다.

## 6. BFF

Base: `/api/v1`

| Method | Route | 성공 | 설명 |
|---|---|---:|---|
| POST | `/auth/signup` | 201 | 사용자 생성 후 로그인 |
| POST | `/auth/login` | 204 | 세션 생성 |
| POST | `/auth/logout` | 204 | 현재 세션 폐기 |
| GET | `/auth/session` | 200 | 안전한 현재 사용자 정보 |

`signup` request:

```json
{
  "username": "local.user",
  "displayName": "로컬 사용자",
  "password": "<10~128자>"
}
```

`login` request:

```json
{
  "username": "local.user",
  "password": "<10~128자>"
}
```

`session` response:

```json
{
  "data": {
    "user": {
      "id": "usr_...",
      "username": "local.user",
      "displayName": "로컬 사용자"
    }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "RFC3339"
  }
}
```

비밀번호는 response schema에 존재하지 않는다.

## 7. 방어 규칙

- Host와 Origin은 `127.0.0.1:3000`만 허용
- 상태 변경 요청은 JSON `Content-Type`과 동일 Origin을 요구
- 로그인 실패 메시지는 사용자 존재 여부와 무관하게 동일
- 로그인 실패 제한: 사용자명+loopback 기준 15분에 5회
- 성공한 로그인과 제한 만료 시 실패 횟수 초기화
- session token과 password field는 Pino redaction
- auth response는 `Cache-Control: no-store`
- XSS 방지를 위해 사용자 입력을 HTML로 렌더링하지 않음

로컬 앱이므로 CAPTCHA, 이메일 잠금 해제, 외부 IdP는 사용하지 않는다.

## 8. 계좌 선택과 사용자 데이터

- Toss 계좌 선택은 인증 session의 `selectedAccountRef`에 저장
- 계좌 원문은 session/DB에 저장하지 않음
- watchlist와 app settings는 `user_id`로 분리
- Toss client ID/secret은 `.env.local`의 앱 공용 server-only 값
- 한 로컬 사용자가 다른 사용자의 watchlist·설정·session을 조회할 수 없음

## 9. 테스트

- signup 정상·중복·validation
- scrypt hash가 매번 다른 salt를 사용
- timing-safe password 검증
- login 성공·실패·rate limit
- session cookie 속성
- logout 후 session 재사용 불가
- idle/absolute expiry
- 보호 route redirect와 API 401
- open redirect 차단
- 사용자별 watchlist/settings 격리
- 로그와 오류에 password/token 없음

