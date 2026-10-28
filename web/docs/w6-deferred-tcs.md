# W6 보류·제외 TC (전시·상세·제목 수정/삭제·좋아요)

형식: TC — 이유 — 예정 PR/근거

## W5에서 넘겨받아 W6에서 다루는 것
- 랭킹·인기 좋아요 (REQ-HOME-033, `home.ranking-like-*`, `home.popular-like-*`) — W6에서 테스트한다 — 근거: HomeViewModel.likes.test, HomeScreen.likes.test
- 게시물 삭제·제목 변경 이벤트 반영 (TC-HOME-046, TC-FEED-044, TC-LIKE-010) — 공유 `PostChanges`(like/title/removed 이벤트 + 삭제 기억)로 전시·홈·상세에 전파한다 — 근거: PostChanges.test, DisplayViewModel.dates.test, HomeViewModel.likes.test, FeedViewModel.test
- 홈 → 전시/상세 이동 (TC-HOME-021/022/023/031의 E 부분) — 이동 경로·인자는 W5에서 검증했고 전시 화면 본체는 DisplayScreen.test가 맡는다 — 근거: DisplayScreen.test

## 다른 PR로 넘기는 것
- 기록 탭·알림에서 상세 열기(`assumeMine`)와 기록 캐시의 삭제·제목 반영 (TC-FEED-004 기록 진입 부분, TC-FEED-024/036/044의 기록 부분) — 기록 화면이 없다. 상세 ViewModel의 `assumeMine`과 `PostChanges` 구독 계약까지만 검증 — 기록 PR
- AI 피드백 영역 (`feed.ai-*`, REQ-FEED AI 부분, D-03) — 상세 화면 안의 AI 버튼·폴링·시트는 AI 리뷰 PR — AI 리뷰 PR
- TC-FEED-014 사인 이미지 로드 실패 시 사인만 생략 — 공통 이미지 컴포넌트·개별 이미지 오류 처리 — 이미지 PR
- TC-DISP-056 업로드 성공 후 해당 `topicDate` 전시 열기 — 업로드 화면 PR (이 PR은 `displayPath(date, sort)` 쿼리 계약까지) — 업로드 PR
- TC-LIKE-013 / TC-FEED-006 / TC-DISP-051 중 재인증 필요(REAUTHENTICATION_REQUIRED) 시 로그인 화면 이동 — ApiClient·세션 이벤트가 W1/W2에서 검증했다. 전시·상세는 refresh 뒤 재전송까지만 확인 — 근거: W2 deferred
- TC-LIKE-029 / TC-FEED-045 "화면이 보일 때만 토스트" — ToastController 가시성(W2)에서 검증했다. ViewModel은 결과를 `changes`에 반영하는 것까지 — 근거: bindToastVisibility 테스트
- TC-FEED-057 상세가 열린 채 계정 전환 — 상세 ViewModel은 마운트마다 새로 만들고 계정이 바뀌면 인증 게이트가 화면을 닫는다. 삭제 기억·좋아요 상태의 초기화는 `UserCaches` 항목(DisplayScreen "TC-DISP-049", HomeScreen.likes "계정이 바뀌면")으로 검증 — 근거: 컨테이너 UserCaches
- 핀치 줌 화면 동작 W (TC-FEED-046~048의 W 부분, `feed.photo`, `feed.photo-content`) — jsdom은 PointerEvent의 좌표·멀티터치를 지원하지 않는다. 배율 제한·팬 제한·확대 중심·복귀는 순수 함수 U(photoZoom.test)로 검증하고 화면 연결은 수동/A 확인 — 근거: photoZoom.test
- 사진 렌더 `img` 크기·메이슨리 높이 균형 (TC-DISP-057) — jsdom은 레이아웃을 계산하지 않는다 — 근거: S/수동
- 헤더 접힘 진행도 (TC-DISP-058) — Web 전시 헤더는 접히지 않는 sticky 헤더로 두는 임시 결정이며 지원하지 않는다 — 쟁점 확인 후 재검토

## Web 비해당
- TC-FEED-049, 050, 051, 052 — iOS 전환 애니메이션·뒤로 스와이프·공유 전환 좌표(패리티 매트릭스 "차이") — Web은 라우터 push/pop과 브라우저 뒤로가기
- TC-FEED-053 중 S 부분, TC-DISP-059 — 스냅샷(S)은 W 계층에서 제외 — 시각 회귀 PR
- TC-DISP-057 스냅샷 부분 — 위와 같음

## 범위 밖(다른 계층)
- E (TC-DISP-050, 056 일부, TC-FEED-015 E, TC-LIKE-025 E, TC-LIKE-028 E 등) — 실제 브라우저·오프라인 시나리오는 E2E 계층에서 — E2E 계획
- A 에이전트 시나리오 (TC-DISP-062 AG-DISP-001, TC-FEED-054 AG-FEED-001, TC-LIKE-035 AG-LIKE-001) — 실서버·실기기 필요
- D 드리프트 (TC-DISP-061, TC-FEED-056, TC-FEED-055의 서버 부분) — 개발 서버 호출 — 드리프트 검사 PR
- TC-LIKE-017 속성 테스트(임의 탭 순서 1~9) — 대표 시퀀스(on·off·on, on·off, 두 사진 병렬, 실패 중 의도 변경)로 PostLikeStore.test가 대체한다. 난수 기반 속성 테스트는 도입하지 않는다 — 근거: PostLikeStore.test
- TC-DISP-003 쿼리 생성의 "만들 수 없다" 부분 — 잘못된 값은 요청 자체를 보내지 않고 거절하는 DisplayRepository.test로 검증

## 임시 결정과 확인이 필요한 점 (구현자 참고)
- TC-FEED-028(400 title too long: 서버 message 표시) vs REQ-FEED-024·D-02(message로 분기하지 않는다): `feed.edit.error.state` 문구를 쓰는 쪽으로 테스트했다. 입력을 11자 이상 보낼 수 없으므로 실제로는 도달하지 않는 경로다.
- TC-FEED-030(수정 404 → 상세를 닫고 목록 갱신) vs 기능 문서(not-found 화면): not-found 화면 + removed 이벤트(목록에서 제거)로 테스트했다.
- TC-FEED-036 토스트: 카탈로그의 `nav.post-deleted`와 D-23의 `feed.delete.success`가 같은 문구("게시물을 삭제했어요")다. 테스트는 `feed.delete.success`를 쓴다.
- `display.empty`("이 날 올라온 사진이 없어요") vs `display.empty-exhibition`: 카탈로그 TC-DISP-006에 맞춰 `display.empty`를 쓴다.
- TC-DISP-033: 카탈로그는 `topics__500-server-error` fixture에 "네트워크 연결을 확인해 주세요" 토스트를 적었지만 D-20은 5xx(`display.error`)와 연결 실패(`common.error.network`)를 구분한다. 테스트는 D-20대로 둘로 나눴다.
- TC-DISP-012: 이미 본 (날짜, 정렬)로 돌아가면 캐시를 즉시 보이되 첫 페이지를 조용히 재검증한다(REQ-DISP-030과 일관). 재검증 횟수는 단언하지 않는다.
- TC-DISP-040: 자정 뒤 복귀 시 `today`와 `canGoNext`만 단언한다. 보던 날짜가 어제가 된 뒤의 재검증 정렬은 정하지 않았다(쟁점 1).
- 상세 닫기 fallback: 새로고침·딥링크로 첫 항목이 된 상세(`location.key === 'default'`)의 닫기는 홈으로 `replace`한다 — 근거: REQ-FEED-013("열었던 화면으로 돌아간다")은 앱 안에서 push한 경우의 규칙이고, 딥링크는 출발 화면을 알 수 없어 홈을 임시 도착지로 둔다. 출발 화면을 기억할 수 있게 되면(예: 기록 진입 state) 재검토한다.
- 제목 수정 다이얼로그가 열린 채 KST 자정을 넘기면 저장은 요청 없이 `feed.edit.error.state`를 다이얼로그에 보이고 입력은 유지한다 — 근거: REQ-FEED-017(요청을 보내지 않음) + REQ-FEED-023(실패해도 다이얼로그 유지).
