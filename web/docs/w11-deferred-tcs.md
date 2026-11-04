# W11 보류·제외 TC (설정 SET, 피드백 FDBK)

형식: TC — 이유 — 예정 PR/근거. 카탈로그 기준 SET 56개, FDBK 37개 중 SET 51개·FDBK 33개 ID가 Vitest에 들어 있다. 아래는 들어 있지 않거나 일부만 다룬 것이다.

## 웹에 해당 없음·구분이 Vitest가 아닌 것

- TC-SET-038 — 기기 알림 권한이 꺼진 상태에서 스위치를 켜면 시스템 알림 설정 열기 1회 호출. Web은 기기 알림 권한을 확인하지도 시스템 설정으로 이동하지도 않는다(REQ-SET-019, Q-04). 같은 이유로 REQ-SET-015(권한 꺼짐 → 이동), REQ-SET-017(포그라운드 복귀 시 권한 재확인), REQ-SET-018(권한 미결정 → 시스템 요청)은 테스트가 없다. 대신 "브라우저 `Notification.permission`이 denied여도 서버 PATCH만 나가고 `window.open`·`requestPermission` 호출이 없다"를 TC-SET-039·040 이름으로 검증한다(SettingsScreen.push.test) — 근거: Q-04, REQ-SET-019
- TC-SET-054 (A, AG-SET-001) — OS 알림이 꺼진 시뮬레이터에서 시스템 설정으로 이동. Web은 이 시나리오를 수행하지 않는다(에이전트 시나리오 "플랫폼 차이") — 근거: 카탈로그 A, Q-04
- TC-SET-055 (A, AG-SET-002) — 실제 Notion 약관·개인정보 문서 로드. 새 탭을 여는 호출과 허용 호스트 판정까지만 Vitest(TC-SET-047·048). 실제 문서 렌더링은 에이전트 점검 — 근거: 카탈로그 A
- TC-SET-056 (A, AG-SET-003) — 개발 서버 실제 푸시 설정 왕복·재시작 유지. 요청 모양은 C(TC-SET-019~022)로 갈음 — 근거: 카탈로그 A
- TC-FDBK-036 (A, AG-FDBK-001) — 실서버 피드백 전송. 서버에 영구 저장되어 사용자 허가가 필요하다. 요청 모양은 TC-FDBK-015·016(C)으로 갈음 — 근거: 카탈로그 A
- TC-FDBK-037 (A, AG-FDBK-002) — 한글 IME 조합·이모지 키보드 입력감(사람 판단). 카운터가 code point로 세는 것은 TC-FDBK-009~011·013으로 검증한다. 조합 중(compositionstart/end) 카운터가 튀지 않는지는 jsdom이 IME를 재현하지 못해 A — 근거: 카탈로그 A
- TC-SET-053 (S) — 회원·게스트 설정 화면 스크린샷 기준선. jsdom은 렌더링 결과를 비교하지 못한다 — 근거: S/수동
- TC-FDBK-033 (S) — 키보드가 올라온 상태에서 보내기 버튼·입력창이 가려지지 않는지. jsdom은 레이아웃·가상 키보드가 없다 — 근거: S/수동
- TC-FDBK-031 (E) — 앱이 백그라운드로 갔다 복귀하거나 기기를 회전해도 입력 유지. 오류 뒤 입력이 ViewModel·화면에 유지되는 것은 TC-FDBK-021·024·025로 검증한다. 실제 탭 전환·회전은 Playwright — E2E PR

## 일부만 다룬 것 (부분 커버)

- TC-SET-043·046 (E) — 로그아웃·탈퇴 확인 뒤 로그인 화면 이동은 jsdom 통합 테스트(SettingsScreen.account.test)로 다룬다. 요청 순서 자체(TC-AUTH-035·043·044)는 AccountService.test가 이미 검증한다. 실제 브라우저에서의 이동은 E2E
- TC-SET-047 — Notion 문서 열기 1회와 URL은 검증하지만 `screen_view privacy_policy`·`terms_of_service` 1회 전송은 **보내지 않는 것**으로 검증한다(아래 임시 결정 4)
- TC-SET-030 — 저장 중 화면 이탈은 `cancelPending`(요청 abort + 그 항목 복원 + 토스트 없음)으로 검증한다. 실제로는 이미 서버가 적용했을 수 있어 복원 값이 서버와 다를 수 있다(아래 임시 결정 6)
- TC-SET-010 — "변경 실패 시 진행 중이던 조회 응답은 정상 반영"은 `SignatureCardController.afterChange.test`에서 기존 `refresh()` 동작을 고정하는 테스트라 지금도 통과한다(구현 전 실패 목록에 들어가지 않는다)
- TC-SET-012 — 사인 조회의 401 → 로그인은 화면 통합(SettingsScreen.test)과 `refreshAfterChange`로 검증한다. 토큰 갱신 자체는 AuthCoordinator 테스트 몫
- TC-SET-013 — `SignatureRepository` 요청 모양은 기존 구현이 이미 만족해 `NotificationSettingsRepository.test` 안의 한 테스트는 지금도 통과한다
- TC-FDBK-014 — "UI가 멈추지 않는다"는 10만 자를 한 번에 입력해 카운터·거부를 확인하는 것으로 갈음한다(성능 측정 아님)
- TC-FDBK-034 — 분석 이벤트·로거에 피드백 내용이 없는 것만 검증한다. 화면 밖(브라우저 개발자 도구, 서버 로그)은 범위 밖
- TC-FDBK-032 — 닫기 버튼·브라우저 뒤로 가기만 다룬다. iOS 스와이프·Android 뒤로가기는 해당 없음

## 임시 결정 (명세에 없거나 모순되어 테스트에서 이렇게 정했다)

REQ와 TC 카탈로그가 다르면 REQ를 따랐다.

1. **푸시 알림 카드를 Web에서 보인다 (TC-SET-040).** 카탈로그·testids는 "보일지 숨길지 결정 필요"이고 REQ-SET-001(푸시 알림 섹션 포함)·REQ-SET-019(Web은 스위치를 서버 설정에만 연결)·REQ-SET-020·021을 따라 **보이는 쪽**으로 정했다. 서버 설정은 계정 단위라 모바일에서 바꾼 값을 Web에서도 볼 수 있어야 한다. 이 결정이 틀리면 푸시 관련 테스트(`NotificationSettingsRepository.test`, `NotificationSettingsStore.test`, `SettingsScreen.push.test`, `container.settings.test`의 `notificationSettings` 항목, `settingsFlow.test`의 푸시 항목)를 지우고 `settings.push-section` 부재 테스트 하나로 바꾸면 된다. 서버 PATCH를 보내므로 Web에서 켜도 Web이 푸시를 받지는 않는다.
2. **조회 실패는 토스트와 인라인 오류를 모두 보인다.** REQ-SET-010은 토스트 `settings.push.load-error` + 스위치 비활성, TC-SET-016·testids는 `settings.push-error` 문구와 `settings.push-retry-button`이다. 둘이 충돌하지 않아 둘 다 요구한다. 스위치는 비활성이고 켜짐·꺼짐 값을 지어내지 않는다(`aria-checked="false"`로 둔다).
3. **재조회 실패 시 값을 비운다 (TC-SET-033).** 이미 값이 있어도 실패하면 `values: null`, `status: 'error'`로 두고 이후 `toggle`은 무시한다. 오래된 서버 값을 기준으로 바꾸지 않는다.
4. **`screen_view privacy_policy`·`terms_of_service`는 Web에서 보내지 않는다 (TC-SET-047).** REQ-SET-006은 "문서가 보이는 동안" 보낸다고 하지만 Web은 문서를 새 탭에서 열어 앱 안 화면이 없다. 가입 약관(TermsScreen.test, REQ-ONB-011 "Web 해당 없음")과 같게 맞췄다.
5. **게스트는 피드백 행이 없다 (REQ-SET-002 vs testids "게스트는 토스트").** 게스트 설정은 "로그인" 버튼만 보인다(REQ-SET-002, D-05). 게스트 피드백 토스트(`nav.guest.feedback`)는 `/feedback` URL 직접 진입에서 홈으로 보내며 보인다(TC-FDBK-035, TC-NAV-022). 피드백 라우트는 `MemberOnly action="feedback"` 아래에 둔다.
6. **저장 중 화면 이탈은 요청을 abort하고 복원한다 (TC-SET-030, 카탈로그 iOS 기준).** 설정 탭이 사라질 때(`onHidden`) `cancelPending`을 부른다. 탭에 돌아오면 어차피 GET으로 서버 값을 다시 읽는다(REQ-SET-010). abort 시점에 서버가 이미 적용했을 수 있다는 점은 감수한다.
7. **푸시 저장 401은 토스트 없이 복원한다.** REQ 표: GET·PATCH 401 → 로그인 화면, 사용자 문구 없음. 그 밖의 실패(연결 실패·타임아웃·5xx·400·403)는 모두 `settings.push.save-error` 토스트.
8. **피드백 400은 서버 message가 아니라 고정 문구 `fdbk.error.invalid`다 (TC-FDBK-021 vs REQ-FDBK-010).** TC-FDBK-021은 "서버 message 그대로"이지만 REQ-FDBK-010·D-02(서버 message는 표시에 쓰지 않는다)를 따랐다. 검증 메시지는 `feedback.validation-message`(400, 1000자 초과), 네트워크·일반 실패는 `feedback.error-message`.
9. **1000자 초과는 입력을 막지 않고 보내기 시점에 거부한다 (REQ-FDBK-005 [추정]).** 보내기는 trim 후 1자 이상이면 활성이고, 1001자에서 누르면 요청 0건 + 검증 메시지. 입력이 바뀌면 메시지를 지운다. 카운터는 `현재 수/1000`(REQ-FDBK-003)이며 1000을 넘어도 실제 수를 보인다.
10. **피드백 닫기·성공 뒤 이동.** 설정에서 `SETTINGS_BELOW_STATE`로 push했으면 뒤로(POP), URL로 직접 왔으면 `/settings`로 replace. 성공 토스트는 `fdbk.success`. 새로 열면 항상 빈 입력(마운트마다 새 ViewModel).
11. **전송 중 입력창은 읽기 전용이다.** ViewModel도 전송 중 `setText`를 무시한다. 성공하면 입력을 비우고, 실패하면 유지한다. 전송 중 중복 호출은 `ignored`.
12. **확인 대화상자.** `role="alertdialog"` + `aria-modal`, 제목은 확인 문구 자체(`aria-labelledby`). 처음 포커스는 **취소 버튼**(되돌릴 수 없는 동작이라 FeedScreen 삭제 대화상자와 같음), `useDialogFocus`로 Tab 순환·Esc(=취소)·배경 inert·닫으면 트리거(행)로 포커스 복귀. 탈퇴 처리 중에는 확인 버튼 비활성, Esc·취소 무시. 로그아웃/탈퇴의 "강조 방식 구분"은 탈퇴 확인 버튼에만 `data-emphasis="destructive"`로 정했다(스타일은 자유).
13. **푸시 스위치는 `role="switch"` + `aria-checked`, 접근성 이름은 스위치 라벨 문구.** testids의 "checked 상태 노출"을 이렇게 해석했다. 네이티브 `<button role="switch">`면 Space·Enter가 click으로 온다.
14. **버전정보 값은 접두 없는 문자열 (확인 필요 4).** 컨테이너 `appVersion`의 기본값은 `package.json`의 `version`(빌드 define으로 주입)이고 `makeHarness({ appVersion })`로 덮어쓴다. 행을 눌러도 아무 일도 일어나지 않는다(버튼이 아님).
15. **사인 변경 성공 뒤 재조회는 `SignatureCardController.refreshAfterChange()`.** `refresh()`는 진행 중 요청에 올라타므로 변경 전에 시작된 조회 응답이 새 사인을 덮을 수 있다(TC-SET-009). `createSignaturePreviewViewModel('change')`의 `refreshSignatureCard`를 `refreshAfterChange`로 바꿔야 한다.
16. **회원탈퇴 요청은 화면을 떠나도 abort하지 않는다.** 서버가 이미 삭제했을 수 있어 중간 취소로 로컬 세션과 서버 상태가 어긋나는 것을 피한다. `SettingsViewModel.confirmWithdraw`는 signal을 넘기지 않는다.
17. **문서가 가려져도(visibilitychange hidden) 진행 중인 푸시 저장은 취소하지 않는다 (TC-SET-030 해석).** 취소·복원(`cancelPending`)은 설정 화면이 떠날 때(탭 이동·라우트 이동·언마운트)만 한다. 문서가 다시 보이면(visible) 서버 값을 다시 읽는다.
18. **REQ-FDBK-014는 Web에 해당 없다.** 해당 요구는 모바일 전용 동작이라 Web에서는 구현·테스트하지 않는다.
19. **탈퇴 DELETE는 응답을 잃은 뒤 재시도할 수 있다.** DELETE는 멱등이라 D-21에 따라 0.5초, 1초 백오프로 최대 2회 재시도한다. 첫 요청이 서버에서 이미 처리됐는데 응답만 잃었다면 재시도가 404/401로 끝날 수 있어 실패 토스트가 뜰 수 있다. 서버 동작 확인 대상이다.
20. **피드백 화면을 닫으면 전송 중 POST를 abort하지만 회원탈퇴는 abort하지 않는다.** 피드백은 서버에 저장됐을 수 있어도 사용자 입력만 잃는 정도라 취소를 허용하고, 탈퇴는 서버 삭제와 로컬 세션이 어긋나지 않게 끝까지 기다린다(임시 결정 16).
21. **TC-SET-048(문서 열기 실패)에는 다시 시도 버튼이 없다.** 행을 다시 누르면 다시 열고, 성공하면 메시지를 지운다.
22. **버전 문자열의 출처는 `package.json`의 `version`이다.** 빌드 시점에 `vite.config.ts`의 `define`(`__APP_VERSION__`)으로 주입하고 컨테이너 옵션 `appVersion`으로 덮어쓸 수 있다.
23. **조회 실패·조회 중 푸시 스위치는 `aria-checked="false"`이다.** 값이 없으면 켜짐을 지어내지 않는다. 다시 읽는 동안 이전 값이 있으면 그 값을 그대로 보이고 비활성만 한다.

## 백엔드·QA 확인 대상

- 푸시 알림 카드를 Web에서 보일지(임시 결정 1). 서버 설정만 바꾸고 Web은 푸시를 받지 않으므로 사용자에게 혼란을 줄 수 있다. 숨기기로 하면 REQ-SET-001·019, TC-SET-040, testids 비고를 함께 정리해야 한다.
- 설정 조회 실패 UI(임시 결정 2)와 `settings.push-error` 문구를 토스트와 중복해서 보여도 되는지.
