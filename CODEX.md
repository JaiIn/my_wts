# CODEX 실행 규칙

이 문서는 이 프로젝트를 수행하는 모든 AI coding agent의 최우선 작업 계약이다. 충돌 시 안전한 규칙을 우선한다.

## 0. 프로젝트 경계

```text
목표: 로컬 전용 WTS형 웹 애플리케이션
프로젝트명: my_wts
GitHub: https://github.com/JaiIn/my_wts
로컬 경로: C:\Users\admin\Desktop\my_wts
확정 framework: Next.js 16 App Router + React 19 + TypeScript 7
확정 runtime: Node.js 24 LTS
확정 package manager: pnpm 11
Backend: Next.js Route Handlers, Node runtime
대안 framework: 없음. 변경은 ADR과 사용자 승인 필요
배포: 하지 않음
외부 공개: 하지 않음
실행 주소: 127.0.0.1만 허용
```

다음은 요청 범위가 아니다.

- 클라우드·서버 배포
- 공개 도메인·HTTPS 인증서·CDN
- 모바일 앱
- 외부 사용자·조직·관리자 역할을 위한 인증/권한 시스템
- 실제 매수·매도·정정·취소, HFT, 자동매매, 무인 주문
- 웹소켓 기반 실시간 스트리밍(공식 문서상 추후 지원 예정)

기술 선택의 전체 기준은 `docs/14_TECH_STACK_DECISION.md`를 따른다.

## 1. Micro Stage 단일 작업 규칙

1. 한 번에 `docs/07_DETAILED_MICRO_WBS.md`의 Micro Stage 하나만 수행한다.
2. 작업 시작 전 stage ID, 목표, 허용 파일, 금지 작업, 검증 명령을 제시한다.
3. stage 범위를 넘는 리팩터링·의존성 추가·파일 이동을 하지 않는다.
4. 완료 후 테스트 결과, 변경 파일, 알려진 제약, 체크리스트를 제시한다.
5. `docs/08_STAGE_GATE_AND_CHECKLISTS.md` 형식으로 채팅 완료 보고를 한다. 보고서 파일은 만들지 않는다.
6. 다음 stage를 자동 시작하지 않는다.
7. 사용자에게 다음 stage 진행 명령을 요청하고 대기한다.

## 1.1 환경파일 우선 규칙

- Next.js skeleton 생성 직후 `.env.example`과 `.env.local`을 먼저 만든다.
- `.env.example`은 Git에 포함하고 `.env.local`은 반드시 제외한다.
- 초기 `.env.local`의 client ID와 secret은 빈 값으로 둔다. accountSeq 환경변수는 만들지 않는다.
- live 조회 flag는 false로 둔다.
- 실제 client ID/secret 입력은 MS-04.01에서만 요청한다.
- 환경파일 구조를 먼저 만드는 것은 자격증명을 미리 요청한다는 뜻이 아니다.

## 2. 사용자 확인이 필요한 정지 지점

다음 상황에서는 즉시 멈추고 정확히 필요한 정보만 요청한다.

- 새 의존성 도입이 구조에 영향을 주는 경우
- 실제 Toss API 호출을 처음 수행하기 직전
- `client_id`/`client_secret`이 실제로 필요한 시점
- `accountSeq` 선택이 필요한 시점
- 회원가입·로그인 계약을 바꾸어야 하는 경우
- 공식 문서와 구현이 충돌하는 경우
- 테스트가 실패하고 수정 범위가 stage를 넘는 경우
- stage 완료 후 commit+push 또는 milestone PR+merge를 수행하기 직전

자격증명을 미리 요청하지 않는다. 임의 값, 예시 값, 추측한 계좌번호로 live 호출하지 않는다.

## 3. 인증정보 취급

- `client_secret`, access token, 계좌번호, `accountSeq`를 채팅·코드·로그·스크린샷·테스트 fixture에 기록하지 않는다.
- 사용자가 채팅에 secret을 붙여넣도록 유도하지 않는다.
- 로컬 `.env.local`에 사용자가 직접 입력하도록 안내한다.
- `.env.local`, `.env.*.local`, token cache, DB, raw log는 Git에서 제외한다.
- `NEXT_PUBLIC_*`, `VITE_*`에 비밀정보를 넣지 않는다.
- 토큰 발급과 API 호출은 서버 전용 모듈에서만 수행한다.
- 토큰 응답 본문이나 Authorization 헤더를 로깅하지 않는다.
- refresh token은 없으며 만료 시 재발급한다.
- client당 유효 토큰은 하나이므로 불필요한 재발급을 금지한다. 재발급하면 기존 토큰은 즉시 무효화된다.

## 4. 계층 분리

UI에서 허용:

- 화면 렌더링
- 사용자 입력 수집
- 로컬 BFF 호출
- 상태·오류·확인 화면 표시

UI에서 금지:

- Toss API 직접 호출
- secret/token 접근
- 주문 검증의 단독 수행
- 주문 요청의 자동 실행

서버 계층은 다음 순서를 지킨다.

```text
Route Handler → Application Service → Domain Validator/Policy
             → Toss Client → Toss Open API
```

API DTO와 화면 ViewModel을 분리한다. 금액·가격·수량은 JavaScript `number`로 계산하지 말고 원문 decimal string 또는 decimal 라이브러리를 사용한다.

## 5. 실제 주문 영구 금지

- Toss의 주문 생성·정정·취소와 조건주문 생성·정정·취소 client를 만들지 않는다.
- BFF에는 위 mutation route를 노출하지 않는다.
- UI에는 실제 제출·정정·취소 버튼을 만들지 않는다.
- 주문 화면은 로컬 계산과 미리보기만 수행하며 Toss mutation HTTP 요청은 항상 0회다.
- 환경변수에 실제 주문 활성화 flag를 만들지 않는다.
- AI, 자동화, 타이머, 새로고침 이벤트가 주문을 실행할 수 있는 함수 자체를 제공하지 않는다.

## 6. 테스트 규칙

- 기본 테스트는 mock/fixture만 사용한다.
- live test는 별도 명령과 별도 태그로 격리한다.
- 외부 주문 mutation API용 client·contract·live test를 만들지 않는다.
- 주문 시뮬레이터는 순수 계산·component·E2E 테스트만 수행한다.
- 테스트는 토큰, 계좌번호, secret, 개인정보를 출력하지 않는다.
- unknown enum/error code를 허용하는 forward-compatible decoder를 검증한다.
- 429, 401, 403, 409, 422, 5xx의 동작을 검증한다.
- Micro Stage마다 전체 테스트를 돌리지 않는다. 변경 영향 범위의 빠른 테스트만 실행한다.
- 전체 unit/contract/E2E는 milestone 끝과 최종 인수 시 실행한다.
- 테스트 시간이 길어지면 무조건 기다리기보다 slow test를 식별·분리·개선한다.

## 7. Git 규칙

- milestone별 branch 하나를 사용하고 Micro Stage마다 commit 하나를 만든다.
- unrelated change를 포함하지 않는다.
- stage 완료 시 빠른 검사만 통과하면 된다. 전체 suite는 milestone gate에서 실행한다.
- 사용자의 한 번의 승인으로 해당 stage의 commit과 push를 연속 수행할 수 있다.
- commit, push, merge를 각각 별도 Micro Stage로 만들지 않는다.
- PR과 merge는 milestone 끝에 한 번만 수행한다.
- `main` 직접 작업, force push, reset --hard는 금지한다.

## 7.1 과잉 절차 금지

- 안전 문서·테스트 infrastructure만 여러 주 동안 만드는 것을 금지한다.
- 최소 보안 기반을 만든 뒤 곧바로 눈에 보이는 read-only 기능의 수직 slice를 구현한다.
- 같은 위험을 여러 중복 preflight/hardening 단계로 반복 검증하지 않는다.
- 정책·추상화·wrapper는 실제 실패 사례나 명확한 요구가 있을 때만 추가한다.
- 소규모 로컬 프로젝트에 외부 tenant, 배포, 엔터프라이즈 승인 체계를 만들지 않는다.

## 7.2 역할별 작업

`docs/13_ROLE_BASED_DEVELOPMENT_GUIDES.md`에서 현재 stage에 맞는 역할을 선택한다. 역할은 파일·책임 범위를 정하는 장치이며 별도 branch, 별도 승인, 별도 Micro Stage를 추가하는 장치가 아니다.

## 7.3 문서 동결

M00 개발 시작 이후 다음 경로는 읽기 전용이다.

```text
README.md
CODEX.md
docs/**
references/**
specs/**
templates/**
```

- stage 완료 보고는 채팅에서만 한다.
- Markdown 보고서, 별도 후속 작업 파일, 새로운 설계 문서를 만들지 않는다.
- 기능 개발 명령은 문서 변경 권한을 포함하지 않는다.
- 문서와 구현이 충돌하면 구현을 중단한다.
- 사용자가 `문서 변경 승인`을 명시하기 전에는 frozen path를 수정하지 않는다.
- 전체 절차는 `docs/21_DOCUMENTATION_FREEZE_POLICY.md`를 따른다.

## 8. 완료 정의

코드 작성만으로 완료가 아니다. 아래가 모두 충족되어야 한다.

- stage acceptance criteria 충족
- 테스트 통과
- 민감정보 미포함 확인
- 변경 파일과 의도 설명
- 남은 위험·제약 기록
- 완료 체크리스트 작성
- 사용자 승인 대기 상태로 전환
