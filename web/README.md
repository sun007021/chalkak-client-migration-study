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

개발 서버는 `/api/v1/admin/**` 외에는 CORS를 열지 않는다. 그래서 브라우저는 항상 **같은 출처의 `/api/v1/`** 로 요청하고, Vite dev·preview 서버가 `PROXY_TARGET`으로 넘긴다.

- `VITE_API_BASE_URL`: 브라우저가 쓰는 기준 주소. 기본 `/api/v1/`(같은 출처 상대 경로). 절대 주소를 쓰면 `https://`만 허용한다(REQ-NET-001). 값이 없거나 잘못되면 요청을 보내지 않고 설정 오류를 보인다(REQ-NET-002).
- `PROXY_TARGET`: 프록시가 넘길 실제 서버. mock 서버로 돌릴 때 이 값만 바꾼다(REQ-NET-004).

## 구조

```text
src/
├── app/            조립(composition root), 라우팅, 전역 Provider
├── core/
│   ├── config/     빌드 설정 읽기·검증
│   ├── net/        HttpClient, ApiError, 재시도·타임아웃, 401 갱신
│   ├── time/       Clock, KST 날짜 계산·표시
│   ├── auth/       세션 저장소(Q-03), SessionManager
│   ├── ui/         토스트, 공통 상태 화면(loading/empty/error)
│   └── state/      ViewModel 기반 클래스, useViewModel 훅
├── features/<영역>/  api.ts(DTO·요청), <화면>ViewModel.ts, <화면>Screen.tsx, 테스트
├── copy/ko.ts      사용자 문구(공용 shared/copy/ko.json이 생기면 그 값과 대조)
└── constants.ts    00-overview §6 공통 상수
```

## 규칙(테스트하기 쉬운 코드, strategy §2)

- **화면은 그리기만 한다.** 상태 전이·분기는 `ViewModel`(React 없는 TS 클래스)에 두고 단위 테스트한다. 화면은 `useViewModel(vm)`으로 스냅샷을 구독한다.
- **의존성은 생성자 주입.** `HttpClient`, `SessionStore`, `Clock`, `IdGenerator`, `AnalyticsTracker`, `SocialLoginClient`, 이미지 인코더는 인터페이스이고 테스트는 Fake를 쓴다. 조립은 `app/container.ts` 한 곳에서만 한다.
- **시간은 `Clock`으로.** `Date.now()`, `setTimeout`을 직접 부르지 않는다(테스트는 가짜 시계 또는 `vi.useFakeTimers`).
- **서버 오류는 `errorCode` + HTTP 상태 + 호출 API로만 분기**(D-02). `message`는 표시용.
- **testID**: 모든 상호작용 요소에 [testids.md](../docs/testing/testids.md)의 `data-testid`. 상태는 `aria-checked`/`aria-selected`/`disabled`로 노출하고, 상태 표시 요소는 숨기지 말고 DOM에서 뺀다.
- **문구·상수 하드코딩 금지.** `copy/ko.ts`, `constants.ts`에서 가져온다.
- **테스트 이름에 TC ID**: `it('TC-NET-003 ...')`. 한 테스트가 여러 TC를 덮으면 `it('TC-NET-003 TC-NET-004 ...')`.
- 네트워크 계약 테스트는 MSW로 요청 경로·메서드·헤더·바디를 확인한다.

## Web에서 다른 점

| 항목 | Web 동작 | 근거 |
| --- | --- | --- |
| 강제 업데이트 | 게이트 없음 | D-15, REQ-BOOT-013 |
| 푸시 | 수신·기기 등록 없음. 알림함은 제공 | Q-04, REQ-PUSH-017 |
| 토큰 보관 | access는 메모리, refresh·userId·만료 시각은 IndexedDB(임시안). XSS 시 refresh token 탈취 위험이 있다 | Q-03, REQ-AUTH-024 |
| 카카오 로그인 | 서버가 카카오 ID 토큰 aud를 앱 키 하나와만 비교해 웹 키 토큰이 거절될 수 있다. 로그인 코드는 `SocialLoginClient` 뒤에 두고 Fake로 검증 | Q-02 |
| 약관 문서 | 새 탭 | D-25 |
| 카메라 | 카메라 없는 기기·데스크톱은 버튼 숨김 | D-14 |
