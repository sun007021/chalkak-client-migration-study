# W7b 보류·제외 TC (사진 편집기: 자르기·회전·조정·필터·자동 보정)

형식: TC — 이유 — 예정 PR/근거

W7b는 편집기 본체(순수 연산, ViewModel, 화면, `CanvasEditRenderer` 포트 계약, 컨테이너 배선)까지 jsdom에서 검증한다. 실제 canvas 픽셀·브라우저 제스처는 구현 단계에서 Playwright로 확인한다.

## 다룬 TC (테스트 파일)
- TC-EDIT-001, 003 ~ 009, 011 ~ 012, 014 ~ 015, 018, 021, 022, 030 ~ 032, 037, 045 — `editor/PhotoEditorViewModel.*.test.ts`
- TC-EDIT-002, 013(W), 023(W), 039(W) — `editor/PhotoEditorScreen.test.tsx`
- TC-EDIT-004 ~ 006, 011 — 업로드 화면과 이어 붙인 흐름은 `app/container.editor.test.tsx`
- TC-EDIT-010, 020 — `editor/editPipeline.test.ts`(PhotoPreparer + CanvasEditRenderer), `editor/CanvasEditRenderer.test.ts`
- TC-EDIT-013, 015 ~ 020 — `editor/cropGeometry.test.ts`
- TC-EDIT-023 ~ 029 — `editor/adjustments.test.ts`, `editor/colorPipeline.test.ts`
- TC-EDIT-033 ~ 036 — `editor/autoAdjust.test.ts`
- TC-EDIT-038 — `editor/rulerScale.test.ts`
- TC-EDIT-039 ~ 044 — `editor/filters.test.ts`
- TC-EDIT-046 — `editor/CanvasEditRenderer.test.ts`(Fake 표면 위의 픽셀 함수 호출 순서와 결과)

## 골든 데이터가 없어 직접 계산한 것
`shared/photo-edit/filters.json`과 `edit/golden/*.json`은 저장소에 없다(shared 수정 금지). 카탈로그가 골든 파일을 쓰는 TC-EDIT-024 ~ 029, 033, 034, 036, 039 ~ 046은 부록 수식으로 직접 기대값을 계산해 테스트에 상수로 넣고 계산 근거를 주석으로 남겼다.
- 필터 행렬 값은 `filters.test.ts`가 부록 표를 옮긴 상수와 비교한다. 상수는 `editor/editConstants.ts`(`editConstants()`)가 단일 근거이고, shared 파일이 생기면 그 값과 대조하는 테스트를 더한다 — shared 골든 PR
- 골든 파일 기준 ±2/255 허용 오차는 그대로 쓴다. 자동 보정은 소수 둘째 자리(±0.005)로 비교한다.
- TC-EDIT-044(그리면서 입히는 경로 vs 픽셀 루프) — 웹은 경로가 하나(픽셀 루프)라 "조정 0 + 필터" 파이프라인이 필터 단독 적용과 ±1 이내로 같은지로 바꿔 검증했다 — 해당 없음(웹은 경로 하나)

## 실제 canvas/브라우저가 필요한 것
- TC-EDIT-009 중 "EXIF 방향 6 사진이 정방향으로" — `FakeImageDecoder`는 이미 보이는 방향 크기를 준다. 4096 상한과 편집기가 그 크기를 쓰는 것만 jsdom에서 검증. 실제 EXIF 반영은 `BrowserImageDecoder` 구현 후 — 업로드 구현 PR/E2E
- TC-EDIT-010 중 "EXIF는 회전만 반영된 뒤 제거" — 실제 디코더·인코더 필요. 압축 1회와 편집 결과를 그대로 압축하는 것만 검증 — E2E
- TC-EDIT-016, 020 중 실제 픽셀 크기 — 계산(`planGeometry`)과 Fake 표면까지. 실제 canvas 그리기(`createCanvasPixelSurface`, `CanvasPreviewRenderer`, `CanvasAutoAnalyzer`)는 구현 단계에서 Playwright로 확인 — 편집기 구현 PR
- TC-EDIT-046 중 "실제 이미지 파이프라인" 골든 비교 — Fake 표면 위의 호출 순서·픽셀 함수 결과까지. 실제 canvas 출력 비교는 E2E — 편집기 구현 PR
- TC-EDIT-009 중 "큰 사진(8000×6000)이 실제로 4096 이하로 디코드" — `BrowserImageDecoder` 구현 PR(TC-UPL-035와 같은 건)

## 웹에 해당하지 않거나 구조가 달라 바꾼 것
- TC-EDIT-007(도구 화면이 열려 있을 때 편집 완료·취소 입력 무시) — iOS의 도구별 하위 화면(Mantis)용이다. 웹은 하위 화면 없이 탭이라 "완료를 눌러 마지막 렌더를 기다리는 동안(`confirming`) 완료·취소·도구 조작을 무시"로 바꿔 검증했다 — 플랫폼별 허용 차이(편집기 구조)
- TC-EDIT-022 중 "자르기 취소는 회전·비율 변경을 버리고 이전 자르기를 유지" — 자르기 하위 화면이 없다. 웹의 "취소"는 이번 편집 전체 폐기(`TC-EDIT-004/005/045`)라 부분 취소는 없다. 자르기를 마친 뒤 잘린 이미지로 미리보기·썸네일을 다시 만드는 것은 검증 — 플랫폼별 허용 차이
- TC-EDIT-032 중 "조정 취소는 들어가기 전 강도·항목 값으로" — 같은 이유. 웹의 "취소"는 전체 폐기다 — 플랫폼별 허용 차이
- TC-EDIT-045(필터 화면에서 취소하면 들어가기 전 필터) — 같은 이유로 전체 폐기로 검증(`TC-EDIT-045`는 취소 시 확정값이 나가지 않는 것까지) — 플랫폼별 허용 차이
- TC-EDIT-038 중 "단위당 400dp, 기준값 근처 멈춤(햅틱)" — 눈금자 모양은 웹이 자유(`input type=range`)다. 수치 함수(`rulerScale`)만 U로 검증하고 화면은 키보드 스텝(1, 10, 끝)·표시값만 검증한다. 키보드 스텝은 기준값에서 멈칫하지 않는다. 햅틱은 웹에 없다 — 해당 없음(웹 슬라이더)
- TC-EDIT-021 `straightenDegrees` — 웹의 `PhotoEdit`에는 이 필드가 없다(항상 0과 같다). 편집값에 키가 없고 화면에 조작이 없는 것으로 검증

## 실제 기기·사람 확인
- TC-EDIT-047(S 스냅샷) — 스냅샷은 W 계층에서 제외 — 시각 회귀 PR
- TC-EDIT-048(A, 플랫폼 간 평균 ΔE ≤ 3) — 수식 일치는 U 골든으로, 시각 비교는 사람 — 구현 후 스크린샷 비교
- TC-EDIT-049(A, 필터 6종의 분위기), TC-EDIT-050(A, 프레임 끌기 감각), TC-EDIT-051(A, 눈금자 디텐트·햅틱) — 실기기 확인 — A 에이전트 시나리오

## 명세 충돌·판단이 필요한 것
- TC-EDIT-012("회전·자르기·조정·필터가 바뀐 상태에서 '초기화' → 모두 기본값") ↔ REQ-EDIT-016/024(자르기 초기화는 회전·자르기만, 조정 초기화는 조정만, 필터는 유지) — 요구사항을 따랐다. 테스트는 자르기 초기화(필터·조정 유지), 조정 초기화, 필터 원본 선택을 모두 거치면 `isIdentity`가 되는 것으로 검증 — 백엔드/기획 확인 대상(카탈로그 문구 정정 필요)
- TC-EDIT-028("톤 곡선은 어떤 조합에서도 0에서 시작해 1로 끝") ↔ TC-EDIT-027·부록(블랙 포인트 -1은 출력 최소값을 0.3까지 띄움) — 블랙 포인트가 음수이면 시작값은 `0.3 × (−v)`이다. 부록을 따라 끝이 1이고 줄어들지 않는 것, 시작값이 outputBlack인 것으로 검증 — 카탈로그 문구 정정 필요
- TC-EDIT-003("원본 크기로 한 번만 반영하고(렌더 1회)") ↔ REQ-EDIT-002(편집기는 편집값만 만들고 픽셀은 업로드 준비가 다시 그림) — 카탈로그가 허용한 "렌더 대신 편집값만 넘기는 구현"을 택했다. 편집기의 "완료"는 `EditRenderer`를 부르지 않는다. REQ-EDIT-006의 렌더링 실패 알림은 "마지막 미리보기 렌더 실패"로 정했다 — 임시 결정(편집기 구현 PR에서 확인)
- 편집기 "완료" 비활성 — 명세는 항상 활성(확인 필요 절)이지만, 웹은 사진을 읽는 동안·렌더 대기 중·오류 알림이 열려 있는 동안은 비활성이다 — 임시 결정
- 필터 썸네일 크기(`FILTER_THUMBNAIL_LONG_EDGE` = 96), 눈금자 기준값 멈칫 범위(`RULER_DETENT_RANGE` = 0.03), 자르기 도구에서 미리보기를 자르지 않은 사진으로 그리는 것 — 명세에 값이 없어 임시로 정했다 — 편집기 구현 PR
- 자유 비율에서 일부만 자른 영역을 회전하면 영역이 사진과 함께 돈다(REQ-EDIT-015는 "원본 비율 또는 전체인 자유"만 말함) — 임시 결정

## 테스트가 W7a 구현에 기대는 것
`container.editor.test.tsx`의 업로드 화면 흐름(TC-EDIT-004 ~ 006, 011, 003)과 `editor/editPipeline.test.ts`는 W7a의 `UploadScreen`·`PhotoPreparer`·`isIdentityEdit`/`sameEdit`이 구현돼야 통과한다(지금은 그 스텁 때문에 실패). 편집기 쪽 단위 테스트는 W7a 구현과 무관하다. `PhotoEditorViewModel.confirm.test.ts`·`.crop.test.ts`·`.lifecycle.test.ts`의 일부(`isIdentityEdit`, `sameEdit` 사용)는 W7a의 `editModel.ts` 구현이 필요하다.
