# 06. 보안과 주문 금지 경계

## 1. 위협 모델

로컬 전용이어도 다음 위험이 있다.

- 브라우저 bundle/source map을 통한 Toss secret 유출
- 개발 로그·오류 overlay·네트워크 탭 노출
- 악성 웹페이지의 localhost 요청
- XSS/CSRF와 로컬 인증 session 탈취
- 비밀번호 평문 저장 또는 로그 노출
- 잘못된 계좌 선택
- 숫자 반올림·통화 단위 오류
- 주문 시뮬레이터가 실제 주문처럼 오인되는 UX
- 개발 중 실수로 Toss mutation endpoint를 호출하는 문제

## 2. 네트워크 경계

- 서버는 `127.0.0.1`에만 bind
- `0.0.0.0` 금지
- 임의 CORS 허용 금지
- Host/Origin allowlist
- 로컬 BFF는 임의 upstream URL을 받지 않음
- endpoint, method, query/body schema를 각각 allowlist
- request body size 제한

## 3. 비밀정보

- `.env.local`에 사용자가 Toss key를 직접 입력
- Git ignore + secret scan
- server-only import guard
- structured logger redaction
- 오류 객체 직렬화 시 headers/body allowlist
- token response와 Authorization header 로깅 금지
- password와 session token 로깅 금지
- `NEXT_PUBLIC_*`에 비밀정보 금지

## 4. 로컬 인증

회원가입·로그인·로그아웃의 기준은 `22_LOCAL_AUTHENTICATION_SPEC.md`다.

- 비밀번호: Node.js `crypto.scrypt`
- 비교: `timingSafeEqual`
- session: 32-byte random opaque token
- DB 저장: session token의 SHA-256 hash만
- cookie: HttpOnly, SameSite=Strict, Secure=false, Path=/
- 로그인 실패: 15분에 5회
- auth 응답: `Cache-Control: no-store`

## 5. 실제 주문 영구 금지

다음 Toss operation은 조사 문서에만 남고 애플리케이션에서 구현·호출하지 않는다.

```text
createOrder
modifyOrder
cancelOrder
createConditionalOrder
modifyConditionalOrder
cancelConditionalOrder
```

강제 조건:

- integrations/toss에 위 mutation client가 없어야 한다.
- BFF OpenAPI에 위 mutation route가 없어야 한다.
- 환경변수에 주문 활성화 flag가 없어야 한다.
- 브라우저 UI에 실제 제출·정정·취소 action이 없어야 한다.
- MSW의 unhandled network 정책이 위 Toss endpoint 호출을 실패시켜야 한다.
- safety test가 source와 generated route에서 금지 operation 이름과 mutation path를 검사한다.

## 6. 주문 시뮬레이터

시뮬레이터는 WTS와 유사한 주문 입력 경험을 제공하지만 실제 HTTP mutation은 수행하지 않는다.

- account, symbol, market, side
- quantity 또는 orderAmount
- LIMIT/MARKET
- 예상 주문금액·수수료·통화
- buying power 또는 sellable quantity read-only 참고
- 종목 경고·장 정보 표시
- “시뮬레이션이며 실제 주문이 아닙니다” 상시 표시
- 결과는 `SIMULATION_ONLY`로 표시
- 저장·예약·백그라운드 실행 없음

조건주문 시뮬레이터도 SINGLE/OCO/OTO 입력과 validation 결과만 보여준다. 가격 감시, trigger, 주문 생성은 하지 않는다.

## 7. 금액·수량

- API decimal string 유지
- 표시 format과 계산 value 분리
- KRW/USD 단위 명시
- percent와 ratio 구분
- quantity와 orderAmount는 상호 배타적
- LIMIT price 필수, MARKET price 금지
- 미국 소수점 규칙 별도 validator
- 예상 값과 실제 체결을 혼동하지 않는 문구 사용

## 8. 계좌

- 첫 Toss 계좌 자동 선택 금지
- 선택 accountRef는 로그인 session에 연결
- accountSeq 원문은 DB·cookie·로그에 저장하지 않음
- account-not-found 시 선택 화면으로 복귀
- 로그아웃 시 선택 accountRef 제거

## 9. AI 경계

AI가 할 수 있는 일:

- 시장 정보 요약
- 사용자 질문 설명
- watchlist 후보 제안
- 시뮬레이션 결과 설명

AI가 할 수 없는 일:

- 실제 주문 API 호출
- 가격 감시 후 주문 실행
- 사용자 인증정보 접근
- 수익 보장 표현

## 10. 감사 로그

기록 가능:

- timestamp
- userId의 비가역 hash
- operation name
- endpoint template
- status code
- requestId
- latency

기록 금지:

- password
- session token/cookie
- Authorization
- Toss access token/client secret
- 전체 계좌번호
- raw request/response

## 11. 완료 조건

local-only는 보안 무시를 뜻하지 않는다. 다만 실제 주문 코드가 없으므로 주문 승인·멱등성·실주문 회고 같은 과잉 규제는 만들지 않는다. 핵심은 로컬 인증, secret 격리, 동일 Origin, 조회 전용 Toss client, 실제 주문 endpoint 부재를 검증하는 것이다.

