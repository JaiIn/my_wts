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
- `timeInForce`: 기본 `DAY`, 미국 LIMIT + `CLS`는 LOC

### 금액 기반

- 미국 시장가 전용
- `orderAmount` 필수
- 정규장에만 접수
- 금액은 고정되고 체결 수량이 변동

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
estimatedNotional
currency
commissionEstimate
buyingPower or sellableQuantity
warnings
submitted = false
persisted = false
```

simulation ID, confirmation text, 만료, consume, submit 단계는 없다.
