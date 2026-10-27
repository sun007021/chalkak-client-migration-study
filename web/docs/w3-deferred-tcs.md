# W3(내비게이션 셸) 테스트에서 제외한 TC

형식: TC ID — 이유 — 예정 PR. NAV 50개 중 25개가 소스의 테스트 이름에 ID가 있어 집계된다(`node shared/scripts/check-tc-coverage.mjs web`). W1이 미뤄 둔 TC-ANL-005, TC-ANL-016은 이번 PR에서 다룬다.

## Web 해당 없음

- TC-NAV-043 — Android 계열의 시스템 뒤로·앱 백그라운드 전환(`popUpTo(홈)`). Web은 TC-NAV-044가 같은 의도를 브라우저 뒤로·앞으로로 검증한다. REQ-NAV-026의 "앱 종료"는 navigation.md 플랫폼별 허용 차이에서 Web 해당 없음
- TC-NAV-013 — S: 스크린샷 비교(하단 바에 콘텐츠가 가려지지 않음). Web은 시각 회귀 도구가 없음 — 최종 에이전트/수동 점검

## 다른 기능 화면이 있어야 확인되는 것

- TC-NAV-006 — E: 설정에서 연 업로드 화면을 닫으면 설정으로 복귀. 업로드 화면 필요 — 업로드 PR(E2E)
- TC-NAV-007 — 업로드 진입 게이트의 연타 1회 요청. 게이트(`UploadEntry` 구현, GET /posts/today)는 UPL 소유 — 업로드 PR. 셸은 누를 때마다 `UploadEntry.start()`를 부르는 것까지(TC-NAV-005)
- TC-NAV-010 — 전시·기록 탭의 날짜·월·정렬·스크롤 유지. 상태가 있는 탭 화면 필요 — 전시 PR, 기록 PR
- TC-NAV-011 — E: `[결정 필요]` 홈 스크롤 복원(iOS/Android 상이). 공통 기대값이 정해질 때까지 보류
- TC-NAV-012 — E+W: 피드 상세에서 하단 바 숨김과 복귀. 피드 화면 필요 — 전시·피드 PR. 하단 바가 탭 4개 경로에만 있고 로그인에는 없음은 이번 PR이 검증(REQ-NAV-023)
- TC-NAV-014 — 게스트 홈의 주제·랭킹·배너와 인증 API 0건. 홈 데이터 필요 — 홈 PR. 셸 수준의 "게스트 홈/전시 탭이 열리고 요청 0건"은 이번 PR이 검증
- TC-NAV-015 — 게스트 전시 목록의 Authorization 없는 GET /posts. 전시 API 필요 — 전시 PR
- TC-NAV-021 — 게스트 설정 탭의 "로그인" 버튼·섹션 구성. 설정 화면 필요 — 설정 PR(SET). TC-AUTH-033, REQ-NAV-020과 함께
- TC-NAV-029 — S: 하단 바 유무에 따른 토스트 위치. 스크린샷 — 수동 점검
- TC-NAV-030, TC-NAV-031, TC-NAV-037 — E: 알림 벨, 알림 목록·상세 뒤로. 알림 화면 필요 — 알림 PR(E2E)
- TC-NAV-032 — 전시 카드 연타 시 피드 1개. 피드 화면 필요 — 전시·피드 PR
- TC-NAV-033 — E: 업로드 성공 → 전시(topicDate), 뒤로 가면 홈. 업로드 PR(E2E)
- TC-NAV-034 — E: 기록 → 전시·피드 → 뒤로. 기록·전시 PR(E2E)
- TC-NAV-035 — E: 홈 랭킹 링크. 홈 PR(E2E)
- TC-NAV-036 — E: 배너 웹 → 뒤로. 홈·배너 PR(E2E)
- TC-NAV-038 — E: 설정 → 사인 변경 → 미리보기 → 완료. 사인 PR(E2E)
- TC-NAV-040 — E: 가입 성공 뒤 약관·사인·미리보기가 백스택에서 사라짐. 가입 화면(ONB/SIGN) 필요 — ONB PR(E2E). 삭제 뒤 토스트(REQ-NAV-040)는 TC가 아니라 전시·피드 PR
- TC-NAV-046 — E: 포그라운드 복귀 시 미읽음·홈 조용한 재조회. 홈·알림 PR
- TC-NAV-047, TC-NAV-048 — E: 피드백 전체 화면 닫기·입력 보존. 피드백 PR(FDBK)
- TC-NAV-049 — E: 게스트가 설정의 "로그인"으로 로그인한 뒤 제한 해제. 설정 화면 + 카카오 흐름 E2E — E2E PR

## 일부만 검증 (나머지는 해당 PR에서)

- TC-NAV-004 — 탭 4개 전환과 선택 표시 따라옴(U·W)까지. E의 "하단바 인스턴스 유지"는 W에서 같은 요소 유지로 대체
- TC-NAV-008, TC-NAV-009 — `MainShellViewModel.subscribeReselect`가 같은 탭 재선택을 알리는 것까지(U). 전시 그리드·홈 스크롤을 맨 위로 올리는 W는 전시 PR, 홈 PR. 홈 재선택의 새로고침 동반 여부는 `[결정 필요]` 그대로
- TC-NAV-018, TC-NAV-019, TC-NAV-020, TC-NAV-022 — `GuestGate.requireMember('guest', 'feed'|'like'|'notification'|'feedback')`가 토스트·거절을 돌려주는 U까지. 전시 카드·홈 랭킹·좋아요·알림 벨·피드백 행에서 이동 없음과 요청 0건은 각 기능 PR이 `GuestGate`를 호출하는 W로 확인
- TC-NAV-024 — 셸·`GuestGate`에서 정지 회원이 회원과 같은 것까지(셸은 정지 여부를 모른다). 기록·알림·전시 조회 API 정상 호출은 REC·NOTI·DISP PR
- TC-NAV-044 — W로 앞당김(탭 이동 후 브라우저 뒤로·앞으로, 새로고침 복원, 세션 없으면 로그인). Playwright E는 E2E PR에서 실제 브라우저 히스토리로 한 번 더
- TC-NAV-017 — W·U까지(토스트, 업로드 진입 시작 0건, GET /posts/today 0건). E는 E2E PR
- TC-NAV-005 — 회원이면 `UploadEntry.start()`가 불리고 선택 탭·분석이 그대로인 것까지. GET /posts/today는 UPL
- TC-NAV-050 — 로그아웃 시 사용자 캐시 비움 + 재로그인 후 홈 선택·히스토리 새 시작(W)까지. 전시·기록의 실제 상태 초기화는 각 화면 PR이 `UserCaches`에 등록해 확인
- TC-NAV-039, TC-NAV-041, TC-NAV-042 — 로그인·로그아웃·재인증 후 `RequireSession`으로 보호 화면 뒤로 가기 불가(W). 가입 완료 뒤 백스택은 ONB PR
- TC-ANL-024 — E: Playwright 여정과 tracker 로그 수집 — E2E PR

## 설계 메모: 문서와 Web 해석의 차이

- REQ-NAV-022 "쌓인 모든 화면을 백스택에서 제거"는 브라우저 히스토리 API로 항목을 지울 수 없다. 로그인으로 `replace` 이동하고, 이전 보호 화면으로 뒤로 가도 `RequireSession`이 다시 로그인으로 보내는 것으로 같은 효과를 낸다(TC-NAV-041/042).
- REQ-NAV-026 "비홈 탭 루트에서 뒤로 → 홈": 홈에서 다른 탭은 push, 비홈 탭끼리는 replace로 두어 히스토리를 항상 [홈, 현재 탭]으로 유지한다. 북마크·새 탭으로 비홈 탭에 직접 들어와 아래에 앱 항목이 없는 경우는 브라우저 기본 동작(이전 사이트)을 따른다 [임시안].
- 게스트가 `/record`로 직접 들어오면 홈으로 replace + `nav.guest.record` 토스트 [임시안, 기록 화면은 열리지 않는다].
- 다른 탭의 로그아웃·계정 전환 전파(BroadcastChannel `chalkak-session`)는 W2 리뷰에서 넘어온 항목이라 이번 PR에서 테스트한다(REQ-NAV-022의 Web 확장, TC ID 없음).

## W3 코드 리뷰에서 이월한 항목

- 신호 도착 시 진행 중이던 이전 계정 요청의 응답 폐기 — 탭이 `changed`를 받아 캐시를 비워도 이미 나간 요청의 응답이 새 계정 화면에 반영될 수 있다. 세션 세대 토큰을 요청·ViewModel에 전달하는 설계가 필요해 각 기능이 요청을 만드는 PR(홈·전시·기록)에서 `UserCaches`와 함께 한다
- 내비게이션 실행 헬퍼 분리 — `BottomBar`의 plan 실행(push/replace/back)을 훅으로 뽑는 일. 탭 이동을 쓰는 화면이 늘 때(업로드 성공 → 전시 등) 업로드 PR에서 한다
- `SessionChannel.close`/HMR dispose — 컨테이너는 앱 수명 동안 하나라 닫는 곳이 없다. 개발 서버 HMR로 컨테이너가 다시 만들어질 때 이전 채널을 닫는 정리는 필요해질 때(개발 경험 PR) 한다
- 손상 레코드를 읽어 지울 때 신호를 보내지 않는 것은 의도다 — 손상은 계정 변경이 아니라 저장소 복구이고, 다른 탭도 다음 읽기에서 같은 복구를 한다. 문서화만 하고 동작은 바꾸지 않는다

## 설계 메모 추가

- 다른 탭 전파는 신호의 `previousUserId`가 아니라 **이 탭이 아는 userId와 신호의 userId 비교**다(게스트·비로그인은 null). 다르면 캐시를 비우고 부팅 경로(`/`)로 replace 이동해 인증 게이트를 다시 판정한다. 그래서 로그인 화면이나 게스트로 있던 탭도 다른 탭의 회원 로그인을 받아 회원 홈으로 간다. 놓친 신호는 `visibilitychange`(visible)·`pageshow(persisted)`에서 저장소를 다시 읽어 같은 비교로 되찾는다.
