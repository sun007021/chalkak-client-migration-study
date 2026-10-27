# W1(공통 인프라) 테스트에서 제외한 TC

형식: TC ID — 이유 — 예정 PR. 화면·기능 영역이 있어야만 확인되거나, 이 PR 범위 밖 구분(E·A)이다.

## 제외 (W1 테스트 없음)

- TC-NET-060 — E: mock 서버(`shared/mock-server`)와 홈 새로고침 화면이 필요 — 홈 PR(E2E)
- TC-NET-061 — A: 실제 비행기 모드·Wi-Fi 전환(에이전트 시나리오 AG-NET-001) — 최종 시뮬레이터 E2E
- TC-NET-062 — A: 배포 웹 오리진 CORS(AG-NET-002) — 배포 후 에이전트 점검
- TC-ANL-003 — 로그인·약관·사인·미리보기 화면이 있어야 진입 시점을 확인 — 인증 PR
- TC-ANL-004 — 설정의 사인 변경 화면 필요 — 설정 PR
- TC-ANL-005 — 메인 탭 4개 화면 필요(공통 훅은 `useScreenView`로 TC-ANL-018에서 검증) — 홈·메인 셸 PR
- TC-ANL-006 — 홈에서 알림·알림 상세·배너 웹 화면 필요 — 홈·알림 PR
- TC-ANL-007 — 게시물 상세 진입 경로(Feed/FeedById 푸시) 필요 — 전시·피드 PR
- TC-ANL-008 — 업로드·성공 화면 필요 — 업로드 PR
- TC-ANL-009 — 피드백 화면 필요 — 설정·피드백 PR
- TC-ANL-011 — 약관 문서 시트 필요 — 인증(약관) PR
- TC-ANL-016 — 게스트 제한 토스트가 있는 기록 탭 필요([결정 필요]: 미전송 임시안) — 메인 셸 PR
- TC-ANL-023 — `shared/constants.json`이 아직 없음(TC-ANL-002 철자 검증은 `screenNames.test.ts`로 대체) — shared 생성 후 대조 스크립트
- TC-ANL-024 — E: Playwright 여정과 tracker 로그 수집 — 메인 셸 PR(E2E)
- TC-TIME-006 — 홈·전시·주제 요청의 date 쿼리는 해당 API 클라이언트가 필요(쿼리 직렬화는 TC-NET-053) — 홈/전시 PR
- TC-TIME-008 — 서버 400 "미래의 주제" 응답 시 전시 유지·토스트(전시 ViewModel) — 전시 PR
- TC-TIME-010 — 주제 없음(404) 이동 시 전시 유지·빈 상태 — 전시 PR
- TC-TIME-017 — 업로드 진입 때 topicDate 고정 — 업로드 PR
- TC-TIME-018 — GET /posts/today 응답 topicDate 신뢰(DTO·홈) — 홈 PR
- TC-TIME-019 — 서버 phase 신뢰(주제 DTO·홈) — 홈 PR
- TC-TIME-020 — 인접 주제 경계 홈 표시 — 홈 PR
- TC-TIME-021 — 404 NoOpenTopic 상태 — 홈 PR

## 일부만 검증 (나머지는 해당 기능 PR에서 이어서)

- TC-NET-046, TC-NET-047 — 오류 표시 선택(`decideErrorPresentation`)·토스트·`ErrorState`까지. 실제 화면의 콘텐츠 유지·온라인 복귀 재시도는 각 화면 PR.
- TC-NET-032 — 재시도 없음·세션 불변까지. 호출 API별 D-08 문구는 인증·업로드 등 기능 PR.
- TC-NET-035, TC-NET-053 — 일반 문구 폴백·쿼리 직렬화까지. 영역별 문구(`fallback`)와 `sort` 소문자 값 생성은 기능 PR.
- TC-NET-056, TC-NET-057 — 공용 `StaleGuard`와 갱신 중 계정 전환(`AuthCoordinator`)까지. 각 ViewModel에서 가드를 쓰는지는 기능 PR.
- TC-TIME-007, TC-TIME-013, TC-TIME-016 — 날짜 유틸(선택 가능 범위, 주간·월 경계, 자정 감지)까지. 피커 UI·두 달 데이터 병합·기록 탭 현재 달은 기능 PR.
- TC-TIME-014, TC-TIME-015 — `MidnightWatcher`까지. 홈 재로드 연결은 홈 PR.
- TC-TIME-030 — 토스트 2.5초를 가짜 시계로 검증. 스플래시·폴링·가입 재시도·업로드 마진은 각 PR(업로드 마진은 `MonotonicDeadline`로 TC-TIME-027).
- TC-ANL-010 — 허용 목록에 약관 문서 이름 포함까지. 화면별 구분 전송은 인증·설정 PR.
- TC-NET-051 — `http` 기준 주소는 생성 시 거부(ApiClient 생성자)로 검증. 헤더 단계의 별도 http 분기는 두지 않음.
