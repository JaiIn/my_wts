# 04. 계좌·자산·주문 API

> 제품 범위 주의: 이 문서는 토스 공식 API 전체 명세를 숙지하기 위한 참고 자료다. `my_wts`는 계좌·자산·주문정보·주문내역 GET만 구현한다. 주문/조건주문 생성·정정·취소 항목은 구현하거나 호출하지 않는다.

이 문서의 모든 endpoint는 Bearer token과 `X-Tossinvest-Account`가 필요하다. 단, 계좌 목록 조회는 선택할 accountSeq를 얻는 진입점이므로 계좌 헤더 없이 호출한다.

## 1. 계좌

```http
GET /api/v1/accounts
```

정상 계좌만 반환하며 없으면 빈 배열이다.

| 필드 | 설명 |
|---|---|
| `accountNo` | 계좌번호, UI/로그에서 마스킹 |
| `accountSeq` | 계좌 관련 API 헤더 값 |
| `accountType` | 현재 지원은 BROKERAGE 중심 |

enum은 향후 확장을 허용한다. 사용자가 accountSeq를 선택해야 하며 첫 계좌를 자동 선택해 주문하지 않는다.

## 2. 보유자산

```http
GET /api/v1/holdings
GET /api/v1/holdings?symbol=AAPL
```

- 국내/미국 주식
- 수량, 현재가, 평균매입가, 평가액, 손익, 일간손익, 비용
- 전체 요약은 통화별 원금과 원화 환산 손익을 포함
- 해외 옵션/채권 등은 제외
- 손익률은 문서상 원화 환산 기준

금액·수량·비율은 decimal string으로 처리한다. `0.1077` 같은 rate는 10.77%로 표시한다.

## 3. 주문 전 정보

### 매수 가능 금액

```http
GET /api/v1/buying-power?currency=KRW
```

미수 없는 현금 기반 `cashBuyingPower`를 반환한다. `my_wts`에서는 포트폴리오와 주문 시뮬레이터 참고값으로만 사용한다.

### 매도 가능 수량

```http
GET /api/v1/sellable-quantity?symbol=005930
```

국내는 정수, 미국은 소수점이 가능하다. 보유수량과 매도가능수량은 다를 수 있다.

### 수수료

```http
GET /api/v1/commissions
```

KR/US 시장별 수수료율과 적용기간을 반환한다. `0.015`는 문서상 0.015%이므로 표시 단위를 혼동하지 않는다.

## 4. 주문 생성 — 공식 명세 참고, 제품 구현 금지

```http
POST /api/v1/orders
Content-Type: application/json
```

### 수량 기반

필수:

- `symbol`
- `side`: `BUY`, `SELL`
- `orderType`: `LIMIT`, `MARKET`
- `quantity`

조건:

- LIMIT에는 `price` 필수
- MARKET에는 `price` 금지
- 기본 수량은 양의 정수
- 미국 시장가 매도만 소수점 수량 허용, 최대 6자리, 정규장만
- 미국 소수점 매수는 `orderAmount` 사용
- 수량 주문의 `timeInForce`는 선택이며 생략 시 `DAY`
- `CLS`는 미국 LIMIT 수량 주문에서만 LOC로 허용

국내 주식 지정가는 KRX 주식 호가 단위를 사용한다.

| 가격 구간 | 호가 단위 |
|---|---:|
| 2,000원 미만 | 1원 |
| 2,000원 이상 5,000원 미만 | 5원 |
| 5,000원 이상 20,000원 미만 | 10원 |
| 20,000원 이상 50,000원 미만 | 50원 |
| 50,000원 이상 200,000원 미만 | 100원 |
| 200,000원 이상 500,000원 미만 | 500원 |
| 500,000원 이상 | 1,000원 |

경계값에는 상위 구간의 호가 단위를 적용한다. 가격은 양의 정수이며 Decimal로 배수를 검증하고 자동 반올림·절삭·보정하지 않는다. 근거: [KRX 주식 매매제도](https://global.krx.co.kr/contents/GLB/06/0602/0602010201/GLB0602010201T3.jsp).

### 금액 기반

- 미국 시장가 전용
- `orderAmount` 필수
- `BUY`, `SELL` 모두 허용
- `timeInForce`, `price`, `quantity` 전달 금지
- 정규장에만 접수
- 금액은 고정되고 체결 수량이 변동

정규장 여부는 사용자 요청값이 아니라 server-side market calendar/read 결과를 trusted validation context로 전달한다.

### 멱등성

`clientOrderId`:

- 최대 36자
- 영숫자, `-`, `_`
- 같은 값 재요청 시 기존 결과 반환
- 유효기간 10분
- 같은 ID에 다른 내용은 conflict

이는 공식 mutation 사용자를 위한 설명이다. `my_wts`는 해당 값을 생성하거나 기록하지 않는다.

### 고액 주문

- 1억원 이상은 `confirmHighValueOrder=true` 필요
- 30억원 이상 정정은 문서상 별도 상한 오류 가능
- 이 API 플래그는 UI 최종 확인을 대체하지 않는다.

## 5. 주문 정정 — 공식 명세 참고, 제품 구현 금지

```http
POST /api/v1/orders/{orderId}/modify
```

- `orderType` 필수
- LIMIT이면 price 필수
- MARKET이면 price 금지
- 국내 주식 quantity 필수, 양의 정수
- 미국 주식 quantity 변경 불가
- 정정 성공 시 **새 orderId**가 발급된다.

공식 응답 관계에 대한 설명이며 `my_wts`는 정정 요청이나 관계 저장을 수행하지 않는다.

## 6. 주문 취소 — 공식 명세 참고, 제품 구현 금지

```http
POST /api/v1/orders/{orderId}/cancel
```

본문은 선택적 빈 JSON이다. 취소도 비동기 상태 전이가 가능하므로 성공 응답만 보고 최종 취소로 간주하지 않고 상세를 재조회한다. 취소 성공 시 새 operation orderId가 반환될 수 있다.

## 7. 주문 목록

```http
GET /api/v1/orders?status=OPEN
GET /api/v1/orders?status=CLOSED
```

필터:

- `status`: 필수, `OPEN` 또는 `CLOSED`
- `symbol`
- `from`, `to` KST 날짜
- `cursor`, `limit`

`OPEN`은 전량 반환하여 cursor/limit을 무시한다. `CLOSED`는 기본 20, 최대 100의 cursor pagination이다.

그룹 상태와 개별 상태가 다르다.

| 그룹 | 개별 상태 예 |
|---|---|
| OPEN | PENDING, PARTIAL_FILLED, PENDING_CANCEL, PENDING_REPLACE |
| CLOSED | FILLED, CANCELED, REJECTED, REPLACED, *_REJECTED, PARTIAL_FILLED |

## 8. 주문 상세

```http
GET /api/v1/orders/{orderId}
```

주요 상태:

- `PENDING`
- `PENDING_CANCEL`
- `PENDING_REPLACE`
- `PARTIAL_FILLED`
- `FILLED`
- `CANCELED`
- `REJECTED`
- `CANCEL_REJECTED`
- `REPLACE_REJECTED`
- `REPLACED`

취소·거부·정정된 주문도 `execution.filledQuantity`를 확인해야 한다.

## 9. 조건주문 mutation — 공식 명세 참고, 제품 구현 금지

조건주문 mutation은 제품 범위에서 제외한다. 목록·상세 GET과 로컬 시뮬레이션만 구현한다.

| operation | endpoint |
|---|---|
| 생성 | `POST /api/v1/conditional-orders` |
| 목록 | `GET /api/v1/conditional-orders` |
| 상세 | `GET /api/v1/conditional-orders/{id}` |
| 수정 | `POST /api/v1/conditional-orders/{id}/modify` |
| 취소 | `DELETE /api/v1/conditional-orders/{id}` |

타입:

- SINGLE: 한 조건
- OCO: 두 조건 동시 감시, 하나 충족 시 다른 조건 취소
- OTO: 첫 조건 체결 후 둘째 조건 감시

규칙:

- OCO/OTO는 LIMIT만 지원
- `expireDate` 필수
- SINGLE은 second 없음, OCO/OTO는 second 필수
- OCO/OTO는 종목당 그룹 조건주문 1개 제한 가능
- 수정은 전체 재설정이므로 유지할 조건도 다시 보냄
- 조건주문 목록은 다른 채널에서 만든 항목도 포함

조건주문 생성·수정·취소, 자동 감시, trigger는 코드에 포함하지 않는다.

## 10. 제품 simulation 계약

`my_wts`는 제출용 preview를 만들지 않고 요청마다 계산 결과만 반환한다.

```text
kind = SIMULATION_ONLY
symbol / name / market
side / orderType / timeInForce
quantity xor orderAmount
price
estimatedOrderAmount
currency
estimatedCommission
estimatedCashAmount / cashDirection
taxIncluded = false
fxApplied = false
calculationPrice / referencePriceAsOf
buyingPower or sellableQuantity
warnings
submitted = false
persisted = false
```

simulation ID, confirmation text, 만료, consume, submit 단계는 없다.

시뮬레이션 validator는 가격·수량 원문을 반올림하거나 절삭하지 않는다. 결과는 항상 `SIMULATION_ONLY`, `submitted=false`, `persisted=false`이며 실제 제출·저장은 없다.

계산 통화는 주문 시장의 native currency(`KR`은 `KRW`, `US`는 `USD`)이며 환율을 적용하지 않는다. `fxApplied=false`이고 서로 다른 통화의 입력은 거부한다. 수량 LIMIT의 계산 가격은 검증된 지정가이고, 수량 MARKET은 같은 simulation operation에서 server-side `PriceResponse.lastPrice`로 조회한 양수 decimal과 그 `timestamp`를 사용한다. 브라우저는 reference price, 조회 시각, 계산 기준일 또는 commission rule을 전달할 수 없다. 금액 MARKET은 `orderAmount` 자체가 gross 기준이며 예상 수량을 만들지 않는다.

수량 주문의 `estimatedOrderAmount`는 `calculationPrice × quantity`, 금액 주문은 `orderAmount`다. `commissionRate`는 퍼센트 단위이므로 `estimatedCommission = estimatedOrderAmount × commissionRate ÷ 100`으로 계산한다. 수수료 rule은 trusted KST 계산 기준일에 `marketCountry`와 적용 기간이 일치하는 정확히 한 건이어야 하며 `startDate`/`endDate`의 null은 해당 방향 제한이 없다는 뜻이다. 기간 경계는 inclusive이고 0건 또는 중복은 안전하게 실패한다.

BUY는 `estimatedCashAmount = estimatedOrderAmount + estimatedCommission`, `cashDirection=OUTFLOW`이다. SELL은 `estimatedCashAmount = estimatedOrderAmount - estimatedCommission`, `cashDirection=INFLOW`이며 세금 차감 전 예상 수령액이다. 세금은 추정하지 않고 `taxIncluded=false`이며 `estimatedTax`를 생성하지 않는다.

모든 계산은 충분한 precision의 Decimal exact arithmetic을 사용하고 중간값과 최종값을 반올림·절삭하지 않는다. 출력은 scientific notation이 아닌 canonical plain decimal이며 불필요한 trailing zero를 제거한다. 최종 decimal 문자열이 30자를 넘으면 값을 보정하지 않고 실패한다. MARKET reference price 또는 적용 commission rule이 없거나 malformed/통화 불일치이면 부분 숫자 결과를 반환하지 않는다.
