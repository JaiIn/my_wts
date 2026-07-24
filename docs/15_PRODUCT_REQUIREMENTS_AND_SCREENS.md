# 15. 제품 요구사항과 화면 명세

상태: `FROZEN`  
제품 버전: `my_wts v1.0`

## 1. 제품 목표

다른 증권사 WTS와 유사한 시장·계좌 조회 경험을 로컬 웹 UI로 제공하되 실제 주문은 제공하지 않는다.

포함:

- 로컬 회원가입·로그인·로그아웃
- 국내·미국 종목 시세, 정보, 경고, 호가, 체결, 캔들
- 환율, 장 캘린더, 랭킹, 지수·국채, 투자자별 매매대금
- Toss 계좌 선택, 보유자산, 매수가능금액, 매도가능수량, 수수료
- 일반 주문·조건주문 목록과 상세 read-only 조회
- 실제 전송 없는 일반·조건주문 시뮬레이터
- 사용자별 watchlist와 로컬 설정

제외:

- Toss 주문 생성·정정·취소
- Toss 조건주문 생성·정정·취소
- 자동매매, 가격 감시, background trigger
- 배포와 외부 공개

## 2. 사용자

- 로컬 SQLite에 여러 사용자 profile을 등록할 수 있음
- 사용자명·표시 이름·비밀번호로 회원가입
- 로그인 session으로 보호 화면 접근
- 사용자별 watchlist·설정·선택 accountRef 분리
- Toss OAuth client credentials는 앱 공용 server-only 설정
- Toss 계좌는 사용자가 명시적으로 선택
- 관리자·역할·권한 등급은 없음

## 3. 앱 경로

| Route | 화면 | 주요 기능 |
|---|---|---|
| `/signup` | 회원가입 | 사용자명, 표시 이름, 비밀번호 |
| `/login` | 로그인 | session 생성 |
| `/` | Redirect | 로그인 상태에 따라 `/market` 또는 `/login` |
| `/market` | 시장 홈 | 검색, watchlist, 가격 요약, 장 상태 |
| `/market/[symbol]` | 종목 상세 | 정보, 경고, 현재가, 호가, 체결, 캔들 |
| `/rankings` | 랭킹 | 국가·종류·기간별 랭킹 |
| `/indicators` | 시장지표 | 지수·국채, 투자자 매매 |
| `/portfolio` | 포트폴리오 | 선택 계좌, holdings, 손익, 주문정보 |
| `/orders` | 일반 주문 내역 | OPEN/CLOSED, filter, pagination |
| `/orders/[orderId]` | 일반 주문 상세 | 상태·체결 read-only |
| `/trade/[symbol]` | 주문 시뮬레이터 | 입력, 예상값, 비실주문 결과 |
| `/conditional-orders` | 조건주문 내역 | OPEN/CLOSED read-only |
| `/conditional-orders/[id]` | 조건주문 상세 | 상태·조건 read-only |
| `/conditional-simulator` | 조건주문 시뮬레이터 | SINGLE/OCO/OTO validation |
| `/settings` | 설정 | 연결 상태, Toss 계좌 선택, 사용자 설정 |
| `/diagnostics` | 진단 | 버전, rate/cache, redacted 오류 |

## 4. 공통 레이아웃

- 로그인 전: 중앙 auth card
- 로그인 후 sidebar: 시장, 랭킹, 지표, 포트폴리오, 주문내역, 조건주문내역, 시뮬레이터, 설정
- 상단 bar: 장 상태, 선택 계좌 마스킹, API 연결 상태
- sidebar 하단: 표시 이름과 로그아웃
- toast: 성공·비차단 오류
- inline alert: 경고·부분 실패
- 모든 시뮬레이터 상단: `시뮬레이션 전용 — 실제 주문이 전송되지 않습니다`

Desktop 우선 최소 너비는 1280px이다. 768~1279px은 sidebar 축소형, 768px 미만은 세로 배치한다.

## 5. 회원가입·로그인

회원가입:

- username 3~32자
- displayName 1~40자
- password 10~128자
- password confirmation
- 성공 시 자동 로그인 후 `/market`

로그인:

- username/password
- 실패 시 사용자 존재 여부를 구분하지 않는 메시지
- 성공 시 안전한 내부 `next` 또는 `/market`

로그아웃:

- POST 요청으로 session 폐기
- `/login` 이동
- browser back으로 보호 데이터 재표시 금지

세부 계약은 `22_LOCAL_AUTHENTICATION_SPEC.md`를 따른다.

## 6. 시장 홈

1. symbol/종목명 검색
2. 사용자별 watchlist
3. KR/US 장 상태
4. 선택 종목 현재가
5. 최근 조회 종목

2자 이상 local 검색, symbol 완전 일치 우선, 직접 symbol 입력을 지원한다.

## 7. 종목 상세

Tab: `overview`, `orderbook`, `trades`, `chart`.

- symbol, name, market, currency
- timestamp와 stale 표시
- warnings와 trading suspension
- 현재가
- widget별 독립 오류
- 이전 cache는 stale badge와 표시

## 8. 랭킹·시장지표

랭킹:

- KR/US
- 공식 6개 type
- 공식 7개 duration
- caution 제외
- count 20/50/100

시장지표:

- 공식 8개 symbol
- indicator cards/chart
- KOSPI/KOSDAQ 투자자별 매매대금
- 잠정치와 updatedAt

## 9. 포트폴리오

- Toss 계좌가 하나여도 사용자 확인 후 선택
- 계좌번호 끝 4자리만 표시
- KRW/USD 보유자산
- 원금, 평가금액, 손익, 일간손익
- 종목별 table
- buying power, sellable quantity, commission

## 10. 주문·조건주문 내역

일반 주문:

- OPEN/CLOSED
- symbol/date filter
- CLOSED cursor pagination
- 상태, side, quantity, filledQuantity, price, orderedAt
- 상세 execution과 상태 timeline
- 정정·취소 action 없음

조건주문:

- OPEN/CLOSED
- SINGLE/OCO/OTO
- 감시 조건과 현재 상태 read-only
- 생성·수정·취소 action 없음

다른 채널에서 실제로 생성된 주문도 조회 결과에 포함될 수 있다는 안내를 표시한다.

## 11. 일반 주문 시뮬레이터

입력:

- 선택 계좌
- symbol/name
- BUY/SELL
- LIMIT/MARKET
- DAY/CLS
- quantity 또는 orderAmount
- price

결과:

- 예상 주문금액·수수료·통화
- buying power 또는 sellable quantity 참고값
- 종목 경고와 장 상태
- validation 오류
- `SIMULATION_ONLY`

`주문`, `매수`, `매도` 버튼 대신 `시뮬레이션 계산` 버튼만 사용한다. 결과를 저장하거나 Toss에 제출하지 않는다.

## 12. 조건주문 시뮬레이터

- SINGLE/OCO/OTO 입력
- symbol, quantity, orderType, expireDate, first, second
- 관계·가격·만료일 validation
- OCO/OTO LIMIT 제약
- 실제 가격 감시와 trigger 없음
- 결과 저장과 Toss 제출 없음

## 13. 설정

- 로그인 사용자명·표시 이름
- app/version, OpenAPI snapshot
- API base host와 live read flag
- Toss token 상태
- 마스킹 계좌 목록과 선택
- 사용자별 화면 설정

password, secret, token, accountSeq 원문은 표시하지 않는다.

## 14. 진단

- 최근 redacted 오류 100건
- rate-limit remaining
- cache entry 수
- DB basename/schema version
- build version
- 실제 주문 기능: `NOT_IMPLEMENTED`

raw body와 인증정보는 표시하지 않는다.

## 15. 접근성

- input label
- keyboard navigation과 focus visible
- 색상 외 텍스트로 BUY/SELL·상승/하락 구분
- table header/caption
- chart text summary
- auth 오류 `aria-live`

## 16. 비기능 요구사항

| 항목 | 기준 |
|---|---|
| bind | 127.0.0.1 |
| market shell | local 기준 2초 내 |
| Toss GET timeout | 8초 |
| auth DB request | local 기준 500ms 내 |
| stage test | 목표 60초 |
| browser | 최신 Chrome/Edge |
| timezone | 내부 ISO offset, 표시 Asia/Seoul |
| locale | ko-KR |
| currency | KRW/USD |

## 17. 완료 범위

M00~M10을 완료하면 v1.0이다. 완료 조건에는 회원가입·로그인·로그아웃, WTS 조회 화면, 일반·조건주문 시뮬레이터, 그리고 Toss mutation client·route·network 요청이 0개라는 safety 검증이 포함된다.

