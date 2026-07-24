# 17. 데이터베이스와 상태 모델

상태: `FROZEN`

## 1. 결정

```text
DB: SQLite
ORM: Drizzle ORM
Driver: better-sqlite3
Path: ./data/my_wts.sqlite3
```

`data/`는 Git에서 제외한다. Canonical DDL은 `specs/sqlite-schema-v1.sql`이다.

## 2. 영구 테이블

### users

| Column | 설명 |
|---|---|
| id | `usr_` prefix UUID, PK |
| username | 표시용 원문 |
| username_normalized | NFKC+lowercase, UNIQUE |
| display_name | 1~40자 |
| password_hash | versioned scrypt 문자열 |
| created_at, updated_at | ISO 8601 |

평문 password는 어떤 시점에도 DB에 저장하지 않는다.

### sessions

| Column | 설명 |
|---|---|
| id | `ses_` prefix UUID, PK |
| user_id | users FK |
| token_hash | SHA-256, UNIQUE |
| selected_account_ref | nullable opaque reference |
| created_at | 생성 |
| last_seen_at | idle expiry 기준 |
| expires_at | absolute expiry |

session token 원문과 accountSeq 원문은 저장하지 않는다.

### app_settings

| Column | 설명 |
|---|---|
| user_id | users FK |
| key | 설정 key |
| value_json | valid JSON |
| updated_at | ISO 8601 |

PK는 `(user_id, key)`다. 허용 key는 `theme`, `default_market_country`, `chart_interval`, `ranking_count`, `polling_enabled`다.

### watchlists

| Column | 설명 |
|---|---|
| id | UUID PK |
| user_id | users FK |
| name | 1~40자 |
| sort_order | 0 이상 |
| is_default | 0/1 |
| created_at, updated_at | ISO 8601 |

사용자별 기본 watchlist는 하나만 허용한다.

### watchlist_items

PK는 `(watchlist_id, symbol, market_country)`다. watchlist 삭제 시 cascade한다.

### audit_events

| Column | 설명 |
|---|---|
| id | AUTOINCREMENT PK |
| user_id_hash | nullable 비가역 hash |
| occurred_at, request_id | 추적 |
| category, operation, outcome | 분류 |
| http_status, duration_ms | 결과 |
| upstream_request_id, entity_hash | nullable |
| metadata_json | redacted JSON |

최근 10,000건 또는 30일 중 먼저 도달하는 기준으로 정리한다.

## 3. 메모리 상태

| 상태 | TTL |
|---|---:|
| Toss access token | `expires_in - 60초` |
| accountRef→accountSeq | process lifetime |
| login failure bucket | 15분 |
| market cache | endpoint별 1~21,600초 |
| rate-limit bucket | process lifetime |

주문·조건주문 simulation 결과는 응답 후 저장하지 않는다.

## 4. 인증 session

- cookie에는 opaque token 원문
- DB에는 SHA-256 token hash
- idle expiry 12시간
- absolute expiry 7일
- last_seen 갱신은 최대 15분에 한 번
- logout 시 session row 삭제
- 만료 session은 앱 시작과 하루 1회 정리

## 5. Account reference

1. Toss account GET 결과의 accountSeq를 server memory에서만 보유
2. random accountRef 생성
3. browser에는 accountRef와 마스킹 정보만 전달
4. 사용자가 선택하면 `sessions.selected_account_ref`에 저장
5. server 재시작으로 map이 사라지면 선택을 무효화
6. logout 시 session과 함께 제거

## 6. Cache TTL

| Data | TTL |
|---|---:|
| current prices/orderbook/trades | 1초 |
| candles 1m | 10초 |
| candles 1d | 300초 |
| stock info/calendar | 6시간 |
| stock warnings | 5분 |
| exchange rate | 60초 |
| rankings | 10초 |
| indicators | 2초 |
| holdings | 5초 |
| order/conditional history | 2초 |
| commissions | 1시간 |

계좌 선택 변경 시 account 관련 cache만 무효화한다.

## 7. Transaction

- signup: user + default watchlist + session 단일 transaction
- login: 기존 동일 browser session 폐기 후 새 session 생성
- logout: 현재 session 삭제
- watchlist 변경: 단일 transaction
- 외부 HTTP 중 DB transaction 유지 금지

## 8. Migration·backup

첫 migration은 `drizzle/0000_initial.sql`이다. 개발 중 문서와 DDL을 바꾸지 않는다.

앱 종료 후 backup:

```powershell
Copy-Item .\data\my_wts.sqlite3 .\backup\my_wts-YYYYMMDD-HHmmss.sqlite3
```

reset은 DB를 backup/휴지통으로 옮긴 뒤 다시 실행한다. 자동 삭제 script는 제공하지 않는다.

