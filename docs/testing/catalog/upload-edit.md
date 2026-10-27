# 테스트 카탈로그: 사진 업로드·편집(UPL, EDIT)

업로드 진입 게이트, 사진 선택·촬영, WebP 인코딩, presigned PUT 업로드, 게시물 생성, 성공 화면(UPL)과 사진 편집(자르기·회전, 조정, 필터, 자동 보정)(EDIT)의 동작을 다섯 클라이언트가 같게 만드는 테스트 목록이다. 서버 오류는 `message` 문자열이 아니라 errorCode·HTTP·호출 API로 분기하고, `POST /posts`가 400이면 `GET /posts/today`로 판정한다(D-02). 응답 유실은 자동 재시도 없이 `GET /posts/today`로 복구한다(D-07). 제목은 strip 후 code point 10자(D-01), 업로드 URL은 만료 5초 전이면 새로 발급하고 업로드 ID는 1시간까지 유효하다(POST-004). WebP 인코더는 고정 입력 이미지로 헤더(RIFF/WEBP)·청크·크기 사다리·품질 사다리를 U에서 검증하며, 인코더 자체의 손실 압축은 `Compressor` 인터페이스 뒤의 가짜 구현으로 사다리 로직을 결정적으로 검증하고 실제 인코더는 속성(헤더, 용량, 치수, 디코드 가능)으로만 검증한다(플랫폼마다 인코더 구현이 달라 바이트 일치는 요구하지 않는다). 편집 색 계산은 `shared/photo-edit/filters.json`과 골든 픽셀 값(허용 오차 ±2/255)으로 다섯 플랫폼이 같은 수식을 쓰는지 U에서 대조한다(D-13). 업로드 E2E는 mock 서버가 presigned PUT을 받는다는 전제다(strategy §4). 기존 iOS `PhotoUploadFeatureTests`·`PhotoEditFeatureTests`와 Android `PhotoUploadViewModelTest`·`PostCreationRepositoryImplTest`·`PhotoEditViewModelTest`·`CropGeometryTest`·`PhotoColorGoldenTest` 등의 검증을 흡수했다. 기준일은 오늘 KST = 2026-10-27(화)이고 fixture 열은 `shared/fixtures/` 기준 상대 경로다. A는 실제 카메라·앨범·S3·서버 처리, 편집 시각 품질·제스처 감각만 둔다.

## UPL 업로드

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-UPL-001 | Given 게스트 / When 업로드(+) 버튼 탭 / Then 토스트 "게시물을 추가하려면 로그인이 필요해요"가 뜨고 네트워크 요청이 0건이며 업로드 화면이 열리지 않는다 | D-05, D-14-1 | U+E | - | iOS:chalkakUITests L168 / AN:PhotoUploadEntryGateViewModelTest |
| TC-UPL-002 | Given 로그인·오늘 미작성 / When + 버튼 탭 / Then `GET /posts/today` 1회 후 `isPosted=false`면 업로드 화면이 열리고 응답 `topicDate`가 화면에 고정된다 | POST-011, D-14-1, P7 | U+E | home/posts-today__not-posted.json | iOS:PhotoUploadFeatureTests L374, L550 / AN:PhotoUploadEntryGateViewModelTest |
| TC-UPL-003 | Given 오늘 이미 작성(VALIDATING, PENDING, APPROVED 각각) / When + 버튼 탭 / Then "이미 이 주제에 게시물을 작성했어요."를 보여 주고 업로드 화면이 열리지 않는다 | POST-003, POST-011, D-14-1, P2, P6 | U | home/posts-today__posted-validating.json, home/posts-today__posted-pending.json, home/posts-today__posted-approved.json | iOS:PhotoUploadFeatureTests L399, L565 / AN:PhotoUploadEntryGateViewModelTest |
| TC-UPL-004 | Given 참여 가능 주제 없음 / When `/posts/today` 404 / Then "지금 참여할 수 있는 주제가 없어요." | D-14-1, T13 | U | home/posts-today__404-no-open-topic.json | iOS:PhotoUploadFeatureTests L565 / AN:PhotoUploadEntryGateViewModelTest |
| TC-UPL-005 | Given 정지 회원 / When `/posts/today` 403 / Then "이용이 정지되어 게시물을 작성할 수 없어요."이고 같은 요청을 다시 보내지 않는다 | D-08, P11 | U | home/posts-today__403-banned.json | iOS:PhotoUploadFeatureTests L565 / AN:PhotoUploadEntryGateViewModelTest |
| TC-UPL-006 | Given 토큰 만료 / When `/posts/today` 401 `UNAUTHORIZED` / Then refresh 후 1회 재전송, `REAUTHENTICATION_REQUIRED`면 로그인 화면이다 | D-17 | U | home/posts-today__401-unauthorized.json | iOS:PhotoUploadFeatureTests L247 / AN:PhotoUploadEntryGateViewModelTest(401→Login) |
| TC-UPL-007 | Given 서버 오류·연결 실패·계약 위반 / When 게이트 확인 실패 / Then "게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요."이고 업로드 화면은 열리지 않는다(쟁점 1) | D-14-1 | U | home/posts-today__500-server-error.json | iOS:PhotoUploadFeatureTests L565 / AN:PhotoUploadEntryGateViewModelTest |
| TC-UPL-008 | Given 미작성인데 응답에 postId·moderationStatus가 포함되거나 `isPosted=true`에 `moderationStatus=REJECTED` / When 파싱 / Then 계약 위반으로 보고 위 일반 실패 문구를 보여 준다 | POST-011, §8.1 | C+U | upload/posts-today__invalid-not-posted-with-post.json | iOS:PhotoUploadFeatureTests L415 / AN:PostRepositoryImplTest(today 계약) |
| TC-UPL-009 | Given 확인 중 / When + 버튼 연타 / Then `GET /posts/today`는 1회만 나간다 | D-14-1 | U | home/posts-today__not-posted.json(지연) | AN:PhotoUploadEntryGateViewModelTest(반복 탭 API 1회) |
| TC-UPL-010 | Given 게이트 대기 중 화면을 정리(이탈) / When 대기 중 요청과 뒤늦게 시작한 요청 / Then 모두 취소되고 업로드 화면이 열리지 않는다 | D-20 | U | home/posts-today__not-posted.json(지연) | iOS:PhotoUploadFeatureTests L354 |
| TC-UPL-011 | Given 게이트 통과 / When 주제 조회 / Then `GET /topics?date=<topicDate>`로 `topicId`·제목을 얻고, 응답 `topicDate`가 요청과 다르면 "주제를 불러오지 못했어요. 다시 시도해 주세요."로 실패한다 | D-14-2, TOPIC-005 | C+U | home/topics__open-2026-10-27.json, upload/topics__mismatch-date.json | iOS:PhotoUploadFeatureTests L492 / AN:PhotoUploadViewModelTest(주제 선조회), TopicRemoteDataSourceImplTest |
| TC-UPL-012 | Given 주제 조회가 404·500·연결 실패·401 / When 응답 / Then 404·500은 "주제를 불러오지 못했어요. 다시 시도해 주세요.", 연결 실패는 "네트워크 연결을 확인해 주세요.", 401은 재인증이며 전시 완료 오류와 구분된다 | D-14-2, D-20 | U | home/topics__404-not-found.json, upload/topics__500-server-error.json | iOS:PhotoUploadFeatureTests L247, L599 |
| TC-UPL-013 | Given 23:59:30 KST에 진입한 업로드 화면 / When 00:01 KST(가짜 시계)에 제출 / Then 요청에는 진입 때 고정한 `topicDate`·`topicId`가 쓰이고 시계로 다시 계산하지 않는다 | D-14-2, T11, T12 | U | home/posts-today__not-posted.json, home/topics__open-2026-10-27.json | AN:PhotoUploadViewModelTest(자정 이후 진입 주제) |
| TC-UPL-014 | Given 업로드 화면 / When 앨범 선택 / Then 시스템 사진 선택기(권한 불필요, 단일 이미지)를 열고 선택 즉시 편집 화면으로 간다. 선택기 취소는 상태를 바꾸지 않는다 | D-14(카메라) | W+E | - | iOS:PhotoUploadFeatureTests L307 / AN:PhotoUploadScreenTest |
| TC-UPL-015 | Given 카메라가 없는 기기·웹 데스크톱 / When 업로드 화면 렌더 / Then 카메라 버튼이 숨겨지고 앨범 선택은 가능하다 | D-14(카메라) | W | - | AN:PhotoUploadScreenTest(카메라 숨김), CameraCaptureTest |
| TC-UPL-016 | Given 카메라로 촬영 / When 촬영 완료 / Then 촬영본을 기기 앨범에 한 번만 저장(파일명 `chalkak-photo-*.jpg` 규칙)하고 "전시하기" 때 다시 저장하지 않는다 | D-14(카메라) | U | - | iOS:PhotoUploadFeatureTests L124 / AN:CameraCaptureTest(파일명) |
| TC-UPL-017 | Given 앨범에서 고른 사진 / When 업로드 준비·제출 / Then 앨범에 다시 저장하지 않는다 | D-14(카메라) | U | - | iOS:PhotoUploadFeatureTests L156 |
| TC-UPL-018 | Given 촬영본 앨범 저장이 권한 거부·실패 / When 저장 시도 / Then 토스트 "사진을 갤러리에 저장하지 못했어요."만 뜨고 선택한 사진은 유지되어 업로드를 계속할 수 있다 | D-14(카메라) | U+E | - | iOS:PhotoUploadFeatureTests L172 / AN:CameraCaptureTest(저장 권한) |
| TC-UPL-019 | Given 업로드 화면을 닫은 뒤 / When 늦게 끝난 앨범 저장이 실패 / Then 앱 전역 토스트로 알리고 크래시가 없다 | D-20 | U | - | iOS:PhotoUploadFeatureTests L197 |
| TC-UPL-020 | Given 사진 A 로딩 중 / When 사진 B를 선택해 결과가 뒤바뀜 / Then 최신 선택이 아닌 로드 결과는 무시된다 | D-14 | U | - | iOS:PhotoUploadFeatureTests L307 |
| TC-UPL-021 | Given 빈 데이터·0바이트·손상 이미지 / When 선택 / Then 편집 화면을 띄우지 않고 "사진을 준비하지 못했어요. 다시 시도해 주세요."를 보여 준다 | D-14 | U+W | upload/images/zero-bytes.jpg, upload/images/corrupt-truncated.jpg | iOS:PhotoUploadFeatureTests L227 / AN:PhotoUploadViewModelTest |
| TC-UPL-022 | Given 카메라 사용 / When OS 카메라·사진 추가 권한 다이얼로그가 뜸 / Then 허용·거부 각각 앱이 멈추지 않고 안내 후 앨범 선택으로 계속할 수 있다 (AG-UPL-002) | strategy §1-2 | A | - | iOS:PhotoUploadFeatureTests L172 / AN:CameraCaptureTest |
| TC-UPL-023 | Given 편집을 마치거나 사진을 고름 / When 즉시 / Then 백그라운드에서 `POST /posts/uploads`(본문 없음, Authorization)를 호출하고 인코딩을 시작하며 S3 PUT은 아직 하지 않는다 | D-14-3, POST-004 | C+U | upload/posts-uploads__issued.json | AN:PostCreationRepositoryImplTest(정책/인코딩/PUT/생성 순서) / iOS:PhotoUploadFeatureTests L434 |
| TC-UPL-024 | Given 정책 응답 / When 파싱 / Then `uploadId, uploadUrl, expiresInSeconds=300, contentType=image/webp, maxBytes=5242880`을 읽고 `maxBytes`는 64비트 정수로 보존한다 | POST-004 | C | upload/posts-uploads__issued.json, upload/posts-uploads__issued-large-max.json | AN:PostCreationRemoteDataSourceImplTest(maxBytes Long) |
| TC-UPL-025 | Given 정책 `contentType`이 `image/png` / When 파싱 / Then 인코딩 전에 실패하고 "사진을 준비하지 못했어요. 다시 시도해 주세요."를 보여 준다 | D-14-3 | U | upload/posts-uploads__content-type-png.json | AN:PostCreationRepositoryImplTest, PhotoUploadViewModelTest |
| TC-UPL-026 | Given 정책 응답에 필수 필드 누락 / When 파싱 / Then 계약 위반 실패이고 앱은 깨지지 않는다 | D-02 | C | upload/posts-uploads__missing-fields.json | AN:PostCreationRemoteDataSourceImplTest(잘못된 body) |
| TC-UPL-027 | Given 정책 발급 오류 / When 401·403·500·연결 실패 / Then 401은 refresh 후 1회 재전송, 403은 "이용이 정지되어 게시물을 작성할 수 없어요.", 500·연결 실패는 멱등 발급이므로 0.5s·1s로 최대 2회 재시도 후 "사진을 준비하지 못했어요. 다시 시도해 주세요."이고 사진·제목은 유지된다 | D-21, D-08, P11 | U | upload/posts-uploads__401-unauthorized.json, upload/posts-uploads__403-banned.json, upload/posts-uploads__500-server-error.json | AN:PostCreationRemoteDataSourceImplTest(401/오류 body) |
| TC-UPL-028 | Given 사진을 다른 사진으로 교체하거나 다른 편집값으로 다시 완료 / When 준비 중 / Then 이전 준비 작업을 취소하고 임시 파일을 삭제하며 새 정책을 발급하고, 같은 편집값이면 다시 준비하지 않는다 | D-14-3 | U | upload/posts-uploads__issued.json | iOS:PhotoEditFeatureTests L763 / AN:PhotoUploadViewModelTest(편집/준비/취소) |
| TC-UPL-029 | Given 선제 준비가 실패 / When 화면 표시 / Then 사진·제목은 유지된 채 즉시 실패를 알리고 별도 재시도 버튼 없이 "전시하기"가 정책 발급과 준비부터 다시 시도한다 | D-14-5 | U | upload/posts-uploads__500-server-error.json → upload/posts-uploads__issued.json | AN:PhotoUploadViewModelTest, iOS:PhotoUploadFeatureTests L47 |
| TC-UPL-030 | Given 준비 중 뒤늦게 끝난 이전 작업 / When 새 선택 이후 완료 / Then 세대 검증으로 새 선택 상태를 덮지 않는다 | D-04 | U | - | AN:PhotoUploadViewModelTest(generation) |
| TC-UPL-031 | Given 화면 이탈·ViewModel 정리 / When 진행 중 작업 / Then 취소하고 소유한 WebP 임시 파일을 삭제한다. PUT 중 취소·실패·생성 실패 시에도 임시 파일이 남지 않는다 | D-14 | U | - | AN:PostCreationRepositoryImplTest(실패별 파일 삭제, 취소 시 파일 삭제) |
| TC-UPL-032 | Given 고정 입력 JPEG `smooth-1600x1200.jpg` / When 인코딩 / Then 출력 바이트가 `RIFF`로 시작하고 8~11번째 바이트가 `WEBP`이며 RIFF 크기 필드 = 전체 길이 - 8이다 | POST-004, U3 | U | upload/images/smooth-1600x1200.jpg | iOS:PhotoUploadFeatureTests L770 / AN:AndroidPostImageEncoderTest |
| TC-UPL-033 | Given 출력 WebP / When 청크 순회 / Then 첫 이미지 청크가 `VP8 ` 또는 `VP8L`(또는 `VP8X`+정지 이미지)이고 `ANIM`·`ANMF` 청크가 없으며 `EXIF`·`XMP `·`ICCP` 청크가 없다(GPS 메타가 든 `exif-gps-orientation6.jpg` 입력으로 검증) | POST-004, D-13 | U | upload/images/exif-gps-orientation6.jpg | AN:AndroidPostImageEncoderTest(EXIF 제거) |
| TC-UPL-034 | Given 8000×6000 입력 / When 인코딩 / Then 긴 변이 4096 이하(샘플링 2배 → 4000×3000)이고 가로세로 비율 오차가 1px 이내다. 4096×3072는 그대로, 4608×3456은 2304×1728, 4097×3000은 2049×1500(±1)이다(2의 거듭제곱 다운샘플) | POST_IMAGE_MAX_LONG_EDGE, §3.1 | U | upload/images/gradient-8000x6000.png(생성), upload/images/gradient-4608x3456.png(생성) | iOS:PhotoUploadFeatureTests L714 / AN:AndroidPostImageEncoderTest |
| TC-UPL-035 | Given 큰 소스 / When 디코드 / Then 먼저 크기만 읽고(`readBounds`) 전체 해상도 비트맵을 한 번도 만들지 않으며 디코더에는 목표 샘플 크기가 전달된다(스파이) | D-14 | U | - | AN:AndroidPostImageEncoderTest(메모리 정책) |
| TC-UPL-036 | Given EXIF 방향 1~8 입력 `exif-orientation-1..8.jpg`(모서리 4색 마커) / When 인코딩 후 디코드 / Then 모든 방향에서 화면에 보이던 방향대로 마커가 배치되고 출력에 방향 태그가 없다 | D-13, §3.1 | U | upload/images/exif-orientation-1.jpg ~ exif-orientation-8.jpg | AN:AndroidPostImageEncoderTest(회전 8모드) / iOS:PhotoEditFeatureTests L860 |
| TC-UPL-037 | Given 가짜 `Compressor`(품질별 크기를 표로 반환) / When 90에서 maxBytes 이하 / Then 90 한 번만 시도하고 종료한다. 90 초과·80 이하면 90→80, 80 초과·60 이하면 90→80→60, 60 초과·40 이하면 90→80→60→40 순서다(품질 사다리 [90, 80, 60, 40]) | WEBP_QUALITY_LADDER, POST-004 | U | - | AN:AndroidPostImageEncoderTest / iOS:PhotoUploadFeatureTests L726 |
| TC-UPL-038 | Given 가짜 Compressor가 모든 품질에서 maxBytes 초과 / When 인코딩 / Then 해상도를 ×0.85 줄여(반올림) 90부터 다시 시도하고 최대 3번 줄여 총 4라운드(16회) 시도 후 `SizeLimitExceeded` 실패다. 중간 라운드에서 성공하면 즉시 종료한다 | WEBP_QUALITY_LADDER | U | - | iOS:PhotoUploadFeatureTests L726, L749 / AN:AndroidPostImageEncoderTest(용량 초과 실패) |
| TC-UPL-039 | Given 가짜 Compressor가 정확히 5,242,880바이트 / When 인코딩 / Then 성공(이하 허용)이고 5,242,881바이트면 해당 품질은 실패로 보고 다음 단계로 간다(U1, U2) | POST-004, U1, U2 | U | - | AN:PostCreationRepositoryImplTest |
| TC-UPL-040 | Given `maxBytes`를 1,000,000으로 준 정책과 노이즈 입력 `noise-1024x768.png` / When 실제 인코더로 인코딩 / Then 결과가 maxBytes 이하이고 출력 치수는 입력의 {1, 0.85, 0.85², 0.85³}배 중 하나이며 디코드 가능하다(실제 인코더 속성 검증) | WEBP_QUALITY_LADDER | U | upload/images/noise-1024x768.png | AN:AndroidPostImageEncoderTest(실제 WebP 인코딩) |
| TC-UPL-041 | Given 실제 인코더·부드러운 입력 / When 인코딩 / Then 결과가 5 MiB의 5% 미만이고 디코드한 이미지의 치수가 입력과 같으며 원본 대비 PSNR이 30dB 이상이다 | POST-004 | U | upload/images/smooth-1600x1200.jpg | iOS:PhotoUploadFeatureTests L770 |
| TC-UPL-042 | Given 불가능한 maxBytes(1,000바이트)와 노이즈 입력 / When 인코딩 / Then `SizeLimitExceeded`로 실패해 "사진을 준비하지 못했어요. 다시 시도해 주세요."를 보여 준다 | D-14 | U | upload/images/noise-1024x768.png | iOS:PhotoUploadFeatureTests L749 |
| TC-UPL-043 | Given 움직이는 GIF·WebP 입력 / When 인코딩 / Then 첫 프레임만 정지 이미지로 출력하고 `ANIM`/`ANMF`가 없다(서버 `ANIMATED_IMAGE` 거절 방지) | POST-004, U3 | U | upload/images/animated-3frames.gif, upload/images/animated-3frames.webp | 신규 |
| TC-UPL-044 | Given PNG(알파)·HEIC·세로 사진 등 플랫폼 디코더가 지원하는 형식 / When 인코딩 / Then 예외 없이 WebP가 나오고 지원하지 않는 형식은 "사진을 준비하지 못했어요"로 실패한다 | D-14 | U | upload/images/alpha-256x256.png, upload/images/sample.heic | 신규 |
| TC-UPL-045 | Given 편집이 없는 사진(`isIdentity`) / When 인코딩 / Then 편집 재그리기를 건너뛰고 같은 입력의 두 번째 인코딩 결과 바이트가 첫 번째와 같다(결정성) | D-13 | U | upload/images/smooth-1600x1200.jpg | AN:AndroidPostImageEncoderTest(isIdentity) |
| TC-UPL-046 | Given 인코딩 중 / When 사용자 취소·화면 이탈 / Then 결과를 반환하지 않고 사다리의 후속 압축을 중단하며(스파이로 호출 수 확인) 임시 파일을 지운다 | D-20 | U | - | iOS:PhotoUploadFeatureTests L788, L813 |
| TC-UPL-047 | Given 사진이 없음 / When 렌더 / Then "전시하기"는 비활성이고, 사진을 고르면 준비 상태와 무관하게 활성이며 준비 실패 후에도 다시 시도할 수 있다 | D-14-4 | U+W | - | iOS:PhotoUploadFeatureTests L42, L47, L58 / AN:PhotoUploadScreenTest(제출 버튼 상태) |
| TC-UPL-048 | Given 사진 준비 중 / When "전시하기" / Then 버튼이 "전시 중..."이 되고 준비 완료를 기다린 뒤 자동으로 PUT·POST를 진행한다 | D-14-4 | U | upload/posts-uploads__issued.json(지연) | AN:PostCreationRepositoryImplTest(사진 준비 중 제출), PhotoUploadViewModelTest |
| TC-UPL-049 | Given 정책 발급 후 경과 294.999초(단조 시계) / When 제출 / Then 기존 정책(uploadUrl, uploadId)으로 PUT한다 | UPLOAD_URL_SAFETY_MARGIN, POST-004, U5 | U | upload/posts-uploads__issued.json | AN:PostCreationRepositoryImplTest(만료 URL 재발급) |
| TC-UPL-050 | Given 정책 발급 후 경과 295.000초·299초·301초 / When 제출 / Then 새 정책을 발급받아(다른 uploadId) 그 URL로 PUT하고 `POST /posts`에도 새 uploadId를 쓴다 | UPLOAD_URL_SAFETY_MARGIN, U5 | U | upload/posts-uploads__issued.json → upload/posts-uploads__issued-new.json | iOS:PhotoUploadFeatureTests L434 / AN:PostCreationRepositoryImplTest |
| TC-UPL-051 | Given 정책 발급 후 기기 벽시계를 +10분 변경하고 실제 경과 100초 / When 제출 / Then 만료 판정은 단조 시계 기준이라 기존 정책을 쓴다. 벽시계를 -10분 변경하고 실제 경과 296초면 새 정책이다 | UPLOAD_URL_SAFETY_MARGIN | U | upload/posts-uploads__issued.json | AN:PostCreationRepositoryImplTest(nanoTime 기준) |
| TC-UPL-052 | Given 재발급된 정책의 `maxBytes`가 기존 파일 크기 이상 / When 제출 / Then 준비한 파일을 재사용하고 새 uploadId로 PUT한다. 새 `maxBytes`가 더 작아 파일이 초과하면 저장한 편집값을 다시 적용해 원본에서 재인코딩한다 | D-14-4 | U | upload/posts-uploads__issued.json, upload/posts-uploads__issued-small-max.json | AN:PostCreationRepositoryImplTest(새 maxBytes 재인코딩, 편집값 재적용) |
| TC-UPL-053 | Given 재발급된 정책 `contentType`이 `image/webp`가 아님 / When 제출 / Then 업로드하지 않고 준비 실패 문구를 보여 준다 | D-14-3 | U | upload/posts-uploads__content-type-png.json | AN:PostCreationRepositoryImplTest |
| TC-UPL-054 | Given 준비된 WebP / When presigned `PUT` / Then 메서드 PUT, Authorization 헤더 없음, `Content-Type`이 정책 값(`image/webp`)과 정확히 같고 본문 바이트 해시가 로컬 파일과 같다(mock S3 수신 검증) | §3.1-2, U4 | C+E | upload/s3-put__200.json | AN:OkHttpPostImageUploaderTest / iOS:PhotoUploadFeatureTests L434 |
| TC-UPL-055 | Given PUT 응답이 S3 403(서명 불일치·만료)·5xx·연결 실패 / When 응답 / Then 403·5xx는 "사진을 업로드하지 못했어요. 다시 시도해 주세요.", 연결 실패는 "네트워크 연결을 확인해 주세요."이고 입력은 유지되며 멱등 PUT은 0.5s·1s로 최대 2회 재시도하고 다음 "전시하기"는 정책 발급부터 다시 한다 | D-21, U4, U5 | U+E | upload/s3-put__403-signature-mismatch.json, upload/s3-put__500-server-error.json | AN:OkHttpPostImageUploaderTest(잘못된 Content-Type/URL 실패) |
| TC-UPL-056 | Given 업로드 URL이 `http://` 또는 잘못된 형식 / When PUT 시도 / Then 전송하지 않고 업로드 실패로 처리한다 | D-17(https) | U | upload/posts-uploads__insecure-upload-url.json | AN:AuthRepositoryImplTest(잘못된 업로드 URL), NetworkModuleTest |
| TC-UPL-057 | Given PUT 응답이 61초 지연(가짜 시계) / When 기다림 / Then 60초 타임아웃으로 업로드 실패 처리된다(일반 API는 연결 10초·응답 15초) | D-21 | U | upload/s3-put__200.json(지연) | AN 3.1(타임아웃 미설정 5.2-14) |
| TC-UPL-058 | Given 인코딩 결과 / When 크기 검증 / Then 5,242,880바이트 이하만 PUT하고(정책 `maxBytes` 우선) 초과 결과는 PUT 전에 차단한다(서버 처리 단계의 `TOO_LARGE` 방지) | POST-004, U1, U2 | U | - | iOS:PhotoUploadFeatureTests L726 |
| TC-UPL-059 | Given PUT 성공 / When `POST /posts` / Then JSON `{topicId, photoUploadId, title}`(title은 strip한 값, 없으면 null 또는 생략)과 Authorization으로 요청하고 URL·메서드가 계약과 같다 | POST-001~005 | C | upload/posts-create__201-pending.json | AN:PostCreationRemoteDataSourceImplTest(POST body, title null 생략) / iOS:PhotoUploadFeatureTests L434 |
| TC-UPL-060 | Given 응답 201 `moderationStatus=PENDING` 또는 `VALIDATING` / When 성공 / Then 성공 화면으로 가고 상태별 문구가 다르다 | §4.1, D-14-6 | U+E | upload/posts-create__201-pending.json, upload/posts-create__201-validating.json | AN:PostCreationRepositoryImplTest(VALIDATING·PENDING) / iOS:PhotoUploadFeatureTests L90 |
| TC-UPL-061 | Given 응답 201인데 `moderationStatus`가 알 수 없는 값이거나 필드 누락 / When 파싱 / Then 계약 위반으로 보고 D-07처럼 `GET /posts/today`로 확인해 `isPosted=true`면 그 상태로 성공 처리한다 | D-07, POST-011 | U | upload/posts-create__201-unknown-status.json, home/posts-today__posted-pending.json | AN:PostCreationRemoteDataSourceImplTest(잘못된 body) |
| TC-UPL-062 | Given `POST /posts` 400 / When `/posts/today`가 `isPosted=true` / Then "이미 이 주제에 전시한 사진이 있어요."를 보여 준다. 서버 `message`를 다른 문장으로 바꿔도 결과가 같다 | D-02, P2, P8 | U | upload/posts-create__400-already-posted.json, home/posts-today__posted-pending.json | AN:PostCreationRepositoryImplTest(중복 매핑) / iOS:PhotoUploadFeatureTests L90 [message 문자열 일치를 D-02로 대체] |
| TC-UPL-063 | Given `POST /posts` 400 / When `/posts/today`가 404 또는 `topicDate`가 진입 때와 다름 / Then "주제가 변경되어 전시할 수 없어요."를 보여 준다. 서버 message가 달라도 같다 | D-02, P10 | U | upload/posts-create__400-topic-not-open.json, home/posts-today__404-no-open-topic.json, upload/posts-today__topic-date-changed.json | AN:PostCreationRepositoryImplTest(닫힌 주제 매핑) |
| TC-UPL-064 | Given `POST /posts` 400이 업로드 만료("사진 업로드 유효 시간이 지났습니다.")·재사용("이미 사용된 사진입니다.")·처리 거절("WebP 이미지만 업로드할 수 있습니다.", "더 작은 용량의 이미지를 업로드해 주세요.") / When `/posts/today`가 `isPosted=false`·topicDate 동일 / Then 서버 `message`를 그대로 보여 주고 다음 "전시하기"에서 정책 발급부터 사진 준비를 다시 한다(입력 유지) | D-02, U3, U7, U8, §3.1 | U | upload/posts-create__400-upload-expired.json, upload/posts-create__400-upload-used.json, upload/posts-create__400-rejected-unsupported-format.json, upload/posts-create__400-rejected-too-large.json | AN:PostCreationRepositoryImplTest(생성 거절) |
| TC-UPL-065 | Given `POST /posts` 404 "업로드한 사진을 찾을 수 없습니다."(PUT 누락·타인 ID) / When 응답 / Then 서버 message를 보여 주고 업로드부터 다시 하게 한다. 404 "게시물을 작성할 주제를 찾을 수 없습니다."면 `/posts/today`로 확인해 주제 변경 문구를 보여 준다 | §5.2, D-02 | U | upload/posts-create__404-upload-not-found.json, upload/posts-create__404-topic-not-found.json | AN:PostCreationRepositoryImplTest |
| TC-UPL-066 | Given `POST /posts` 401 / When 응답 / Then refresh 후 1회 재전송하고 재인증이 필요하면 로그인 화면으로 가며 복귀 후에도 사진·제목 입력이 유지된다 | D-17 | U | upload/posts-create__401-unauthorized.json | AN:PhotoUploadViewModelTest(401→Login 입력 유지) / iOS:PhotoUploadFeatureTests L247 |
| TC-UPL-067 | Given 정지 회원 / When `POST /posts` 403 / Then "이용이 정지되어 게시물을 작성할 수 없어요."이고 재요청 0건이다 | D-08, P11 | U | upload/posts-create__403-banned.json | 신규 |
| TC-UPL-068 | Given `POST /posts` 500 / When 응답 / Then 자동 재시도 없이 1회만 보내고 "전시를 완료하지 못했어요. 다시 시도해 주세요."를 보여 주며 입력은 유지된다 | D-21, D-14-5 | U | upload/posts-create__500-server-error.json | AN:PostCreationRepositoryImplTest(생성 거절/일반) |
| TC-UPL-069 | Given `POST /posts` 타임아웃(응답 유실) / When 이어서 `/posts/today`가 `isPosted=true` / Then 성공 화면으로 한 번만 가고 `POST /posts`는 재전송하지 않으며 상태는 today 응답의 `moderationStatus`다 | D-07, P9 | U+E | upload/posts-create__timeout.json, home/posts-today__posted-validating.json | 신규(AN 5.2-11, iOS 동일 갭) |
| TC-UPL-070 | Given `POST /posts` 타임아웃 / When `/posts/today`가 `isPosted=false` / Then "네트워크 연결을 확인해 주세요."를 보여 주고 같은 uploadId로 다시 제출할 수 있다(새 정책 발급 없음) | D-07, POST-004 | U+E | upload/posts-create__timeout.json, home/posts-today__not-posted.json | 신규 |
| TC-UPL-071 | Given `POST /posts` 타임아웃 / When `/posts/today`도 실패 / Then "네트워크 연결을 확인해 주세요."이고 재제출이 가능하다. 이때 서버가 이미 생성했다면 재제출은 400 중복이며 D-02에 따라 "이미 이 주제에 전시한 사진이 있어요."가 된다 | D-07, D-02 | U | upload/posts-create__timeout.json, home/posts-today__500-server-error.json, upload/posts-create__400-already-posted.json | 신규 |
| TC-UPL-072 | Given 재제출이 59분 59초 후 / When 같은 uploadId로 `POST /posts` / Then 요청이 전송된다. 61분 후에는 서버가 400 "사진 업로드 유효 시간이 지났습니다."를 주고 클라이언트는 서버 message를 보여 준 뒤 정책 발급부터 다시 준비한다(U6, U7) | POST-004, U6, U7 | U | upload/posts-create__201-pending.json, upload/posts-create__400-upload-expired.json | 신규 |
| TC-UPL-073 | Given 제출 진행 중 / When "전시하기" 연타 / Then PUT·`POST /posts`는 각 1회만 나가고 완료 후 반복 탭은 무시된다 | D-14-5 | U | upload/posts-create__201-pending.json(지연) | AN:PhotoUploadViewModelTest(중복 탭), PostCreationRepositoryImplTest |
| TC-UPL-074 | Given 제출이 실패 / When 화면 / Then 사진·제목 입력이 그대로 유지되고 다시 제출할 수 있다 | D-14-5 | U | upload/posts-create__500-server-error.json | AN:PhotoUploadViewModelTest(실패별 메시지) |
| TC-UPL-075 | Given 23:59:30 진입 후 00:01에 제출했는데 서버가 이미 다음 주제를 OPEN으로 봄 / When 진입 때 topicId로 POST / Then 400 "현재 게시물을 작성할 수 없는 주제입니다." → `/posts/today`가 새 topicDate → "주제가 변경되어 전시할 수 없어요.". 서버 참여 기간이 아직 끝나지 않았다면(T11) 201로 성공한다 | T11, T12, D-02 | U | upload/posts-create__400-topic-not-open.json, upload/posts-today__topic-date-changed.json, upload/posts-create__201-pending.json | AN:PhotoUploadViewModelTest(자정 이후) |
| TC-UPL-076 | Given 정책 발급 후 5분이 지나 액세스 토큰이 만료 / When 제출 / Then 새 정책 발급은 만료 갱신 후 수행되고 PUT에는 Authorization이 없으며 `POST /posts`가 401이면 refresh 후 1회 재전송한다 | D-17, §3.1-2 | U | upload/posts-uploads__issued.json, upload/posts-create__401-unauthorized.json | AN:TokenAuthenticatorTest |
| TC-UPL-077 | Given 오프라인에서 제출 / When 연결 실패 → 온라인 복귀 후 다시 제출 / Then "네트워크 연결을 확인해 주세요." 후 입력이 유지되고 복귀 후 제출이 성공한다 | D-20 | E | upload/posts-uploads__issued.json, upload/s3-put__200.json, upload/posts-create__201-pending.json | 신규 |
| TC-UPL-078 | Given 업로드 화면 중 `REAUTHENTICATION_REQUIRED` / When 세션 폐기 / Then 로그인 화면으로 가고 임시 WebP 파일을 삭제하며 다른 계정으로 로그인해도 이전 사진·정책이 남지 않는다 | D-17, D-16 | U | upload/posts-create__401-unauthorized.json | 신규 |
| TC-UPL-079 | Given 제출 중 화면 이탈 / When PUT 중이면 취소, `POST /posts` 이후라면 / Then PUT 취소 + 임시 파일 삭제이고 이탈 뒤 성공 화면은 뜨지 않으며 홈 복귀 시 `GET /posts/today`로 상태가 갱신된다 | D-14, D-20 | U | upload/posts-create__201-pending.json(지연) | AN:PostCreationRepositoryImplTest(PUT 중 취소) |
| TC-UPL-080 | Given 제목 입력 / When 한글 10자, 이모지 10개 / Then 입력이 허용되고 11번째 입력은 들어가지 않는다(UTF-16 길이가 아니라 code point) | D-01, H2, H4 | U+W | - | iOS:PhotoUploadFeatureTests L263, iOS:chalkakTests L31, L38 / AN:PhotoUploadViewModelTest |
| TC-UPL-081 | Given 제목 입력 / When 결합 이모지 👨‍👩‍👧 2개(10 code point) + 한 글자, 11자 붙여넣기 / Then 11번째 code point부터 막히고 붙여넣기는 10 code point까지만 들어간다(grapheme 기준 금지) | D-01, H3 | U+W | - | iOS:PhotoUploadFeatureTests L263 / AN:PhotoUploadViewModelTest(takeGraphemes → code point) |
| TC-UPL-082 | Given 입력 " 가나다라마바사아자차 " / When 제출 / Then strip 후 10자이므로 허용되고 `title`은 공백 제거 값으로 전송된다. 공백만 입력하면 제목 없음(null)이다 | D-01, H1, H5 | U+C | upload/posts-create__201-pending.json | AN:PostCreationRemoteDataSourceImplTest(title null 생략) |
| TC-UPL-083 | Given 우회 등으로 11자가 전송되어 서버 400 "제목은 10자 이하여야 합니다." / When 응답 / Then 서버 message를 보여 주고 입력을 유지한다 | §5.2, H3 | U | upload/posts-create__400-title-too-long.json | 신규 |
| TC-UPL-084 | Given 성공 화면의 주제 이름 / When "‘{주제}’을/를 기록했어요." 문장 생성 / Then 받침이 있으면 을(하늘, 꽃, 우산), 없으면 를(바다, 나무)이고 끝 공백은 무시해("겨울 "→을) 빈 주제는 를이다 | D-14-6 | U | - | iOS:PhotoUploadFeatureTests L10, L17, L24 / AN:KoreanObjectParticleTest |
| TC-UPL-085 | Given 성공 상태 PENDING / When 렌더 / Then "검수를 기다리고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!", VALIDATING이면 "사진을 확인하고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!"와 버튼 "확인했어요."가 보인다 | D-14-6 | W | upload/posts-create__201-pending.json, upload/posts-create__201-validating.json | AN:PhotoUploadSuccessScreenTest / iOS:PhotoUploadFeatureTests L90 |
| TC-UPL-086 | Given 성공 화면 / When "확인했어요." 탭 / Then 업로드한 `topicDate`의 전시로 이동하고 뒤로가기로 업로드 화면에 돌아오지 않는다 | D-14-6 | E | display/posts-list__recent-page1.json | AN:ChalkakNavHostTest(업로드 성공 후 전시) |
| TC-UPL-087 | Given `topicDate`(KST yyyy-MM-dd) / When 성공 카드·API 파라미터 변환 / Then 요청에는 `yyyy-MM-dd`, 카드에는 표시 형식이 쓰이고 기기 시간대와 무관하다 | D-09 | U | - | iOS:PhotoUploadFeatureTests L65 |
| TC-UPL-088 | Given 업로드 화면·성공 화면 / When 진입 / Then `screen_view` `photo_upload`, `photo_upload_success`가 각 1회 전송된다 | D-22 | U | - | AN 2.8(분석 screen) |
| TC-UPL-089 | Given 업로드 화면 / When 렌더 / Then 문구 "주제 ‘…’에 맞는 한 장", "앨범에서 고르거나 지금 찍어요", 제목 플레이스홀더 "작품 제목은 선택이에요.", 선택 사진은 원본 비율로 표시되고 제목 입력 포커스가 정상 동작한다 | D-14 | W+S | - | iOS:PhotoUploadFeatureTests L658, L679 / AN:PhotoUploadScreenTest(캡션 포커스) |
| TC-UPL-090 | Given 회원이 설정 탭에서 + → 업로드 화면 / When 닫기 / Then 설정 탭으로 복귀한다 | NAV | E | home/posts-today__not-posted.json | iOS:chalkakUITests L238 |
| TC-UPL-091 | Given 개발 서버와 실제 앨범 사진(실행 시 받은 카카오 계정) / When 업로드 → 서버가 S3 이미지를 처리 / Then 성공 화면이 보이고 `GET /posts/today`가 VALIDATING→PENDING으로 바뀌며 홈 히어로에 반영된다 (AG-UPL-001) | strategy §1-1, POST-006 | A | - | 신규 |
| TC-UPL-092 | Given 고해상도·5MiB 초과로 압축이 필요한 실제 사진 / When 편집 없이 업로드 / Then 인코딩이 합리적 시간에 끝나고 앱이 메모리 부족 없이 동작하며 서버가 `TOO_LARGE`/`CORRUPTED_IMAGE`로 거절하지 않는다 (AG-UPL-003) | strategy §1-1, POST-004 | A | - | AN:AndroidPostImageEncoderTest(대형 소스) |

## EDIT 사진 편집

편집 색 수식은 `docs/architecture/photo-edit.md`(원본 레포 `client/android`)와 `shared/photo-edit/filters.json`을 기준으로 한다. 골든 값은 이 문서의 수식으로 계산해 `edit/golden/*.json`에 둔다(예시 값은 허용 오차 ±2/255).

| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-EDIT-001 | Given 사진을 선택 / When 편집 화면 진입 후 `start`를 여러 번 호출 / Then 미리보기 원본과 자동 보정값 준비는 한 번만 일어나고 만들기만 해서는 렌더링하지 않는다 | D-13 | U | - | iOS:PhotoEditFeatureTests L13 / AN:PhotoEditViewModelTest |
| TC-EDIT-002 | Given 편집 화면 / When 렌더 / Then 도구 "자르기/조정/필터"와 상단 "취소/완료", "90도 회전", "초기화"가 보이고 testIDs.md 식별자가 존재한다 | D-13 | W | - | AN:PhotoEditViewModelTest / iOS:PhotoEditFeatureTests |
| TC-EDIT-003 | Given 편집 완료 / When "완료" 탭 / Then 선택한 필터·조정·자르기를 원본 크기로 한 번만 반영하고(렌더 1회) 편집 상태를 함께 전달한다. 렌더 대신 편집값만 넘기는 구현은 업로드 준비에서 같은 결과를 낸다 | D-13 | U | - | iOS:PhotoEditFeatureTests L34 / AN:PhotoEditViewModelTest |
| TC-EDIT-004 | Given 처음 고른 사진의 편집 / When "취소" / Then 렌더 없이 취소 이벤트만 나가고 사진 선택 자체가 취소된다(업로드 화면에 사진 없음) | D-14 | U | - | iOS:PhotoEditFeatureTests L64, L671 / AN:PhotoEditViewModelTest |
| TC-EDIT-005 | Given 이미 편집한 사진을 다시 편집 / When "취소" / Then 이전 선택·편집 결과·준비 결과가 유지된다 | D-14 | U | - | iOS:PhotoEditFeatureTests L729 / AN:PhotoEditViewModelTest |
| TC-EDIT-006 | Given 업로드 화면의 사진 / When 사진을 탭 / Then 현재 편집값으로 편집 화면이 다시 열리고, 다시 완료하면 이전 사진 준비를 취소하고 새 준비를 시작하며 같은 편집값이면 다시 준비하지 않는다 | D-14-3 | U+E | upload/posts-uploads__issued.json | iOS:PhotoEditFeatureTests L729, L763 / AN:PhotoUploadViewModelTest |
| TC-EDIT-007 | Given 도구 화면(자르기 세부·필터·조정)이 열려 있음 / When 편집 완료·취소 입력 / Then 무시된다 | D-13 | U | - | iOS:PhotoEditFeatureTests L535 |
| TC-EDIT-008 | Given 렌더링 실패 / When "완료" / Then 화면을 닫지 않고 "사진을 편집하지 못했어요. 다시 시도해 주세요."를 보여 주며 다시 시도할 수 있다 | D-13 | U+W | - | iOS:PhotoEditFeatureTests L602 |
| TC-EDIT-009 | Given 큰 사진 선택 / When 편집용 이미지 준비 / Then 긴 변을 4096 이하로 줄이고 EXIF 회전이 반영된 정방향 이미지로 편집에 넘긴다 | POST_IMAGE_MAX_LONG_EDGE, D-13 | U | upload/images/exif-orientation-6.jpg, upload/images/gradient-8000x6000.png(생성) | iOS:PhotoEditFeatureTests L649, L848, L860 |
| TC-EDIT-010 | Given 편집 결과 / When 업로드용 WebP 생성 / Then 손실 압축은 한 번만 일어나고(중간 JPEG 인코딩 금지, 스파이로 lossy 인코딩 호출 1회) EXIF는 회전만 반영된 뒤 제거된다 | D-13, §5.1-11 | U | upload/images/exif-gps-orientation6.jpg | iOS:PhotoEditFeatureTests L697(JPEG 이중 인코딩을 D-13으로 폐기) |
| TC-EDIT-011 | Given 편집을 하지 않은 상태(회전 0, 자르기 없음, 조정 0, 필터 원본) / When 완료 / Then `isIdentity`이고 업로드 인코더는 편집 재그리기를 건너뛴다 | D-13 | U | - | AN:PhotoEditViewModelTest, AndroidPostImageEncoderTest |
| TC-EDIT-012 | Given 회전·자르기·조정·필터가 바뀐 상태 / When "초기화" / Then 모두 기본값으로 돌아가고 `isIdentity`가 된다 | D-13 | U | - | AN:PhotoEditViewModelTest(초기화) |
| TC-EDIT-013 | Given 자르기 비율 목록 / When 렌더 / Then 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9 순서이고 고정 비율은 세로·가로 짝(4:5↔5:4, 3:4↔4:3, 9:16↔16:9)을 모두 제공한다 | D-13 | U+W | - | iOS:PhotoEditFeatureTests L551 / AN:PhotoEditViewModelTest |
| TC-EDIT-014 | Given 자르기 영역을 조정한 상태 / When 비율을 새로 선택 / Then 이전 자르기 영역을 버리고 전체 이미지에서 새 비율로 다시 시작한다 | D-13 | U | - | iOS:PhotoEditFeatureTests L159, L310 / AN:PhotoEditViewModelTest |
| TC-EDIT-015 | Given 사진 / When "90도 회전" 탭 / Then 시계 방향 90도씩 돌고 4번이면 원상이며 고정 비율도 함께 돌고 준비되기 전에는 현재 화면을 유지한다 | D-13 | U | - | iOS:PhotoEditFeatureTests L217, L585(방향 반대는 iOS 반전 한정) / AN:PhotoEditViewModelTest |
| TC-EDIT-016 | Given 4000×3000 사진, `quarterTurns=1`, 돌린 사진(3000×4000)의 왼쪽 절반 / When 변환 계산 / Then 원본 기준 중심 (2000, 2250), `CropWindow(0.5, 0.75, 0.5, 1)`, 출력 1500×4000이다 | D-13, photo-edit.md §2 | U | - | AN:PhotoEditTransformTest(회전/크롭 변환) |
| TC-EDIT-017 | Given `quarterTurns` 0~3 / When 돌린 사진의 점 (xr, yr) → 원본 점 변환 / Then 0:(xr,yr), 1:(yr,H−xr), 2:(W−xr,H−yr), 3:(W−yr,xr)이다(W×H=4000×3000) | photo-edit.md §2 | U | - | AN:PhotoEditTransformTest |
| TC-EDIT-018 | Given 자르기 프레임 드래그·핸들 늘리기(중심 단위 좌표) / When 이미지 경계·최소 크기 근처 / Then 프레임은 이미지 밖으로 나가지 않고 최소 크롭 비율 0.1 아래로 줄지 않으며 고정 비율에서는 비율이 유지된다 | D-13 | U | - | AN:CropGeometryTest(18) |
| TC-EDIT-019 | Given 화면 좌표 ↔ 중심 단위 좌표 / When `fitScale` 왕복 / Then 오차가 1e-6 이하이고 자르기 화면 크기는 사진이 보이는 크기에 손잡이 여백만 더한 크기다 | D-13 | U | - | AN:CropGeometryTest / iOS:PhotoEditFeatureTests L575 |
| TC-EDIT-020 | Given 8000×6000 사진과 중앙 25%×25% 자르기 / When 업로드용 렌더 / Then 먼저 4096 이하로 줄인 뒤(4000×3000) 자르므로 출력은 약 1000×750이다 | D-13, post-image-encoding | U | upload/images/gradient-8000x6000.png(생성) | AN:PhotoEditTransformTest |
| TC-EDIT-021 | Given 수평 보정 값 / When 편집값 생성 / Then `straightenDegrees`는 항상 0이다(UI 없음) | D-13 | U | - | AN:PhotoEditTransformTest |
| TC-EDIT-022 | Given 자르기 화면 / When 필터가 적용된 원본을 보여 주고 이전 자르기 상태 복원 / Then 자르기를 마치면 잘린 이미지로 미리보기·썸네일을 다시 만들고 선택한 필터를 다시 적용하며, 자르기 취소는 회전·비율 변경을 버리고 이전 자르기를 유지한다 | D-13 | U | - | iOS:PhotoEditFeatureTests L83, L125, L366 / AN:PhotoEditViewModelTest |
| TC-EDIT-023 | Given 조정 항목 / When 렌더 / Then 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함 + "자동"(강도 0~1)이 있고 값 범위는 -1~1(표시값 ×100)이다 | D-13 | U+W | - | AN:PhotoAdjustmentsTest(8) / iOS:PhotoEditFeatureTests L393 |
| TC-EDIT-024 | Given 회색 픽셀 sRGB 128 / When 노출 +1, +0.5, -1 / Then 선형 값에 2^(1.5v)를 곱해 각각 약 205, 162, 78이 된다(허용 ±2). 노출 0이면 128 그대로다 | D-13, photo-edit.md §3 | U | edit/golden/adjust-exposure.json | AN:PhotoColorGoldenTest, PhotoAdjustmentsTest |
| TC-EDIT-025 | Given 회색 128 / When 따뜻함 +1 / Then R≈142, G=128, B≈112이고 -1이면 R≈112, B≈142(R·(1+0.25w), B·(1−0.25w))이다(±2) | D-13 | U | edit/golden/adjust-warmth.json | iOS:PhotoEditFeatureTests L1034 / AN:PhotoColorGoldenTest |
| TC-EDIT-026 | Given 색 픽셀 (200, 50, 50) / When 채도 -1 / Then R=G=B≈107(휘도 L=0.2125R+0.7154G+0.0721B 기준), 채도 +1이면 채널이 clamp되어 (255, 0, 0)이고 0이면 변화 없다(±2) | D-13 | U | edit/golden/adjust-saturation.json | iOS:PhotoEditFeatureTests L971 / AN:PhotoColorGoldenTest |
| TC-EDIT-027 | Given 톤 값 t / When 대비 +1, 그림자 +1(t=1/3), 하이라이트 +1(t=2/3), 블랙 포인트 / Then 대비 t=0.25→0.1545, 0.5→0.5, 0.75→0.8455, 그림자 1/3→0.4815, 하이라이트 2/3→0.8148이고 블랙 포인트 -1에서 검정은 약 0.3까지 뜨며 +1에서 밝기 0.3 아래는 0이다(±0.01) | D-13, photo-edit.md §3 | U | edit/golden/tone-curve.json | AN:PhotoColorGoldenTest, PhotoAdjustmentsTest |
| TC-EDIT-028 | Given 그림자·하이라이트·대비·블랙 포인트 값 조합(-1, 0, 1)^4 / When 톤 곡선 생성 / Then 어떤 조합에서도 0에서 시작해 1로 끝나고 단조 증가(줄어들지 않음)다 | D-13 | U | - | iOS:PhotoEditFeatureTests L1012 / AN:PhotoAdjustmentsTest |
| TC-EDIT-029 | Given 모든 조정 0·필터 원본 / When 색 변환 적용 / Then 모든 픽셀이 변하지 않는다. 조정 순서는 선형 변환(노출·따뜻함·채도) → 감마 → 톤 곡선(블랙 포인트 → 그림자·하이라이트 → 대비) → 필터 행렬이다 | photo-edit.md §3 | U | edit/golden/pipeline-order.json | AN:PhotoColorGoldenTest(8) |
| TC-EDIT-030 | Given 사용자 값과 자동 보정 / When 항목마다 값 결정 / Then 사용자가 만졌으면 사용자 값, 아니면 자동값×강도다. 예: 자동 노출 0.4·대비 0.2, 강도 1, 사용자 노출 0.3 → (0.3, 0.2), 강도 0.5 → (0.3, 0.1), 자동 끔 → (0.3, 0) | D-13, photo-edit.md §4 | U | - | iOS:PhotoEditFeatureTests L480 / AN:PhotoAdjustmentLayersTest(7) |
| TC-EDIT-031 | Given 눈금자 / When 자동 보정 몫 위치로 되돌림 / Then 직접 만진 표시가 지워져 그 항목은 다시 자동 보정을 따르고, 자동 보정을 켜기 전에 만진 항목은 켜도 사용자 값이 유지된다 | D-13 | U | - | iOS:PhotoEditFeatureTests L453, L480 / AN:PhotoAdjustmentLayersTest |
| TC-EDIT-032 | Given 자동 보정 켬 / When 분석 완료 / Then 항목마다 분석값×강도로 채워지고 미리보기·썸네일·완료 렌더에 적용되며 조정 취소는 들어가기 전 강도·항목 값으로 되돌리고 고른 자동 보정을 다시 누르면 꺼진다 | D-13 | U | - | iOS:PhotoEditFeatureTests L393, L453 / AN:PhotoEditViewModelTest(자동 보정) |
| TC-EDIT-033 | Given 대비가 낮고 뜬 사진 / When 자동 보정 분석 / Then 블랙 포인트·대비·노출을 올려 밝기 범위를 넓히고, 밝기가 고른 사진은 여러 항목을 조금씩만, 흑백 사진은 채도를 올리지 않는다 | D-13 | U | edit/golden/auto-adjust-low-contrast.json | iOS:PhotoEditFeatureTests L933, L949 / AN:PhotoAutoAdjusterTest(6) |
| TC-EDIT-034 | Given 단색 사진 밝은 피부 (0.94, 0.78, 0.69), 어두운 피부 (0.45, 0.30, 0.22), 하늘 (0.53, 0.81, 0.92), 풀 (0.30, 0.60, 0.20) / When 자동 채도 / Then 화면 값이 각각 0, 0, +19, +18(±1)이고 일부(1/4)만 피부색이면 올릴 양의 3/4만 올린다 | D-13, photo-edit.md §4 | U | edit/golden/auto-saturation-solids.json | iOS:PhotoEditFeatureTests L980, L990 / AN:PhotoAutoAdjusterTest |
| TC-EDIT-035 | Given 임의 색 / When 채도 세기 계산 / Then 색상(hue)과 무관하게 같은 기준으로 센다 | D-13 | U | - | iOS:PhotoEditFeatureTests L971 |
| TC-EDIT-036 | Given 자동 보정 상수 / When 비교 / Then 분석 샘플 긴 변 256, 노출 범위 -0.5~1.0EV, 흰색 목표 0.96, 처리 순서(노출→블랙 포인트→그림자·하이라이트·대비→채도), 노출 1.5EV/단위, 블랙 포인트 0.3, 따뜻함 0.25, 톤 0.25, 대비 0.6이 `shared/photo-edit/filters.json` 상수와 같다 | D-13 | U | shared/photo-edit/filters.json | AN:PhotoAdjustmentsTest, PhotoAutoAdjusterTest |
| TC-EDIT-037 | Given 자르기를 마치거나 자르기를 바꾼 뒤 탭 이동 / When 자동 보정 / Then 자른 영역 기준으로 자동 보정값을 다시 구한다. 자동 보정을 켠 채 완료한 사진을 같은 자르기로 다시 열면 저장값을 쓰고 재분석하지 않으며, 끄고 완료하면 자동값을 저장하지 않는다 | D-13, photo-edit.md §4 | U | - | iOS:PhotoEditFeatureTests L517 / AN:PhotoEditViewModelTest |
| TC-EDIT-038 | Given 눈금자 스케일 / When 값 ↔ 위치 변환·디텐트 / Then 단위당 400dp, 50틱 기준으로 왕복 오차가 없고 0과 자동 보정 몫 위치에서 멈칫(디텐트 스냅 범위 내)한다 | D-13 | U | - | AN:RulerScaleTest(4) |
| TC-EDIT-039 | Given 필터 목록 / When 렌더 / Then 원본, 흑백, 따뜻하게, 차갑게, 빈티지, 선명하게 6종이 이 순서이고 각 4×5 행렬(20개 값)이 `shared/photo-edit/filters.json`과 같다 | D-13 | U+W | shared/photo-edit/filters.json | AN:PhotoEditViewModelTest(필터) [iOS 기존 필터 목록은 D-13으로 대체] |
| TC-EDIT-040 | Given 필터 원본 / When 적용 / Then 단위 행렬이라 모든 픽셀이 변하지 않고, 필터를 적용해도 이미지 원래 크기가 유지되며 미리보기 크기를 지정하면 긴 변이 그 크기로 줄어든다 | D-13 | U | edit/golden/filter-original.json | iOS:PhotoEditFeatureTests L898, L908 |
| TC-EDIT-041 | Given 임의 색 이미지 / When 흑백 필터 / Then 모든 픽셀에서 R=G=B이다 | D-13 | U | edit/golden/filter-bw.json | iOS:PhotoEditFeatureTests L918 / AN:PhotoColorGoldenTest |
| TC-EDIT-042 | Given 회색 128 / When 따뜻하게·차갑게 필터 / Then 따뜻하게는 R>B, 차갑게는 B>R이다 | D-13 | U | edit/golden/filter-warm-cool.json | AN:PhotoColorGoldenTest |
| TC-EDIT-043 | Given 고정 4×4 색 패치 / When 빈티지·선명하게 필터 / Then 출력 픽셀이 골든 값과 ±2 이내다 | D-13 | U | edit/golden/filter-vintage.json, edit/golden/filter-vivid.json | AN:PhotoColorGoldenTest(8) |
| TC-EDIT-044 | Given 필터를 그리면서 입히는 경로(조정 없음)와 픽셀 루프 경로(조정 있음) / When 같은 필터 / Then 두 결과가 ±1 이내로 같다 | photo-edit.md §3 | U | edit/golden/filter-two-paths.json | AN:PhotoColorGoldenTest |
| TC-EDIT-045 | Given 필터 화면에서 필터를 바꾸고 / When "취소" / Then 들어가기 전 필터로 되돌아간다 | D-13 | U | - | iOS:PhotoEditFeatureTests L349 / AN:PhotoEditViewModelTest |
| TC-EDIT-046 | Given 크롭·회전·흑백·노출을 조합한 4×4 입력 비트맵 / When 실제 이미지 파이프라인으로 렌더 / Then 출력 크기와 픽셀이 기대 골든과 같다(통합) | D-13 | U | edit/golden/pipeline-integration.json | AN:AndroidPhotoEditImageRepositoryTest(2) |
| TC-EDIT-047 | Given 편집 화면 상태 / When 필터 6종 × 고정 이미지, 조정 최대·최소, 자르기 비율별 프레임 / Then 플랫폼 내 스크린샷 기준선과 같다 | D-13 | S | edit/golden/*.json(입력 이미지 `upload/images/smooth-1600x1200.jpg`) | 신규 |
| TC-EDIT-048 | Given 같은 입력 사진과 같은 편집값 / When 플랫폼별 결과를 `shared/photo-edit/golden`의 기준 이미지와 비교 / Then 평균 ΔE ≤ 3이다(수식 일치 자동 검증은 U 골든, 시각 품질은 사람이 확인) (AG-EDIT-004) | D-13 | A | edit/golden/reference-*.png | 신규 |
| TC-EDIT-049 | Given 실제 사진에 필터 6종을 차례로 적용 / When 결과를 눈으로 확인 / Then 의도한 분위기(흑백, 따뜻/차가움, 빈티지, 선명함)로 자연스럽게 보이고 색 띠·뭉개짐이 없다 (AG-EDIT-001) | strategy §1-3 | A | - | 신규 |
| TC-EDIT-050 | Given 실제 기기 / When 자르기 프레임을 끌고 핀치·이동·회전을 반복 / Then 손가락 추종이 자연스럽고 프레임이 튀거나 끊기지 않는다 (AG-EDIT-002) | strategy §1-3 | A | - | AN:CropGeometryTest(기하만) |
| TC-EDIT-051 | Given 실제 기기 / When 조정 눈금자를 끌어 디텐트·햅틱·관성을 확인 / Then 0과 자동 보정 위치에서 멈칫하는 감각이 자연스럽다 (AG-EDIT-003) | strategy §1-3 | A | - | AN:RulerScaleTest(수치만) |

## 구현 시 확인할 쟁점

1. 업로드 게이트의 "그 외 실패" 문구는 D-14가 "게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요."를 정하고, D-20은 연결 실패 문구를 "네트워크 연결을 확인해 주세요."로 통일한다. 위 표는 게이트에서는 D-14 문구를 그대로 쓴다(TC-UPL-007). 연결 실패에 D-20 문구를 쓸지 features/upload-edit.md가 확정해야 한다.
2. `POST /posts` 실패 후 재제출에서 PUT을 다시 할지(같은 uploadId로 `POST /posts`만 보낼지)는 D-07이 "업로드 ID 그대로 재사용"까지만 말한다. 테스트는 uploadId 동일성과 `POST` 전송만 단언하고 PUT 횟수는 단언하지 않았다.
3. 서버 5xx로 `POST /posts`가 실패했을 때 서버가 이미 생성했는지는 알 수 없다. D-07은 타임아웃·연결 끊김만 `GET /posts/today`로 복구하도록 정했으므로 5xx는 일반 실패로 두었다(TC-UPL-068). 필요하면 5xx도 복구 대상으로 넓힌다.
4. 시스템 사진 선택기가 주는 HEIC·PNG 알파 처리는 플랫폼 디코더 의존이다(TC-UPL-044 "지원 범위"). Web은 HEIC 디코더가 없을 수 있어 `차이`로 기록한다.
5. iOS 전용 항목(반전 `flip` 관련 `PhotoEditFeatureTests` L194, L264, L310(일부), L328, L585, L1049, Mantis 화면 재생성 관련 L194~L264)은 D-13의 편집 도구 목록에 반전이 없어 제외했다. iOS `PhotoEditFeatureTests L818`(편집 화면 없이 바로 고른 사진은 재편집 불가)도 새 앱은 모든 선택 사진이 편집 화면을 거치므로 제외했다.
6. 앱을 백그라운드로 보낸 채 진행 중인 PUT 계속 여부는 플랫폼 정책(iOS background URLSession 등)에 따라 다르다. 규칙이 없어 TC를 만들지 않았고 AG-UPL-001의 선택 단계로만 확인한다.

## 필요 fixture 목록

파일은 `shared/fixtures/` 아래 상대 경로다. 표의 HTTP는 mock 서버가 돌려줄 상태 코드이고, 오류 fixture의 본문은 `{errorCode, message}`다.

| 파일명 | 메서드 경로 | HTTP | 내용 요지 |
| --- | --- | --- | --- |
| upload/posts-today__invalid-not-posted-with-post.json | GET /posts/today | 200 | isPosted=false인데 postId, moderationStatus=PENDING 포함(계약 위반) |
| upload/posts-today__topic-date-changed.json | GET /posts/today | 200 | topicDate=2026-10-28, isPosted=false (진입 때와 다른 주제) |
| upload/topics__mismatch-date.json | GET /topics?date=2026-10-27 | 200 | 응답 topicDate=2026-10-26 (요청과 불일치) |
| upload/topics__500-server-error.json | GET /topics | 500 | INTERNAL_ERROR |
| upload/posts-uploads__issued.json | POST /posts/uploads | 200 | uploadId, uploadUrl(mock S3), expiresInSeconds=300, contentType=image/webp, maxBytes=5242880 |
| upload/posts-uploads__issued-new.json | POST /posts/uploads | 200 | 재발급용 두 번째 uploadId (나머지 동일) |
| upload/posts-uploads__issued-small-max.json | POST /posts/uploads | 200 | maxBytes=1000000 |
| upload/posts-uploads__issued-large-max.json | POST /posts/uploads | 200 | maxBytes=5000000000 (64비트 보존) |
| upload/posts-uploads__content-type-png.json | POST /posts/uploads | 200 | contentType=image/png |
| upload/posts-uploads__missing-fields.json | POST /posts/uploads | 200 | uploadUrl 누락 |
| upload/posts-uploads__insecure-upload-url.json | POST /posts/uploads | 200 | uploadUrl이 http:// |
| upload/posts-uploads__401-unauthorized.json | POST /posts/uploads | 401 | UNAUTHORIZED |
| upload/posts-uploads__403-banned.json | POST /posts/uploads | 403 | FORBIDDEN "차단된 회원입니다." |
| upload/posts-uploads__500-server-error.json | POST /posts/uploads | 500 | INTERNAL_ERROR |
| upload/s3-put__200.json | PUT <uploadUrl> (mock S3) | 200 | 빈 본문. mock이 수신 Content-Type, Authorization 부재, 본문 SHA-256을 기록 |
| upload/s3-put__403-signature-mismatch.json | PUT <uploadUrl> (mock S3) | 403 | status+XML 본문 래퍼 (SignatureDoesNotMatch) |
| upload/s3-put__500-server-error.json | PUT <uploadUrl> (mock S3) | 500 | XML 오류 래퍼 |
| upload/posts-create__201-pending.json | POST /posts | 201 | postId, moderationStatus=PENDING |
| upload/posts-create__201-validating.json | POST /posts | 201 | postId, moderationStatus=VALIDATING |
| upload/posts-create__201-unknown-status.json | POST /posts | 201 | moderationStatus="SOMETHING_NEW" |
| upload/posts-create__400-already-posted.json | POST /posts | 400 | BUSINESS_ERROR "이미 해당 주제에 게시물을 작성했습니다." |
| upload/posts-create__400-topic-not-open.json | POST /posts | 400 | BUSINESS_ERROR "현재 게시물을 작성할 수 없는 주제입니다." |
| upload/posts-create__400-upload-expired.json | POST /posts | 400 | BUSINESS_ERROR "사진 업로드 유효 시간이 지났습니다." |
| upload/posts-create__400-upload-used.json | POST /posts | 400 | BUSINESS_ERROR "이미 사용된 사진입니다." |
| upload/posts-create__400-rejected-unsupported-format.json | POST /posts | 400 | BUSINESS_ERROR "WebP 이미지만 업로드할 수 있습니다." |
| upload/posts-create__400-rejected-too-large.json | POST /posts | 400 | BUSINESS_ERROR "더 작은 용량의 이미지를 업로드해 주세요." |
| upload/posts-create__400-title-too-long.json | POST /posts | 400 | BUSINESS_ERROR "제목은 10자 이하여야 합니다." |
| upload/posts-create__404-upload-not-found.json | POST /posts | 404 | BUSINESS_ERROR "업로드한 사진을 찾을 수 없습니다." |
| upload/posts-create__404-topic-not-found.json | POST /posts | 404 | BUSINESS_ERROR "게시물을 작성할 주제를 찾을 수 없습니다." |
| upload/posts-create__401-unauthorized.json | POST /posts | 401 | UNAUTHORIZED |
| upload/posts-create__403-banned.json | POST /posts | 403 | FORBIDDEN "차단된 회원입니다." |
| upload/posts-create__500-server-error.json | POST /posts | 500 | INTERNAL_ERROR |
| upload/posts-create__timeout.json | POST /posts | (응답 없음) | mock이 20초 지연 후 연결 종료(타임아웃 재현) |
| upload/images/smooth-1600x1200.jpg | (입력 이미지) | - | 결정적 그라디언트 JPEG, EXIF 방향 1 |
| upload/images/gradient-8000x6000.png, gradient-4608x3456.png | (입력 이미지) | - | 테스트가 `shared/scripts`의 생성기로 메모리·임시 폴더에 결정적 시드로 만든다(저장소에 커밋하지 않음) |
| upload/images/noise-1024x768.png | (입력 이미지) | - | 시드 고정 순수 노이즈 PNG(압축 최악 케이스) |
| upload/images/exif-orientation-1.jpg ~ exif-orientation-8.jpg | (입력 이미지) | - | 120×80, 모서리 4색 마커, EXIF 방향 1~8 |
| upload/images/exif-gps-orientation6.jpg | (입력 이미지) | - | GPS·XMP·ICC 메타가 든 방향 6 JPEG |
| upload/images/animated-3frames.gif, animated-3frames.webp | (입력 이미지) | - | 3프레임 움직이는 이미지 |
| upload/images/alpha-256x256.png, sample.heic | (입력 이미지) | - | 알파 PNG, HEIC 샘플 |
| upload/images/zero-bytes.jpg, corrupt-truncated.jpg | (입력 이미지) | - | 0바이트 파일, 중간이 잘린 JPEG |
| edit/golden/adjust-exposure.json | (골든 픽셀) | - | 입력 회색 128, 노출 +1/+0.5/-1 기대 205/162/78 (±2) |
| edit/golden/adjust-warmth.json | (골든 픽셀) | - | 회색 128, 따뜻함 ±1 기대 R/B |
| edit/golden/adjust-saturation.json | (골든 픽셀) | - | (200,50,50) 채도 -1/0/+1 기대 |
| edit/golden/tone-curve.json | (골든 곡선) | - | 대비·그림자·하이라이트·블랙 포인트 기대 값 |
| edit/golden/pipeline-order.json | (골든 픽셀) | - | 조정+필터 동시 적용 4×4 패치 기대 픽셀 |
| edit/golden/auto-adjust-low-contrast.json | (골든 통계) | - | 대비 낮은 이미지의 자동 보정값 기대 부호·범위 |
| edit/golden/auto-saturation-solids.json | (골든 값) | - | 피부·하늘·풀 단색의 자동 채도 0/0/+19/+18 |
| edit/golden/filter-original.json, filter-bw.json, filter-warm-cool.json, filter-vintage.json, filter-vivid.json, filter-two-paths.json | (골든 픽셀) | - | 필터별 4×4 패치 기대 픽셀 |
| edit/golden/pipeline-integration.json | (골든 픽셀) | - | 크롭+회전+흑백+노출 통합 기대 출력 |
| edit/golden/reference-*.png | (기준 이미지) | - | 같은 입력·같은 편집값의 기준 결과 이미지(ΔE 비교용) |
| shared/photo-edit/filters.json | (상수 파일) | - | 필터 6종 4×5 행렬, 조정 상수. strategy §4의 EDIT 영역 PR에서 생성 |
