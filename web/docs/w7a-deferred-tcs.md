# W7a 보류·제외 TC (사진 업로드: 진입 게이트·업로드 화면·제출·성공 화면)

형식: TC — 이유 — 예정 PR/근거

W7a는 편집기 본체를 만들지 않는다. 편집값 모델(`PhotoEdit`), `EditRenderer`(기본 항등), 편집기 연결점(`photoEditor`, `editorEnabled`, `requestEdit`)까지만 검증한다.

## 편집기(W7b)로 넘기는 것
- TC-EDIT-001 ~ 051 전부 — 편집 화면 본체(자르기·조정·필터·자동 보정·렌더링·골든)는 W7b 범위다. W7a의 `container.photoEditor`는 null이고 연결점만 Fake 편집기(`createFakePhotoEditor`)로 확인한다 — W7b
  - TC-EDIT-004(처음 고른 사진 취소) — 편집기 안의 취소 입력은 W7b. 업로드 쪽 효과(선택 취소, 준비 요청 없음)는 UploadViewModel.select.test("first 편집기를 취소하면…")와 UploadScreen.test("편집기에서 취소하면 선택이 취소된다")가 검증 — W7b가 편집기 쪽을 검증
  - TC-EDIT-005(다시 편집 취소) — 업로드 쪽 효과(이전 사진·편집값·준비 유지)는 UploadViewModel.select.test("requestEdit은 …취소하면 편집기만 닫는다") — W7b가 편집기 쪽을 검증
  - TC-EDIT-006(사진 탭으로 재편집) — 연결점은 UploadScreen.test("미리보기를 누르면 확정한 편집값으로 편집기가 다시 열리고…")·select.test(같은/다른 편집값 재확정, REQ-UPL-035). 편집기 안 상태 복원은 W7b
  - TC-EDIT-011(`isIdentity`면 재그리기 생략) — 판정은 editModel.test(isIdentityEdit, CROP_EPSILON)·PhotoPreparer.test("편집하지 않은 사진은 renderer를 부르지 않고…")가 검증. 편집기 화면의 완료 처리는 W7b
  - TC-EDIT-003, 008, 009, 010, 020 — 편집 렌더링 파이프라인(EditRenderer 실제 구현·canvas)은 W7b. W7a는 `EditRenderer` 인터페이스와 항등 기본값, 렌더링 실패가 준비 실패(`upload.error.prepare`)가 되는 것까지 — W7b
  - TC-EDIT-024 ~ 029, 033 ~ 036, 040 ~ 044, 046, 048(골든·색 변환·자동 보정) — 순수 수식 U는 W7b에서 `shared/photo-edit` 골든과 함께
  - TC-EDIT-047(스냅샷 S), 048(A), 049 ~ 051(A 에이전트) — 스냅샷은 W 계층에서 제외, 실기기 확인은 A — 시각 회귀 PR/사람 확인

## 웹에 해당하지 않아 제외
- TC-UPL-016(촬영본 앨범 저장 한 번), TC-UPL-017(앨범 사진 재저장 금지), TC-UPL-018(저장 실패 토스트), TC-UPL-019(화면 닫은 뒤 저장 실패 토스트) — 웹은 `<input capture>`의 결과 파일을 사진 선택과 같이 쓰고 기기 앨범에 저장하지 않는다(패리티 매트릭스 "차이"). 따라서 `upload.camera.save-failed`, `upload.gallery-save-failed`, `upload.no-save-capture`, `upload.permission.*` 문구는 W7a에서 쓰지 않는다 — 해당 없음
- TC-UPL-022(OS 카메라·사진 추가 권한 다이얼로그, A) — 웹은 브라우저가 권한을 처리하고 앱이 다이얼로그를 그리지 않는다. testid `upload.camera-permission-dialog`, `upload.camera-permission-settings-button`, `upload.camera-permission-shoot-button`, `upload.camera-permission-cancel-button`은 만들지 않는다 — 해당 없음
- TC-UPL-031·050의 "임시 파일 삭제" — 웹에는 임시 파일이 없다. 디코드한 이미지의 `release()`(성공·실패·취소 모두)와 미리보기 blob URL의 revoke로 대응하고 UploadViewModel.select/submit.test, PhotoPreparer.test, UploadScreen.test에서 확인한다 — 대응 방식 차이
- TC-UPL-087(KST 날짜의 API/표시 변환) — 성공 화면에 날짜를 표시하지 않는다(주제 제목만). API 파라미터는 진입 때 고정한 `yyyy-MM-dd`(TC-UPL-013에서 검증)이고 기기 시간대와 무관하다 — 표시 형식은 해당 없음

## 실제 디코더·인코더(canvas/WASM)가 필요한 것
jsdom에는 canvas·createImageBitmap이 없다. 포트(`ImageDecoder`, `WebpCompressor`, `EditRenderer`) 뒤의 순수 로직(크기 계산, 품질 사다리, WebP 바이트 검사, 폴백 금지)만 W7a에서 검증한다.
- TC-UPL-035(큰 소스에서 전체 해상도 비트맵을 만들지 않고 목표 크기만 전달) — `BrowserImageDecoder` 구현 후 브라우저 환경 테스트 — 업로드 구현 PR/E2E
- TC-UPL-036(EXIF 방향 1~8 마커 배치, 출력에 방향 태그 없음) — 실제 디코더가 필요. 출력 방향 태그/메타 청크 부재는 `inspectWebp`(EXIF·XMP·ICCP)가 검증 — E2E
- TC-UPL-040, 041(실제 인코더 속성·PSNR), TC-UPL-044(PNG 알파·HEIC 등 형식별 실제 디코드) — 실제 인코더 필요. 사다리·라운드 크기·상한은 postImageEncoder.test/imageSizing.test가 Fake 압축기로 검증 — E2E
- TC-UPL-043 중 움직이는 GIF·WebP 입력의 "첫 프레임만" — 실제 디코더 필요. 인코더 출력에 `ANIM`/`ANMF`가 있으면 `NotWebpError`로 막는 것은 검증 — E2E
- TC-UPL-045 중 "같은 입력의 두 번째 인코딩 바이트가 같다(결정성)" — 실제 인코더 필요. 편집 없는 사진이 `EditRenderer`를 거치지 않는 것은 검증 — E2E
- TC-UPL-054 중 "본문 바이트 해시가 로컬 파일과 같다(mock S3 수신)", TC-UPL-055 E 부분 — 메서드·헤더·본문 Blob 동일성은 U/C로 검증. 해시는 mock 서버가 필요 — E2E
- TC-UPL-032 중 실제 canvas가 WebP를 만들지 못하는 환경의 WASM 대체 — `selectWebpBackend`(canvas → wasm → null, PNG/JPEG 폴백 없음)와 정적 검사(noFallbackFormat.test)까지 — 업로드 구현 PR

## 명세 충돌·판단이 필요한 것
- TC-UPL-065 — 카탈로그는 `POST /posts` 404 "업로드한 사진을 찾을 수 없습니다."에서 서버 message를 보이라고 한다. 이는 features/upload-edit.md와 D-02(서버 message로 분기하지 않음, 표시도 400 "그 밖"만)와 충돌한다. W7a는 기능 문서를 따른다: 404는 두 경우 모두 `upload.error.create`, 준비물을 버려 다음 제출이 정책 발급부터이며 `/posts/today`를 조회하지 않는다. 주제 없음 404의 "주제 변경" 문구는 쓰지 않는다 — 백엔드/규칙 확인 대상 (UploadViewModel.errors.test "TC-UPL-065")
- TC-UPL-072(같은 uploadId로 59분 59초 뒤 재제출은 전송, 61분 뒤 서버 400) — REQ-UPL-041/050은 정책 수명 5분(안전 여유 5초)이 지나면 새 정책을 받는다고 정했다. 59분 뒤에 같은 uploadId를 쓰는 경로는 없다. 서버가 `uploadId` 점유를 1시간 유지하는 것(UPLOAD_ID_CLAIM_TTL_MS)은 서버 동작이고, 400 업로드 만료 문구가 오면 서버 message를 보이고 정책부터 다시 하는 것은 TC-UPL-064로 검증 — 규칙 확인 대상
- TC-UPL-077(오프라인 제출 → 복귀 후 성공) — E2E. 연결 실패 문구·같은 uploadId 재제출은 UploadViewModel.errors.test(TC-UPL-055, 070) — E2E 계획
- TC-UPL-086 중 브라우저 실제 뒤로가기(E) — 라우터 replace 이동과 뒤로가기가 업로드·성공 화면이 아닌 홈으로 가는 것은 UploadSuccessScreen.test 흐름 테스트(memory router)로 검증 — E2E
- TC-UPL-090 중 실제 기기(E) — memory router로 설정 탭 → + → 닫기 복귀를 UploadEntry.screen.test가 검증 — E2E
- 이탈 확인 대화상자 — 명세에 이탈 확인 문구/동작이 없다. 닫기는 확인 없이 떠나고 진행 중 작업은 취소한다(TC-UPL-031, 079). 필요하면 문구를 정한 뒤 추가 — 규칙 확인 대상

## 테스트가 가정한 화면 계약 (구현 시 확인)
- 오류 문구는 토스트가 아니라 `upload.error-message`에 인라인으로 보인다. 진입 게이트의 실패는 토스트다 — features/upload-edit.md 문구표 기준
- 글자 수 표시(`upload.title-counter`)는 "n/10" 형식으로 가정했다(공백 제거 후 code point 수)
- 미리보기 비율은 `style.aspectRatio = "가로 / 세로"`(EXIF 반영 후 4096 상한을 적용한 크기)로 확인한다
- 앨범/카메라 file input은 testid가 없어 `upload.album-button`, `upload.camera-button` 라벨 안에 둔다. 카메라 버튼은 `capture`를 지원하고 터치 기기일 때만 보인다(`detectCameraCapture`)
- 업로드 성공 화면은 업로드 화면을 replace하고 "확인했어요."는 결과를 비운 뒤 `/display?date=<topicDate>&sort=recent`로 replace한다(임시 결정: 방금 올린 사진이 보이는 최신순)
- `PostChange`에 `created`를 더했다: 홈은 히어로를 곧바로 갱신(VALIDATING → processing, PENDING → 검수 대기 사진), 전시는 그 날짜의 낡은 캐시를 버리고 지금 보는 날짜면 조용히 첫 페이지를 다시 받는다
- 사진 PUT은 D-21 재시도(0.5초, 1초, 최대 2회)를 탄다: `PresignedUploader.put`에 선택 옵션 `retry`를 더했다(기본 false, 사인 업로드는 그대로)

## 범위 밖(다른 계층)
- A 에이전트 시나리오 (TC-UPL-091 AG-UPL-001, TC-UPL-092 AG-UPL-003) — 실서버·실기기·실제 사진 필요
- S 스냅샷 (TC-UPL-089의 S 부분) — 시각 회귀 PR
- D 드리프트 — 개발 서버 호출은 드리프트 검사 PR
