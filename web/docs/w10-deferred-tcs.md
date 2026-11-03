# W10 보류·제외 TC (알림함, NOTI/PUSH)

형식: TC — 이유 — 예정 PR/근거

## 웹에 해당 없음 (푸시·OS 수준, Q-04, REQ-PUSH-017)
Web은 푸시 수신과 기기 등록을 하지 않고 알림함만 제공한다(open-questions Q-04, notification-push.md "플랫폼별 허용 차이"·"범위 밖"). 아래 PUSH 전부는 Web에서 구현하지 않으므로 테스트도 없다. 예외로 TC-PUSH-036만 "Web은 푸시 호출 0건"을 확인하는 Web 한정 TC라 Notification.flow.test에 있다.
- TC-PUSH-001~011 OS 알림 권한 요청·앱 안내·1회 제한·요청 실패 토스트 — Web은 권한을 요청하지 않는다(REQ-PUSH-003, 017). 서버 수신 설정 PATCH(PUSH-005·006)도 설정 화면(SET) 소관 — 근거: Q-04
- TC-PUSH-012~035 기기 등록(`PUT /push-devices/current`), JWT `session_id` 판별, 중복 제거·직렬화·재시도, 로그아웃·계정 전환 시 등록 규칙 — 등록 자체가 없다(REQ-PUSH-017) — 근거: Q-04
- TC-PUSH-037~067 푸시 payload 파싱·탭 이동·보류·콜드 스타트·로그아웃 폐기 — 푸시 탭이 없다. 같은 목적지 표와 읽음 분기는 알림함 행 탭이 쓰므로 NOTI-024~041로 검증한다(`planRowTap`, `NotificationInboxViewModel.tap.test`). 푸시 전용인 `PushPayload` 파싱·보류(PUSH-043~052, 058~063, 066, 067)는 Web 구현이 없다 — 근거: Q-04, REQ-PUSH-017·030~032
  - TC-PUSH-053~057(푸시 탭의 읽음 성공·네트워크 실패·404·5xx·401)은 문장이 "같은 TC를 공유"하지만 푸시 탭 진입이 없는 Web에서는 NOTI-027~035 이름으로만 검증한다.
  - TC-PUSH-064·065(같은 상세 교체·이미 홈이면 중복 이동 안 함)는 푸시 진입 전용이다. 알림함 행 탭은 push 이동만 한다.
- TC-PUSH-068~073 포그라운드 푸시 표시·채널·`willPresent`·AI 화면 억제·푸시 수신 시 미읽음 재조회 — 푸시 수신이 없다. 미읽음 재조회 중 Web에 있는 트리거(홈이 보일 때·포그라운드 복귀·알림함에서 돌아옴·읽음 성공)는 NOTI-050 — 근거: Q-04, REQ-PUSH-019·020
- TC-PUSH-074~077 (A) 시스템 권한 다이얼로그·실제 푸시 도착·로그아웃 후 미수신·APNs 토큰 — 실기기/시뮬레이터 전용이고 AG-PUSH-001~006은 Web을 "생략"으로 적는다 — 근거: agent-scenarios

## 에이전트(A) 전용
- TC-NOTI-056 실서버 알림함 조회·읽음·미읽음 점 비교 (A, AG-NOTI-001) — 개발 서버와 실계정이 필요하고 읽음 처리는 되돌릴 수 없다 — A
- TC-NOTI-057 실제 반려 알림 상세의 사진·사유 시각 판단 (A, AG-NOTI-002) — 관리자 반려가 필요한 사람 개입 시나리오 — A

## 부분 커버
- TC-NOTI-051 게스트는 미읽음 조회 0건·점 없음 — 새 코드가 없는 기존 동작이다(`HomeViewModel.loadUnread`는 회원만, `GuestGate` 알림 토스트, 게스트가 `/notifications`로 오면 `MemberOnly`가 홈으로 보낸다). 기존 TC-HOME-050~052, TC-NAV-014·020 테스트와 `GuestGate.test`가 검증하므로 이 PR에서는 새 테스트를 만들지 않았다. NOTI 이름으로 세어지게 하려면 구현 PR에서 기존 홈 테스트에 TC 번호를 추가해도 된다.
- TC-NOTI-049·050·052·053·054·055의 미읽음 부분 — 점 표시·재조회 자체는 홈(HomeViewModel/HomeScreen)이 이미 구현해 홈 테스트가 검증한다. 이 PR에는 알림함을 거치는 부분만 테스트한다: 읽음 성공 뒤 `refreshUnread`, 알림함에서 돌아온 홈의 재조회(홈이 다시 보일 때), 실패 시 점 유지, 401 REAUTH → 로그인, 계정 전환 시 알림함·홈 상태 초기화(`Notification.flow.test`, `container.notification.test`).
- TC-NOTI-050의 "앱 포그라운드 복귀·푸시 수신" — 홈의 문서 가시성 재조회는 기존 HomeViewModel/HomeScreen 테스트(TC-HOME-051)가 검증하고 푸시 수신은 Web 해당 없음. 이 PR의 테스트는 읽음 성공·알림함에서 돌아옴 두 트리거만 확인한다.
- TC-NOTI-001·TC-NAV-030·037은 E지만 Playwright가 아니라 Vitest 라우터 흐름(`Notification.flow.test`)으로 검증했다. 실제 브라우저 뒤로 가기·스크롤 복원은 E2E PR — 근거: W8과 같은 방식
- TC-NOTI-043 상한 길이(500자) 레이아웃이 깨지지 않음 (W) — jsdom은 레이아웃을 계산하지 않는다. 전문이 DOM에 있고 줄바꿈 서식(`white-space: pre-wrap`, `overflow-wrap`)이 걸렸는지만 확인한다. 시각 확인은 S/수동
- TC-NOTI-015의 "끝에서 4번째 근처" — 실제 IntersectionObserver 대신 `FakeVisibilityObserver`로 센티넬 위치(끝 4개 앞)와 호출 횟수를 확인한다. 실제 스크롤은 E2E PR

## 지원하지 않는 것
- 알림 "모두 읽음" UI와 `PATCH /notifications/read-all` 호출(REQ-NOTI-013, 범위 밖) — 호출하지 않는다는 것만 확인(`NotificationInboxViewModel.load.test`)
- 알림 상세의 시각 표시, 푸시를 받았을 때 열려 있는 알림함 자동 새로고침(확인 필요 5) — 하지 않는다
- 당겨서 새로고침 제스처 — Web에서는 "새로고침" 버튼(`webOnlyCopy['noti.refresh']`)이 대신한다(홈과 같은 방식). 허용 차이(알림함 "당겨서 새로고침 표시는 자유")
- 푸시 서버 발송 규칙, 30일 보관 경계(서버 책임, 클라이언트는 날짜로 거르지 않는다는 것만 NOTI-023으로 확인)

## 임시 결정 (명세에 없거나 REQ와 TC가 달라 테스트에서 이렇게 정했다. REQ를 TC보다 우선했다)
- 목록 401: TC-NOTI-009 문장은 갱신 후에도 실패하면 "로그인이 필요해요." 문구를 보인다. REQ의 실패 표는 "로그인 화면, 사용자 문구 없음"이다. 표를 따라 ViewModel은 토스트도 오류 화면도 만들지 않고(`loading`을 그대로 둔다), 코어(`AuthCoordinator`)가 세션을 만료시키면 `RootLayout`이 `/login`으로 보낸다.
- 목록 404: TC-NOTI-010 문장은 "D-24 문구 noti.gone으로 통일하고 목록을 새로고침한다"지만 REQ의 실패 표에 목록 404 행이 없고 fixture(`notifications__not-found`)가 "방어용"이다. 목록 404는 "그 밖의 실패"로 보아 `noti.inbox.error` 오류 화면, 토스트 없음, 자동 재요청 없음(새로고침 무한 루프 방지)으로 정했다. `noti.gone` + 새로고침은 읽음 PATCH 404와 상세 404에만 적용한다.
- 오류 문구: TC-NOTI-008은 "알림을 불러오지 못했어요."(마침표), 문구 키 `noti.inbox.error`는 마침표 없음. 키(마침표 없음)를 따른다.
- 읽음 연타 잠금(REQ-NOTI-020 "같은 행의 중복 탭"): 읽음 요청과 이동이 한 번씩만 일어나도록 행과 무관하게 한 번에 하나만 처리한다(처리 중 다른 행 탭도 무시, REQ-NAV-032의 연타 방지와 같은 취지).
- 이미 읽은 행 탭(확인 필요 3): 서버가 멱등이므로 PATCH를 항상 보낸다. 최초 `readAt`은 유지한다.
- TOPIC·REMINDER 행(확인 필요 4, Q-11): 읽음 요청 없이 홈 push(뒤로 가면 알림함). 홈 맨 위 스크롤·새로고침(PUSH-022 TOPIC)은 푸시 전용이라 하지 않는다.
- 알림 상세 영역 규칙: 사진은 `NOTICE`가 아니고 `originalImageUrl`이 있을 때, "반려 사유"는 `POST_REJECTED`이고 `rejectionReason`이 있을 때, "알림함으로" 버튼은 `POST_REJECTED`일 때만 그린다(REQ-NOTI-024~026). NOTICE·승인에 사유가 와도 그리지 않는다. TC-NOTI-047("승인도 사진이 있으면 표시")과 REQ-NOTI-025(공지는 사진 영역 없음)를 둘 다 만족한다.
- 알림 상세 뒤로: 알림함을 거쳐 push한 상세(`state.inboxBelow`)는 뒤로, 딥링크·새로고침으로 첫 항목이 된 상세는 알림함으로 replace(`planBackToInbox`, 뒤로 버튼과 "알림함으로" 공통). 알림함 자신의 뒤로는 push한 항목이면 뒤로, 첫 항목이면 홈으로 replace(`planInboxClose`).
- 상세 404: `noti.gone`을 상태(`notification-detail.not-found-state`)로만 보이고 토스트는 띄우지 않는다. 알림함·미읽음 새로고침은 `NotificationSync`로 한다.
- 조용한 재검증(REQ-NOTI-012)은 첫 페이지 항목만 교체하고 이미 읽은 뒤쪽 페이지는 유지한다(id 중복 제거). 당겨서 새로고침(REQ-NOTI-010)은 목록 전체를 첫 페이지로 교체한다. 읽음 404 뒤 재검증에서 사라진 항목이 2페이지 이후에 있으면 남아 있을 수 있다(첫 페이지가 아니므로).
- 새로고침이 겹치면 최신 우선(이전 응답 폐기). 화면의 새로고침 버튼은 `refreshing` 동안 비활성이라 사용자가 겹치게 보낼 수는 없고, 겹침은 재검증과 새로고침, 읽음 404 재검증 사이에서 생긴다.
- 분석 이벤트: `screen_view(notifications)`·`screen_view(notification_detail)`만 보낸다(D-22). 새 이벤트는 없다.
- 센티넬: 목록 길이가 20이면 끝에서 4번째 항목(index 16) 바로 앞에 둔다(`INBOX_SENTINEL_OFFSET = 4`). ViewModel은 `onLastVisibleIndexChanged(index >= length-4)`와 `onSentinelVisible()` 둘 다 받는다.
- 새 Web 전용 문구(shared/copy에 키 없음, `copy/webOnly.ts`): `noti.refresh`, `noti.refresh-indicator`, `noti.load-more`, `noti.back`, `noti.unread.a11y`, `noti.detail.photo-alt`.

## 백엔드·QA 확인 대상
- 목록 `GET /notifications` 404(방어용 fixture)의 클라이언트 처리: 위 임시 결정(오류 화면)과 TC-NOTI-010 문장(noti.gone + 새로고침)이 다르다. 서버가 실제로 이 응답을 주는지, 준다면 어떻게 보일지 확인해 주세요.
- 목록 401 갱신 후 실패 시 "로그인이 필요해요." 문구(TC-NOTI-009) 필요 여부: 문구 키가 shared/copy에 없다. 확정 전에는 문구 없이 로그인 화면으로만 보낸다.
