# W4 보류 TC (약관·온보딩 사인·사인 변경)

형식: TC — 사유 — 예정 PR/근거. Web 단위·화면·API 테스트로 닫지 못한 항목이다.

## E2E (실제 브라우저·실제 서버 필요)

- Vite `/__upload-proxy/<host>/<path>?<query>` 프록시 설정과 S3 CORS 동작 — jsdom에서는 프록시·CORS를 검증할 수 없다. `DevProxyUploadUrlRewriter`는 단위 테스트로 닫았고, `vite.config.ts` 프록시 설정은 구현 단계에서 넣은 뒤 E2E에서 확인 — W4 구현 PR/E2E.
- TC-ONB-008 E, TC-ONB-011 브라우저 부분 — 새 탭 열림과 문서 로딩은 실제 브라우저에서만 확인 가능 — E2E.
- TC-ONB-045 E — 실제 가입 완료 종단 흐름 — E2E.
- TC-NAV-038, TC-NAV-040 E — 실제 히스토리·새로고침 동작 — E2E.
- TC-SIGN-010 픽셀 알파, TC-SIGN-012 골든 이미지, TC-SIGN-013 PNG 실바이트, TC-SIGN-016 성능 — jsdom canvas는 getContext가 null이라 픽셀을 만들 수 없다. 단위에서는 `RecordingSurface` 명령 수준(해상도 1024x512, 패딩 48, 선 두께 14, 투명 배경, 흰 선)과 1 MiB 상한 분기로 대체 — E2E.

## Web에 해당 없음

- TC-ONB-012 문서 로드 실패 시트 — Web은 새 탭으로 열어 앱이 로드 실패를 알 수 없다. 허용 호스트 밖 URL과 opener 실패(`openFailed`)만 안내 문구로 처리 — 근거: 외부 링크는 새 탭(D-25 연관).
- REQ-ONB-011 `screen_view` terms_of_service / privacy_policy — Web은 앱 내 화면이 없으므로 보내지 않는다(no-op). `terms`만 경로 추적 — 근거: 새 탭 열기.
- TC-ONB-047 푸시 알림 권한 — Web 범위 밖, 푸시 PR에서 다룸 — PUSH PR.
- TC-ONB-050, TC-ONB-051, TC-ONB-052, TC-SIGN-044, TC-SIGN-045 (Android 전용 시나리오) — Web 해당 없음 — 근거: 플랫폼 전용 TC.

## 다른 PR 범위

- TC-SIGN-039, TC-SIGN-040, TC-SIGN-041 화면(W) 부분 — 설정 화면의 사인 카드 UI가 필요하다. `SignatureRepository`, `SignatureCardController`(상태·재조회)는 이번에 단위로 닫음 — 설정 화면 PR.
- TC-SIGN-026 W — 설정 화면 카드 노출 — 설정 화면 PR.
- 설정 화면의 사인 변경 진입점(`/settings/signature`로 이동하는 버튼) — 설정 화면 PR.

## 알려진 한계·확인 필요 (코드리뷰 정리)

- 뒤로 버튼 "←"의 접근성 라벨 copy 키가 `shared/copy/ko.json`에 없다(글리프만 렌더) — shared에 키 추가 요청 필요.
- `WindowExternalLinkOpener`는 `noopener`로 열기 때문에 `window.open`이 null을 돌려줘도 팝업 차단과 구분할 수 없다. 던지지 않으면 열린 것으로 본다 — 한계로 수용.
- 가입 confirm 400이 "이미 사용된 토큰"일 때도 D-02에 따라 `invalid`(다시 그리기)로 가서, 같은 토큰 재사용이 원인이면 그리기 루프가 가능하다 — 백엔드 확인 필요.
- 업로드 프록시는 loopback https를 지원하지 않는다(loopback은 http, 허용 포트만).
- 딥링크로 변경 그리기가 첫 항목이면 끝난 뒤 `[그리기, 설정]`이 되어 뒤로 가기에 그리기가 다시 나온다(`settingsBelow` 없는 경우의 replace 규칙).
