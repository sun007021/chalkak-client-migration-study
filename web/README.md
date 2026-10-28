# 찰캌 Web

모바일 브라우저(웹뷰 포함)용 찰캌 클라이언트. 동작 기준은 [`docs/spec`](../docs/spec/00-overview.md)이고, 테스트 목록은 [`docs/testing/catalog`](../docs/testing/catalog/)의 `TC-` ID를 따른다.

## 실행

```bash
npm ci
cp .env.example .env.local   # 필요하면 PROXY_TARGET 수정
npm run dev                  # http://localhost:5173
npm test                     # Vitest(U·C·W)
npm run lint && npm run typecheck
npm run e2e                  # Playwright(E). 빌드 후 preview 서버로 돈다
```

## 서버 연결(Q-01)

개발 서버는 `/api/v1/admin/**` 외에는 CORS를 열지 않는다. 그래서 브라우저는 기본적으로 **현재 페이지와 같은 출처의 `/api/v1/`** 로 요청하고, Vite dev·preview 서버가 `PROXY_TARGET`으로 넘긴다.

- `VITE_API_BASE_URL`: **서버 origin만**(경로 없음) 적고 앱이 `/api/v1`을 붙인다(REQ-NET-003). 허용은 `https://`와 loopback(`localhost`, `127.0.0.1`)의 `http://`뿐이고 그 밖의 http·경로 포함·잘못된 값은 요청을 보내지 않고 설정 오류를 보인다(REQ-NET-001/002). presigned 업로드 URL도 같은 규칙이다. Web 특례: 비어 있거나 `same-origin`이면 현재 페이지 출처를 쓰고(Vite 프록시 경유) 그 뒤에 `/api/v1`을 붙인다. 기본값은 비움.
- `PROXY_TARGET`: 프록시가 넘길 실제 서버. mock 서버로 돌릴 때 이 값만 바꾼다(REQ-NET-004).

## 구조

```text
src/
├── app/            조립(composition root), 라우팅, 전역 Provider (`app/container.ts`)
├── core/
│   ├── config/     빌드 설정 읽기·검증
│   ├── net/        ApiClient, HttpTransport, ApiError, 재시도·타임아웃, 401 갱신(AuthCoordinator)
│   ├── time/       Clock, KST 날짜 계산·표시
│   ├── auth/       SessionStore 인터페이스, RefreshLock(Web Locks), `IndexedDbSessionStore`(Q-03), `SessionEvents`, `UserCaches`
│   ├── ui/         토스트, 공통 상태 화면(loading/empty/error)
│   ├── analytics/  AnalyticsReporter, 라우트 기반 screen_view
│   └── state/      ViewModel 기반 클래스, useViewModel 훅
├── features/<영역>/  api.ts(DTO·요청), <화면>ViewModel.ts, <화면>Screen.tsx, 테스트
├── copy/ko.ts      사용자 문구(공용 shared/copy/ko.json이 생기면 그 값과 대조)
└── constants.ts    00-overview §6 공통 상수
```

## 규칙(테스트하기 쉬운 코드, strategy §2)

- **화면은 그리기만 한다.** 상태 전이·분기는 `ViewModel`(React 없는 TS 클래스)에 두고 단위 테스트한다. 화면은 `useViewModel(vm)`으로 스냅샷을 구독한다.
- **의존성은 생성자 주입.** `SessionStore`, `RefreshLock`, `Clock`, `IdGenerator`, `AnalyticsTracker`, `Logger`는 인터페이스이고 테스트는 Fake를 쓴다. `SocialLoginClient`, 이미지 인코더(예정)도 같다. 조립(`ApiBaseUrl` 검증 포함)은 `app/container.ts` 한 곳에서만 한다.
- **시간은 `Clock`으로.** `Date.now()`, `setTimeout`을 직접 부르지 않는다(테스트는 가짜 시계 또는 `vi.useFakeTimers`).
- **서버 오류는 `errorCode` + HTTP 상태 + 호출 API로만 분기**(D-02). `message`는 표시용.
- **testID**: 모든 상호작용 요소에 [testids.md](../docs/testing/testids.md)의 `data-testid`. 상태는 `aria-checked`/`aria-selected`/`disabled`로 노출하고, 상태 표시 요소는 숨기지 말고 DOM에서 뺀다.
- **문구·상수 하드코딩 금지.** `copy/ko.ts`, `constants.ts`에서 가져온다.
- **테스트 이름에 TC ID**: `it('TC-NET-003 ...')`. 한 테스트가 여러 TC를 덮으면 `it('TC-NET-003 TC-NET-004 ...')`.
- 네트워크 계약 테스트는 `src/test/fakeFetch.ts`의 `FakeFetch`로 요청 경로·메서드·헤더·바디·signal을 확인한다(가짜 시계와 같이 써도 타이머 간섭이 없다). 응답 본문은 `shared/fixtures`를 `src/test/fixtures.ts`의 `loadFixture(path)`로 읽는다.
- 상수·문구는 `shared/constants.json`, `shared/copy/ko.json`이 기준이다. `constants.test.ts`가 값을 대조하고, `copy/ko.ts`는 JSON을 그대로 import한다(`t(key, params)`가 `{주제}` 같은 자리를 치환).
- Fake·테스트 도구(`FakeClock`, `FakeSessionStore`, `FakeAnalyticsTracker`, `RecordingLogger`, `withTimeZone`)는 `src/test/`에 둔다. 프로덕션 코드는 import하지 않는다.

## 화면 추적(분석)

두 경로가 서로 겹치지 않게 나눈다.

- **전역 경로 추적**: `RouteScreenViewTracker`가 Router 안에서 pathname이 바뀔 때마다 `screen_view`를 보낸다(쿼리·해시만 바뀌면 보내지 않고, 다른 화면에 갔다 돌아오면 다시 보낸다). **탭이 아닌 화면**(`/login`, `/signup/terms` 등)만 해당하고 `screenNameForPath`가 그 목록이다.
- **탭 4개(홈·전시·기록·설정)**: 전역 추적에서 뺐다. 보호(RequireSession)와 접근 게이트(`TabGate`, `canEnterTab`)를 통과해 **실제로 그려진 탭 화면**이 `useScreenView(name)`로 보낸다. 그래서 세션 없이 `/display`로 들어오거나 게스트가 `/record`로 들어와 리다이렉트되는 경우에는 그 화면의 `screen_view`가 나가지 않는다.
- 라우트가 아닌 화면(시트·모달 등 별도 `screen_name`이 있는 것)도 `useScreenView`를 쓴다. 한 화면을 두 경로로 보내면 중복 전송이다.

## Web에서 다른 점

| 항목 | Web 동작 | 근거 |
| --- | --- | --- |
| 강제 업데이트 | 게이트 없음 | D-15, REQ-BOOT-013 |
| 푸시 | 수신·기기 등록 없음. 알림함은 제공 | Q-04, REQ-PUSH-017 |
| 토큰 보관 | access는 메모리, refresh·userId·만료 시각은 IndexedDB(임시안). XSS 시 refresh token 탈취 위험이 있다 | Q-03, REQ-AUTH-024 |
| 카카오 로그인 | 서버가 카카오 ID 토큰 aud를 앱 키 하나와만 비교해 웹 키 토큰이 거절될 수 있다. 로그인 코드는 `SocialLoginClient` 뒤에 두고 Fake로 검증한다. 실제 구현 `KakaoWebLoginClient`는 OIDC 인가 리다이렉트(nonce=SHA-256(rawNonce) hex, state)이고 rawNonce·state는 리다이렉트 사이 `sessionStorage`에 두었다가 콜백에서 1회 쓰고 지운다. 인가 코드→ID 토큰 교환(`KakaoTokenEndpointExchanger`)은 `https://kauth.kakao.com/oauth/token`에 `grant_type=authorization_code, client_id(VITE_KAKAO_CLIENT_ID), redirect_uri, code`를 form POST하며 키가 없으면 `SocialLoginConfigError`다. **브라우저 CORS·서버 aud 수용 여부는 아직 실제로 검증하지 않았다(Q-02, E2E에서 확인).** **개발 서버 E2E는 카카오 로그인 대신 아래 개발용 세션 주입을 쓴다** | Q-02 |
| 개발용 세션 주입 | 개발 빌드(`import.meta.env.DEV`) 또는 `VITE_ENABLE_DEV_SESSION=true`에서만 `/dev/session` 라우트와 로그인 화면의 우회 버튼이 있다(조건은 `vite.config.ts`의 `define`이 만든 정적 상수 `DEV_SESSION_ENABLED` 하나이고, 꺼진 빌드에서는 화면·서비스가 번들에서 빠진다. `dist`에서 `grep -rE "Dev session|dev-bypass|/dev/session|DevSession"`가 비어야 한다). 개발 서버에서 얻은 refresh token과 userId를 붙여 넣으면 `POST /auth/refresh`로 토큰을 받아 저장하고 홈으로 간다. 프로덕션 빌드에는 라우트가 없다 | Q-02 |
| 사인·사진 업로드(개발) | presigned PUT은 버킷 CORS 때문에 브라우저에서 막힐 수 있어, `npm run dev`(또는 `VITE_UPLOAD_PROXY=true` 빌드)에서는 같은 출처 `/__upload-proxy/<S3 호스트>/<경로>?<쿼리>`로 보내고 `vite/uploadProxyPlugin.ts`가 Host를 원래 S3 호스트로 맞춰 중계한다(서명 유지). 대상은 amazonaws.com·loopback(+`UPLOAD_PROXY_ALLOWED_HOSTS`)만. 배포 빌드는 S3로 직접 보낸다 | W4 |
| 약관 문서 | 새 탭 | D-25 |
| 네트워크 타임아웃 | fetch는 연결/응답 분리 불가 → 응답 15초(헤더+본문 수신 포함) 하나로 적용. `HTTP_CONNECT_TIMEOUT_MS`는 shared 값과 대조용으로만 둔다 | D-21 |
| refresh 동시성 | 탭이 여러 개라 메모리 single-flight로는 부족 → Web Locks(`chalkak-auth-refresh`) 안에서 재읽기→refresh→비교 후 쓰기. 미지원이면 탭 안 뮤텍스 | D-17 |
| Retry-After 상한 | `RETRY_AFTER_MAX_MS`(30초, shared 상수) 초과는 기다리지 않고 실패 | D-21(임시) |
| 카메라 | 카메라 없는 기기·데스크톱은 버튼 숨김 | D-14 |
