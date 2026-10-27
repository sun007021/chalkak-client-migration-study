# W2(부팅·인증) 테스트에서 제외한 TC

형식: TC ID — 이유 — 예정 PR. BOOT 39개 중 17개, AUTH 65개 중 54개가 소스의 테스트 이름에 ID가 있어 집계된다(`node shared/scripts/check-tc-coverage.mjs web`).

## Web 해당 없음

- TC-BOOT-016 ~ TC-BOOT-031 — Web 해당 없음(강제 업데이트 게이트 자체가 없다, D-15, REQ-BOOT-013). 게이트가 없다는 것은 TC-BOOT-032/033 테스트가 검증한다
- TC-BOOT-034, TC-BOOT-035 — Web 해당 없음(강제 업데이트 게이트와 푸시 탭 이동의 상호작용, D-15·D-11)
- TC-AUTH-014 ~ TC-AUTH-017 — Web 해당 없음(카카오톡 앱 로그인·계정 폴백은 모바일 SDK 동작. Web은 OIDC 인가 리다이렉트 한 가지, Q-02)

## 다음 PR로

- TC-AUTH-033 — 설정 화면의 게스트 "로그인" 버튼이 있어야 확인 — 설정 PR(SET). NAV-020과 함께
- TC-BOOT-036, TC-BOOT-037 — E: Fake 카카오(E2E 빌드)·mock 서버·앱 재시작 여정(Playwright) — E2E PR. 서버 E2E는 Q-02 때문에 개발용 세션 주입을 쓴다
- TC-AUTH-050 — E: 탈퇴 직후 재로그인 SIGN_UP_REQUIRED → 가입 흐름은 약관·사인 화면(ONB/SIGN)이 있어야 — E2E PR

## 에이전트 점검(A)

- TC-BOOT-038, TC-BOOT-039 — A: iTunes 실응답(iOS 한정), 스플래시→홈 전환의 시각 판단 — 에이전트 시나리오
- TC-AUTH-061 ~ TC-AUTH-065 — A: 실제 카카오 로그인·실서버 세션 폐기·탈퇴, 웹 카카오 로그인 왕복(Q-02 결론 후) — 에이전트 시나리오

## W1에서 커버 (테스트 이름에 ID를 더했다)

- TC-AUTH-042 — `core/net/AuthCoordinator.test.ts`(요청 뒤 계정 전환 시 refresh·retry 안 함), `core/state/StaleGuard.test.ts`(계정 전환 전에 시작한 응답은 버림)
- TC-AUTH-051 — `core/net/ApiClient.auth.test.ts`(refresh가 REAUTHENTICATION_REQUIRED면 세션을 지우고 로그인 이벤트). 로그인 화면 이동은 `app/boot.test.tsx`의 TC-AUTH-056
- TC-AUTH-054 — `core/net/AuthCoordinator.test.ts`, `core/net/ApiClient.auth.test.ts`(만료된 access token은 Authorization 없이 보냄)
- TC-AUTH-055 — `core/net/ApiClient.test.ts`(비 loopback http 기준 주소는 생성 단계에서 거부되어 요청도 Authorization도 나가지 않음)
- 정지 회원(D-08) 403 문구는 각 기능 PR이 `auth.banned.*`로 처리한다. 이 PR은 로그인 직후 안내가 없음(TC-AUTH-057)과 탈퇴 가능(TC-AUTH-046)까지

## 일부만 검증 (나머지는 해당 PR에서)

- TC-BOOT-012 — 프리로드 오류 시 즉시 해제와 `preloadFailed` 신호까지. 홈이 오류 상태("다시 시도")로 열리는 것은 홈 PR
- TC-BOOT-013 — 게스트는 `preload('guest')`로 요청하고 상한 700ms가 같음까지. 공개 데이터만 받고 인증 호출 0건인지는 홈 프리로더 구현(홈 PR)
- TC-AUTH-008 — LOGIN_SUCCESS 후 홈으로 이동까지. 푸시 기기 등록 트리거는 Web 해당 없음(Q-04, REQ-PUSH-017)
- TC-AUTH-041 — `UserCaches`가 등록된 캐시를 모두 비우고 로그아웃·탈퇴가 호출함까지. 홈·기록·알림·좋아요·미읽음·사인·푸시 설정 캐시의 등록은 각 기능 PR
- TC-AUTH-035, TC-AUTH-043 등 로그아웃·탈퇴 — `AccountService`(서비스 단위)까지. 확인 대화상자와 버튼 비활성은 설정 PR(SET)
- TC-AUTH-053 — Web의 "보안 저장소"는 access=메모리, refresh=IndexedDB(Q-03 임시안)이므로 평문(localStorage·sessionStorage)에 토큰이 없음을 검증
- TC-ANL-003 — 로그인 단계의 `screen_view(login)`은 `app/boot.test.tsx`의 REQ-BOOT-021 테스트로 검증. 약관·사인·미리보기 단계는 ONB/SIGN PR
