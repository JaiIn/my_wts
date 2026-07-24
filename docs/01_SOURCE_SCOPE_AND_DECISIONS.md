# 01. 공식 출처, 범위, 설계 결정

## 1. 확인 기준

확인일은 2026-07-24이며 공식 OpenAPI 버전은 `1.2.4`이다. 정확성 우선순위는 다음과 같다.

1. 공식 OpenAPI JSON
2. 공식 overview Markdown
3. 공식 API reference Markdown
4. JavaScript 기반 대화형 문서

공식 `llms.txt`도 OpenAPI JSON을 endpoint, schema, request/response, 인증, 오류, rate limit의 Source of Truth로 명시한다.

## 2. 제공된 URL 복원

사용자 메시지에서 주소가 연속으로 붙어 있었으므로 다음 개별 주소로 해석했다.

- `/docs`
- `/docs/auth#tag/auth/issueoauth2token`
- `/docs/market-data#tag/market-data`
- `/docs/stock-info#tag/stock-info/getstocks`
- `/docs/stock-info#tag/stock-info/getstockwarnings`
- `/docs/market-info#tag/market-info/getexchangerate`
- `/docs/account#tag/account/getaccounts`
- `/docs/asset#tag/asset/getholdings`
- `/docs/order#tag/order/createorder`
- `/docs/order#tag/order/modifyorder`
- `/docs/order#tag/order/cancelorder`
- `/docs/order-history#tag/order-history/getorders`
- `/docs/order-info#tag/order-info/getbuyingpower`

루트 `/docs`가 전체 API를 포괄하므로 지정 endpoint 외 추가 operation도 조사 범위에 포함했다.

## 3. 전체 API 범위

| 범주 | 기능 |
|---|---|
| Auth | OAuth2 Client Credentials 토큰 |
| Market Data | 호가, 현재가, 체결, 상·하한가, 캔들 |
| Stock Info | 종목 마스터, 매수 유의사항 |
| Market Info | 환율, 국내/미국 장 캘린더 |
| Ranking | 거래대금·거래량·등락률 랭킹 |
| Market Indicators | 지수·국채 가격/캔들, 투자자별 매매대금 |
| Account | 계좌 목록 |
| Asset | 보유 주식 |
| Order | 생성, 정정, 취소 |
| Order History | 목록, 상세 |
| Order Info | 매수가능금액, 매도가능수량, 수수료 |
| Conditional Order | SINGLE/OCO/OTO 생성, 수정, 취소 |
| Conditional Order History | 목록, 상세 |

## 4. 제품 범위

### v0.1 필수

- 로컬 회원가입·로그인·로그아웃
- 종목 검색/선택
- 현재가·호가·체결·캔들
- 종목 기본정보·경고
- 환율·장 운영 상태
- 계좌 선택
- 보유자산
- 주문내역·주문상세
- 매수가능금액·매도가능수량·수수료
- 실제 전송 없는 주문 시뮬레이터와 preview UI

### v1.0 후반 필수

- 랭킹
- 시장지표
- 조건주문 내역 read-only 화면
- 실제 전송 없는 조건주문 시뮬레이터

### 제외

- 배포
- 외부 사용자·조직·권한 역할
- 실제 주문 생성·정정·취소 API 구현과 호출
- 실제 조건주문 생성·정정·취소 API 구현과 호출
- 자동매매
- AI의 자율 주문
- 무인 조건 생성
- 초단타/고빈도

## 5. 기술 결정

확정 프로젝트 정보:

```text
Project: my_wts
GitHub: https://github.com/JaiIn/my_wts
Windows local path: C:\Users\admin\Desktop\my_wts
```

### 확정: Next.js 로컬 풀스택

Next.js 16 App Router를 확정한 이유:

- UI와 로컬 BFF를 한 저장소에서 관리
- server-only 모듈로 secret 격리
- Route Handler에서 allowlist, validation, redaction 적용
- TypeScript type sharing 가능
- 로컬 실행이 단순함

React/Vite SPA + 별도 backend 안은 사용하지 않는다. 확정 세부 스택은 `14_TECH_STACK_DECISION.md`를 따른다.

## 6. 구현 전 재검증

다음 시점마다 OpenAPI 버전을 다시 확인한다.

- 프로젝트 생성 직전
- 최초 live read-only 호출 직전
- 계좌·주문내역 read-only 연동 직전

버전이 다르면 구현을 중단하고 문서 변경 승인을 요청한다. 실제 주문 mutation operation은 공식 문서 조사 대상에는 남지만 제품 구현 대상에는 포함하지 않는다.
