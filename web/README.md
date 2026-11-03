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
| 사인·사진 업로드(개발) | presigned PUT은 버킷 CORS 때문에 브라우저에서 막힐 수 있어, `npm run dev`(또는 `VITE_UPLOAD_PROXY=true` 빌드, 이때만 preview에도 붙는다)에서는 같은 출처 `/__upload-proxy/<S3 호스트>/<경로>?<쿼리>`로 보내고 `vite/uploadProxyPlugin.ts`가 Host를 원래 S3 호스트로 맞춰 중계한다(서명 유지). PUT·OPTIONS만 받고 대상은 amazonaws.com·loopback http(`UPLOAD_PROXY_ALLOWED_LOOPBACK_PORTS`, 기본 4010)·`UPLOAD_PROXY_ALLOWED_HOSTS`만. 기본 배포 빌드는 코드·접두 모두 빠지고 S3로 직접 보낸다 | W4 |
| 약관 문서 | 새 탭 | D-25 |
| 네트워크 타임아웃 | fetch는 연결/응답 분리 불가 → 응답 15초(헤더+본문 수신 포함) 하나로 적용. `HTTP_CONNECT_TIMEOUT_MS`는 shared 값과 대조용으로만 둔다 | D-21 |
| refresh 동시성 | 탭이 여러 개라 메모리 single-flight로는 부족 → Web Locks(`chalkak-auth-refresh`) 안에서 재읽기→refresh→비교 후 쓰기. 미지원이면 탭 안 뮤텍스 | D-17 |
| Retry-After 상한 | `RETRY_AFTER_MAX_MS`(30초, shared 상수) 초과는 기다리지 않고 실패 | D-21(임시) |
| 카메라 | 카메라 없는 기기·데스크톱은 버튼 숨김 | D-14 |

## 사진 업로드(W7a) 구현 메모

- **흐름**: `UploadGate`(+ 버튼·홈 히어로 공용, `container.uploadEntry`) → `/upload`(state `{topicDate}`, 탭 셸 밖) → `/upload/success`(업로드 화면을 replace) → "확인했어요."는 `/display?date=…&sort=recent`로 replace. 결과는 `container.uploadResults`(메모리, 계정 전환 때 비움).
- **이미지 파이프라인**: 포트(`imagePorts.ts`) 뒤에 브라우저 구현을 둔다. `BrowserImageDecoder`(`<img>`로 EXIF가 반영된 크기만 읽고 `createImageBitmap(from-image, resizeWidth/Height)`로 목표 크기만 디코드. 지원하지 않으면 `<img>` + canvas), `CanvasWebpCompressor`(`OffscreenCanvas.convertToBlob`, 없으면 `canvas.toBlob`, `image/webp`만), `BrowserWebpCompressor`(canvas 지원을 확인해(성공만 기억) `selectWebpBackend`로 canvas → WASM 선택), `IdentityEditRenderer`(W7b 전 기본값). 실제 canvas 검증은 jsdom이 아니라 `e2e/upload-encoder.spec.ts`(Chromium)가 한다. 이 테스트는 `e2e/fixtures/encoderEntry.ts`를 vite로 따로 묶어 페이지에 주입하므로 앱 번들에는 테스트 코드가 들어가지 않는다.
- **canvas WebP의 ICCP**: Chromium의 canvas WebP는 항상 sRGB `ICCP` 청크를 넣는다. 업로드 사진은 메타데이터가 없어야 하므로(`inspectWebp`가 ICCP·EXIF·XMP를 거절) `CanvasWebpCompressor`가 `stripWebpMetadata`로 청크와 VP8X 플래그를 지운다(canvas는 sRGB로 그리므로 색은 변하지 않는다).
- **PNG/JPEG 폴백 금지**: WebP를 만들 수 없는 환경(canvas가 다른 형식을 돌려주는 Safari 등)에서는 `WebpUnsupportedError` → 준비 실패(`upload.error.prepare`)다. `noFallbackFormat.test.ts`가 소스에 다른 형식 문자열이 없는지 정적으로 본다.
- **카메라**: `<input type="file" accept="image/*" capture>`. `capture` 속성 지원 + 터치 기기(`maxTouchPoints > 0` 또는 `pointer: coarse`)일 때만 버튼을 보인다(`detectCameraCapture`). 촬영본은 사진 선택과 똑같이 다루고 기기 앨범에 저장하지 않는다.
- **사진 PUT 재시도**: `PresignedUploader.put({ retry: true })`가 D-21 재시도(0.5초, 1초, 최대 2회)를 탄다. 사인 업로드는 기본값(재시도 없음) 그대로다.
- **PostChange `created`**: 홈 히어로를 곧바로 갱신하고(VALIDATING → 처리 중, PENDING → 검수 대기 사진) 전시는 그 날짜의 낡은 목록 캐시를 버린 뒤 지금 보는 날짜면 조용히 첫 페이지만 다시 받는다.

- **WASM WebP 대체(Safari 등)**: `JsquashWebpEncoder`(`WasmWebpEncoder.ts`)가 `@jsquash/webp@1.5.0`(libwebp를 emscripten WASM으로 빌드, **Apache-2.0**)을 쓴다. canvas가 `image/webp`를 못 만들 때만 첫 압축에서 **동적 import**로 받으므로 canvas가 되는 브라우저는 내려받지 않는다(빌드 산출물: JS 약 20kB 두 개 + WASM `webp_enc` 281kB(gzip 116kB)·`webp_enc_simd` 346kB(gzip 129kB), 실행 시 SIMD 지원 여부로 하나만 받는다. 메인 번들에는 1kB 남짓). 모듈·WASM을 받거나 초기화하지 못하면 `WebpUnsupportedError` → 준비 실패이고 PNG/JPEG로 대신하지 않는다(초기화 성공만 기억해 일시 실패 뒤 다시 시도한다). `e2e/upload-encoder.spec.ts`가 `convertToBlob`·`toBlob`이 PNG를 돌려주도록 덮어써 이 경로(RIFF/WEBP, 메타데이터 청크 없음, 크기 상한, 로드 실패)를 Chromium에서 확인한다.
- **크기 확인(`decoder.probe`)**: 사진을 고른 직후 `inspect`는 전체 해상도 디코드 대신 `<img>`의 `naturalWidth/Height`(EXIF 방향 반영)와 `decode()` 성공만 본다. `createImageBitmap`을 못 쓰는 브라우저의 대체 경로(`<img>` 전체 디코드 후 canvas)는 **1억 화소**(`MAX_FALLBACK_PIXELS`, RGBA 약 400MB — 모바일 탭이 죽는 경계)를 넘으면 디코드 실패로 처리한다. `createImageBitmap` 오류는 옵션 미지원(`TypeError`·`RangeError`·`NotSupportedError`)이면 대체 경로로 가고, 디코드 실패는 그대로 `ImageDecodeError`다.
- **PUT 거절 뒤 파일 재사용(REQ-UPL-059)**: S3 PUT이 4xx/5xx로 거절되면 정책(uploadId·URL)만 버리고 인코딩한 파일은 남긴다. 같은 사진·편집값으로 다시 제출하면 새 정책을 받고 새 `maxBytes`가 파일 크기 이상이면 디코드·인코딩 없이 그 파일을 새 uploadId로 PUT한다(작으면 원본에서 다시 인코딩). 새 사진·다른 편집값·POST 404/400 판정 뒤에는 파일도 버린다.
- **제출 중 사진 선택**: `submit()`은 진행 중인 사진 검사(`select` 슬롯)를 먼저 취소하고, 늦게 끝난 검사 결과도 `submitting`이면 버린다(제출하는 사진이 바뀌지 않는다).
- **세션 전환**: 계정 전환·갱신으로 `SessionChangedError`가 나면 정책 발급·`ensureFresh`·복구 확인·400 판정 모두 문구 없이 `cancelled`다(`isAbandoned`).
- **개발 빌드만 loopback http**: 업로드 URL 검증의 `http://localhost` 허용은 `__UPLOAD_PROXY_ENABLED__`(개발·preview 프록시 빌드)일 때만이다. 배포 빌드는 https만 받는다.
- **알려진 한계(PUT 재시도와 정책 만료 경계)**: PUT 재시도(최대 2회)와 정책 수명(`expiresInSeconds − 5초`)은 서로 모른다. 만료 직전에 시작한 PUT이 재시도 대기 중에 만료되면 S3가 403을 주고 위 규칙대로 새 정책으로 다시 제출해야 한다(자동 재발급은 하지 않는다).
- **VM 분리를 미룬 이유**: `UploadViewModel`의 `PreparationSession`·`classifyCreateFailure` 분리는 준비 상태(`prep`·`prepared`·`reusable`·세대)가 제출 흐름 전체와 얽혀 있어 이번 리뷰 항목 변경 위에서 함께 옮기면 회귀 위험이 크다고 보고 하지 않았다.

### TODO(W7a 이후)

- 앨범·카메라 버튼의 보이는 문구와 접근성 이름: `shared/copy/ko.json`에 키가 없어 지금은 아이콘 + 각 `<input>`의 `aria-label`(`copy/webOnly.ts`의 `upload.album.a11y`·`upload.camera.a11y`), 미리보기·성공 화면 사진 이름도 같은 파일의 Web 전용 문구다. shared에 키가 생기면 옮긴다.
- 편집기: `container.photoEditor`가 null이면 고른 사진을 편집하지 않은 값으로 바로 확정한다(W7b에서 기본값이 실제 편집기로 바뀌었다. 아래 W7b 메모).
- 실서버·실기기 확인(S3 PUT CORS, 실제 사진 EXIF 1~8, HEIC, 오프라인 제출): E2E/A 계층.

## 사진 편집기(W7b) 구현 메모

- **구성**: `features/upload/editor/`. 순수 연산(`adjustments`, `filters`, `colorPipeline`, `autoAdjust`, `cropGeometry`, `normalizeEdit`, `rulerScale`)은 `Uint8ClampedArray` RGBA를 제자리에서 바꾸고 상수는 `editConstants()` 한 곳이 근거다(shared/photo-edit이 생기면 대조 테스트를 더한다). `PhotoEditorViewModel`이 상태·미리보기·썸네일·자동 보정 분석을 맡고 `PhotoEditorScreen`은 그리기만 한다.
- **조립**: `createAppContainer`가 `photoEditor`를 생략하면 실제 편집기(`createPhotoEditor`), `null`이면 편집기 없음. `pixelSurface`(기본 `createCanvasPixelSurface`)를 `CanvasEditRenderer`(업로드 준비)·`CanvasPreviewRenderer`(미리보기·썸네일, blob URL)·`CanvasAutoAnalyzer`가 함께 쓴다.
- **편집 결과는 한 번만 그린다**: 편집기 "완료"는 `normalizeEdit`한 편집값만 넘기고(렌더 없음) 업로드 준비가 `CanvasEditRenderer`로 같은 값을 다시 그려 WebP 한 번으로 인코딩한다. 편집기가 다시 열릴 때 자르기 값은 사용자가 건드리기 전까지 저장값 그대로 둔다(`sameEdit` 유지).
- **미리보기 형식**: 미리보기·썸네일 blob은 화면에만 쓰고 앱 사진 형식 상수(`POST_IMAGE_CONTENT_TYPE`)로 만든다(`noFallbackFormat.test.ts`가 업로드 폴더의 다른 형식 문자열을 금지한다). WebP 인코딩을 못 하는 브라우저는 canvas가 PNG를 주지만 `<img>`로는 문제없다.
- **E2E**: `e2e/photo-edit.spec.ts`는 실제 Chromium canvas에서 회전·자르기·조정·필터 결과 픽셀을 순수 함수 기대값과 ±2 이내로 비교하고 미리보기·분석기·편집기 화면(포인터 끌기)을 확인한다. `upload-encoder.spec.ts`처럼 `e2e/fixtures/editorEntry.ts`를 vite로 따로 묶어 주입하므로 `dist`에는 테스트 코드가 없다.
- **TODO**: 자르기 프레임의 키보드 조작(손잡이는 포인터 전용, 비율·90도 회전 버튼이 대체 수단), 눈금자 모양 슬라이더와 기준값 멈칫(`rulerScale`은 수치 함수만 있고 화면은 `input type=range`), 확대 미리보기, 실기기 시각 비교(TC-EDIT-048~051).
