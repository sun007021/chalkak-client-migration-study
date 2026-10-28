# W5 보류·제외 TC (홈·배너)

형식: TC — 이유 — 예정 PR/근거

## 다른 PR로 넘기는 것
- 랭킹·인기 좋아요 (REQ-HOME-033, `home.ranking-like-*`, `home.popular-like-*`) — 좋아요 동작은 좋아요 PR — 좋아요 PR
- AI 폴링·시트·상세 (REQ-HOME-036/037, D-03) — W5는 상태 표시·요청 API·이동 인자까지 — AI 리뷰 PR
- 푸시 처리 (REQ-HOME-044, REQ-HOME-045 푸시 부분, TC-HOME-051 푸시 부분) — Web은 푸시 없음, 알림 PR에서 재검토 — 알림 PR
- 게시물 삭제·제목 변경 이벤트 반영 — 전시·피드 화면이 생길 때 — 전시/피드 PR
- 전시·기록·피드·알림함 화면 본체 (TC-HOME-021/022/023/031/048/049의 E 부분) — 이동 경로·인자만 검증 — 각 화면 PR
- TC-HOME-055/056 이미지 파이프라인·개별 이미지 오류 — 공통 이미지 컴포넌트 PR — 이미지 PR
- TC-HOME-044 — ViewModel이 마운트마다 생성되므로 dispose 후 새 ViewModel로 대체 검증 — 근거: HomeViewModel.lifecycle.test

## Web 비해당
- TC-HOME-058, 059, 060 — 앱 전용 동작(백그라운드 복귀·딥링크·네이티브 제스처)으로 Web에 대응 없음 — 근거: web 차이 목록
- TC-BANR-018/019(일부), 020, 022, 025 — 인앱 웹뷰·`issue` 화면 전환 — Web은 새 탭으로 열고 `issue` screen_view를 보내지 않음
- TC-BANR-024/026/027/028 E, TC-BANR-030, 031 — 웹뷰 전용 — 근거: 배너는 `ExternalLinkOpener`(https만, 새 탭)
- TC-BANR-017 웹뷰 부분 — https 판정만 테스트
- 배너 선읽기 트리거(W) — jsdom에 IntersectionObserver가 없음 — BannerFeed U 테스트로 대체
