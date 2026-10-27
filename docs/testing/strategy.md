# 테스트 전략

다섯 클라이언트가 같은 동작을 한다는 것을 **같은 테스트 목록**으로 증명한다. 목록은 [catalog/](catalog/)에 영역별로 있고, 각 플랫폼은 같은 `TC-` ID를 자기 테스트 이름에 넣는다. 스크립트·코드로 확인할 수 있는 것은 전부 자동화하고, 자동화가 어렵거나 실제 기기·실서버에서만 의미가 있는 것만 [agent-scenarios/](agent-scenarios/)에 시나리오로 적어 서브에이전트가 시뮬레이터에서 직접 확인한다.

## 1. 테스트 층과 구분 기호

| 기호 | 층 | 무엇을 | 도구(iOS / Android / Flutter / RN / Web) | 실행 시점 |
| --- | --- | --- | --- | --- |
| `U` | 단위 | ViewModel·UseCase·Repository·유틸의 상태 전이와 계산. Fake Repository, 가짜 시계 | Swift Testing / JUnit + coroutines-test / `flutter test` / Jest / Vitest | 매 PR, 로컬 수 초 |
| `C` | 계약 | API DTO가 공용 fixture를 디코딩·인코딩하는지, 요청 경로·메서드·헤더·바디가 계약대로인지 | 위와 같음 + 공용 fixture | 매 PR |
| `W` | 화면 | 컴포넌트·화면의 상태별 렌더링, 버튼 활성화, 문구, 접근성 라벨, testID | ViewInspector·XCUITest / Compose UI test / widget test / RNTL / Testing Library | 매 PR |
| `S` | 스크린샷 | 상태별 화면 이미지 회귀(플랫폼 안에서만 비교) | swift-snapshot-testing / Roborazzi / golden / — / Playwright `toHaveScreenshot` | 필요할 때 |
| `E` | E2E 스크립트 | mock 서버 + fixture로 고정한 사용자 여정. 앱을 실제로 띄워 탭·입력 | Maestro(모바일 4종 같은 YAML) / Playwright(Web) | 기능 PR 머지 전, 야간 |
| `D` | 개발 서버 스크립트 | 로그인이 필요 없는 공개 API와 계약 확인(`GET /posts`, `/topics`, `/banners`), fixture 드리프트 검사 | `shared/scripts/`(Node 또는 Python) | 하루 1회 / 수동 |
| `A` | 에이전트 시나리오 | 실제 카카오 로그인, 카메라·앨범, 권한 다이얼로그, 실제 푸시, 백그라운드 전환, 네트워크 끊김, 시각 품질 판단 | 서브에이전트가 시뮬레이터 + 개발 서버(`chalkak-dev.pysun.kr`)에서 직접 수행 | 플랫폼 마무리 단계 |

카탈로그의 "구분" 열에는 이 기호를 적는다. 여러 층으로 확인하는 항목은 `U+W`처럼 쓴다. 가장 아래 층(`U`)에서 잡을 수 있는 것은 위 층에서 반복하지 않는다.

### 무엇을 `A`로 미루나

다음 중 하나에 해당할 때만 `A`로 둔다. 나머지는 반드시 `U`~`E`로 자동화한다.

1. 외부 실서비스가 필요하다: 카카오 로그인 화면, 실제 FCM/APNs 푸시 도착, 실제 S3 업로드 후 서버 이미지 처리·검수(관리자 승인은 사람이 해야 함).
2. OS UI가 끼어든다: 권한 다이얼로그, 시스템 카메라, 시스템 사진 선택기, 시스템 설정 화면 이동, 공유 시트.
3. 사람의 판단이 필요하다: 필터 결과가 자연스러운가, 줌·스와이프 제스처 감각, 레이아웃이 깨지지 않는가.
4. 장시간·실시간: AI 리뷰 실제 완료(수 분), KST 자정 경계 실시간 통과.

## 2. 테스트하기 쉬운 코드 규칙(모든 플랫폼)

- 의존성은 생성자 주입. 네트워크, 토큰 저장소, 시계(`Clock`/`now()`), UUID·nonce 생성기, 이미지 인코더, 푸시 토큰 공급자, 분석 전송, 권한 조회를 인터페이스 뒤에 둔다.
- 화면(View)은 상태를 그리기만 한다. 상태 전이와 분기는 ViewModel(또는 동등한 계층)에 있고 `U`로 검증한다.
- Fake 우선. mock 라이브러리로 호출 순서를 검증하는 테스트는 분석 이벤트·"API를 부르지 않았다" 같은 요구사항일 때만 쓴다.
- 시간 의존 로직(폴링 3초·300초, 업로드 URL 만료, 토스트 2.5초, 스플래시 700ms, KST 자정)은 가짜 시계로 테스트한다. 실제로 기다리는 테스트를 만들지 않는다.
- 모든 상호작용 요소에 [testids.md](testids.md)의 식별자를 단다(iOS `accessibilityIdentifier`, Compose `testTag` + `testTagsAsResourceId`, Flutter `Semantics(identifier:)`/`Key`, RN `testID`, Web `data-testid`). Maestro flow 하나가 모바일 4종에서 같이 돈다.
- 빌드 설정으로 base URL을 mock 서버로 바꿀 수 있어야 한다(`API_BASE_URL`). 카카오 로그인은 `SocialLoginClient` 인터페이스 뒤에 두고, E2E 빌드에서는 fixture `idToken`을 돌려주는 Fake로 바꾼다.

## 3. 테스트 이름과 추적

- 테스트 이름이나 표시 이름에 `TC-` ID를 넣는다. 예: Kotlin `` `TC-LIKE-003 실패하면 이전 상태로 되돌리고 토스트를 띄운다`() ``, Swift `@Test("TC-LIKE-003 ...")`, Dart `test('TC-LIKE-003 ...')`, JS `it('TC-LIKE-003 ...')`.
- Maestro flow 파일명: `shared/maestro/<영역>/TC-UPL-020-upload-happy-path.yaml`.
- 플랫폼별 커버리지는 [parity-matrix.md](parity-matrix.md)에 기록한다. 칸 값: `✓`(자동 테스트 있음), `A✓`(에이전트 시나리오 통과), `차이(링크)`, 빈칸(미구현). 구현 스레드는 PR마다 자기 열을 갱신한다.
- 스크립트로 커버리지를 검사한다: `shared/scripts/check-tc-coverage`가 카탈로그의 `TC-` ID와 각 플랫폼 테스트 소스의 ID를 대조해 빠진 ID를 출력한다(구현 1주차에 만든다).

## 4. 공용 자산(`shared/`)

| 경로 | 내용 | 만드는 시점 |
| --- | --- | --- |
| `shared/fixtures/<영역>/*.json` | 시나리오별 서버 응답. 파일명은 `<api>__<상황>.json`(예: `posts-today__posted-pending.json`). 오류는 `{errorCode, message}` | 해당 영역 첫 PR |
| `shared/fixtures/manifest.json` | fixture → 메서드·경로·HTTP 상태 대응 | 같음 |
| `shared/mock-server/` | fixture를 시나리오별로 돌려주는 mock 서버(Prism + 라우팅 스크립트, presigned PUT 수신 포함). `?scenario=` 또는 관리 API로 시나리오 전환 | 첫 E2E 전 |
| `shared/openapi/chalkak-dev.json` | 개발 서버 OpenAPI 스냅샷. `D` 스크립트로 갱신·차이 검사 | 첫 PR |
| `shared/maestro/` | 모바일 E2E flow | 기능별 |
| `shared/constants.json` | [00-overview §6](../spec/00-overview.md#6-다섯-클라이언트-공통-상수) 상수 | 첫 PR |
| `shared/copy/ko.json` | 사용자 문구 키-값. 테스트는 이 표의 값으로 문구를 검증 | 기능별 |
| `shared/photo-edit/filters.json` | 필터 행렬·조정 상수(D-13) | EDIT 영역 PR |
| `shared/scripts/` | fixture 스키마 검증, TC 커버리지 검사, 개발 서버 공개 API 스모크 | 첫 주 |

fixture는 OpenAPI 스냅샷으로 스키마를 검증한다. 플랫폼 테스트는 `shared/fixtures`를 읽어 쓰고 복제하지 않는다(경로 상대 참조 또는 빌드 시 복사).

## 5. PR 단위 TDD 사이클과 검증 순서

각 기능(또는 화면) PR은 다음을 따른다.

1. **테스트 작성**(서브에이전트): 카탈로그에서 그 PR 범위의 `TC-`를 고르고 `U`·`C`·`W` 테스트를 먼저 쓴다. 필요한 fixture를 `shared/fixtures`에 추가한다. 이 시점에 테스트는 실패해야 한다.
2. **구현**(서브에이전트): 테스트를 통과시키는 최소 구현. 공통 상수·문구는 공용 자산에서 가져온다.
3. **스크립트 검증**: 플랫폼 린트·포맷·단위·화면 테스트, `check-tc-coverage`, 해당되면 Maestro/Playwright flow.
4. **코드 리뷰**(서브에이전트): 스크립트로 못 보는 것. 테스트하기 쉬운 구조인가(의존성 주입, View에 로직 없음), 클린 코드·객체지향, 맥락을 봐야 아는 예외 처리(취소, 늦은 응답, 연타, 계정 전환, 백그라운드), [decisions.md](../spec/decisions.md) 위반, 공통 상수·문구 하드코딩.
5. 리뷰 반영 후 3을 다시 돌리고 머지. 패리티 매트릭스 갱신.

## 6. 개발 서버 E2E(마지막 단계)

- 대상: `https://chalkak-dev.pysun.kr/api/v1/`. 테스트 계정은 사용자가 대화로 준 카카오 계정을 쓰며 **레포·문서·로그에 적지 않는다.** 에이전트는 실행 시 환경변수나 대화에서 받는다.
- 개발 서버는 실제 데이터라 되돌릴 수 없는 동작이 있다: 게시물 작성(주제당 1장), AI 리뷰 요청(게시물당 3회), 탈퇴. 시나리오에 "되돌릴 수 없음"을 표시하고, 탈퇴 시나리오는 사용자 확인 없이 실행하지 않는다.
- 클라우드 컨테이너의 `curl`은 프록시 때문에 개발 서버에 닿지 않는다(WebFetch는 됨). 개발 서버 E2E는 사용자 Mac의 시뮬레이터에서 돌린다.

## 7. 기존 테스트에서 가져올 것

기존 iOS(단위 약 425, UI 24), Android(단위 약 480, 계측 약 230) 테스트의 검증 내용을 카탈로그에 흡수했다. 각 `TC-`의 "기존" 열에 출처(`iOS:FeedFeatureTests L64`, `AN:FeedViewModelTest` 등)를 적었다. 기존 테스트 목록 원문은 [legacy-ios §4](../reference/legacy-ios.md)와 [legacy-android §4](../reference/legacy-android.md)에 있다. 기존 테스트가 없던 영역(푸시 수신·등록, 알림 상세, 약관, 분석, 카카오 클라이언트, 라우팅 통합)은 카탈로그에 새로 넣었다.
