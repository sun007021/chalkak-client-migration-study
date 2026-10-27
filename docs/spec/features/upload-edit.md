# 사진 업로드 · 편집 (UPL, EDIT)

업로드는 하단 가운데 버튼에서 시작한다. 버튼은 탭이 아니라 게이트로, 로그인·정지·이미 작성·주제 없음을 `GET /posts/today`로 가려낸 뒤 진입 시점의 `topicDate`를 업로드 화면에 고정한다. 사진은 앨범(권한 불필요)이나 카메라로 고르고, 고르면 항상 편집기(자르기·조정·필터)를 거친다. 편집을 마치면 곧바로 백그라운드에서 업로드 정책 발급과 WebP 인코딩(긴 변 4096, 품질 90→80→60→40, 필요하면 0.85배 축소)을 시작하고, "전시하기"를 누르면 준비를 기다렸다가 URL 만료를 확인하고 presigned PUT과 `POST /posts`로 제출한다. 응답이 유실되면 `GET /posts/today`로 복구하고, 오류는 errorCode·HTTP 상태·호출 API로만 분기한다.

- 관련 규칙: [POST-001](../../reference/business-rules/rules/post.md#post-001-작성-자격), [POST-002](../../reference/business-rules/rules/post.md#post-002-작성-가능-기간), [POST-003](../../reference/business-rules/rules/post.md#post-003-주제별-게시물-수), [POST-004](../../reference/business-rules/rules/post.md#post-004-사진-업로드), [POST-005](../../reference/business-rules/rules/post.md#post-005-제목-입력), [POST-006](../../reference/business-rules/rules/post.md#post-006-이미지-처리와-검수-상태), [POST-011](../../reference/business-rules/rules/post.md#post-011-작성-여부-사전-확인), [TOPIC-003](../../reference/business-rules/rules/topic.md#topic-003-참여-기간과-상태)
- 관련 결정: [D-01](../decisions.md#d-01-제목캡션-길이-계산), [D-02](../decisions.md#d-02-서버-오류-분기는-errorcode--http-상태--호출-api로만), [D-05](../decisions.md#d-05-게스트-제한), [D-07](../decisions.md#d-07-게시물-생성-응답-유실-복구post-011), [D-08](../decisions.md#d-08-정지banned-회원), [D-13](../decisions.md#d-13-사진-편집-필터), [D-14](../decisions.md#d-14-업로드-진입업로드-흐름), [D-17](../decisions.md#d-17-토큰-저장갱신), [D-20](../decisions.md#d-20-오류-화면과-토스트), [D-21](../decisions.md#d-21-네트워크-타임아웃)
- 근거 약어: iOS = [legacy-ios](../../reference/legacy-ios.md), AN = [legacy-android](../../reference/legacy-android.md), API = [api-contract](../../reference/api-contract.md). PE = 원본 `client/android/docs/architecture/photo-edit.md`, PIE = 같은 폴더 `post-image-encoding.md`, AN-src = 원본 Android 소스(`feature/photoedit`, `domain/model/photoedit`, `feature/upload`).

## 화면

### 1. 업로드 진입 게이트 (화면 없음, 하단 가운데 "+" 버튼)

- 진입 조건: 메인 하단바의 가운데 업로드 버튼. 탭이 아니므로 선택 상태가 바뀌지 않는다.
- 구성 요소: 버튼 누름 → 확인 중(중복 입력 무시) → 통과하면 업로드 화면 / 막히면 토스트 또는 로그인 화면.
- 사용자 동작: 버튼 탭(확인 중 연타는 1회만 처리).

### 2. 업로드 화면 (screen_view `photo_upload`)

- 진입 조건: 게이트 통과. 화면은 게이트가 받은 `topicDate`를 고정해 가진다.
- 구성 요소:
  1. 상단 바: 뒤로가기, 제목 "전시하기".
  2. 안내: "주제 ‘{주제}’에 맞는 한 장", "앨범에서 고르거나 지금 찍어요".
  3. 사진 영역: 비어 있으면 앨범 버튼과 카메라 버튼(카메라가 없으면 숨김), 고르면 선택한 사진을 원본 비율로 보여 준다.
  4. 제목 입력(여러 줄 허용, 플레이스홀더 "작품 제목은 선택이에요.").
  5. 주제 로드 오류 문구와 "다시 시도".
  6. 버튼 "전시하기"(제출 중 "전시 중...").
- 사용자 동작: 앨범 선택, 촬영, 사진 탭(다시 편집), 제목 입력, "전시하기", 뒤로가기.

### 3. 사진 편집기 (업로드 화면 위 전체 화면, 내비게이션 목적지 아님)

- 진입 조건: 사진을 고르거나 찍은 직후, 또는 업로드 화면에서 선택한 사진을 탭.
- 구성 요소: 상단 "취소"/"완료", 사진 미리보기, 하단 탭 "자르기"/"조정"/"필터"(처음 선택은 자르기).
  - 자르기 탭: 비율 버튼 9종, "90도 회전", "초기화", 자르기 프레임(끌기·모서리 조절, 3×3 격자).
  - 조정 탭: 항목 줄("자동", 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함), 눈금자 슬라이더, "초기화".
  - 필터 탭: 필터 6종 썸네일 줄.
- 사용자 동작: 위 도구 조작, "완료"(편집값 확정), "취소".

### 4. 업로드 성공 화면 (screen_view `photo_upload_success`)

- 진입 조건: `POST /posts`가 201이거나 응답 유실 복구에서 `isPosted=true`를 확인한 뒤.
- 구성 요소: 전시한 사진 카드, 문구 "‘{주제}’을/를 기록했어요.", 상태 안내문, 버튼 "확인했어요.".
- 사용자 동작: "확인했어요."를 누르면 전시 탭의 업로드한 날짜로 이동한다.

## 요구사항

### 진입 게이트 (UPL)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-UPL-001 | 게스트가 업로드 버튼을 누르면 API를 부르지 않고 "게시물을 추가하려면 로그인이 필요해요"를 토스트로 보여 준다. | D-05, AN §2.8 |
| REQ-UPL-002 | 로그인 상태의 업로드 버튼은 `GET /posts/today`를 한 번 부르고, 응답을 기다리는 동안 다시 눌러도 요청을 더 보내지 않는다. | D-14, AN §2.8, POST-011 |
| REQ-UPL-003 | 응답이 `isPosted=true`이면 업로드 화면을 열지 않고 "이미 이 주제에 게시물을 작성했어요."를 토스트로 보여 준다. | D-14, iOS §2.8 |
| REQ-UPL-004 | `/posts/today`가 404이면 "지금 참여할 수 있는 주제가 없어요."를, 403이면 "이용이 정지되어 게시물을 작성할 수 없어요."를 보여 주고 같은 요청을 다시 보내지 않는다. | D-14, D-08 |
| REQ-UPL-005 | `/posts/today`가 401이면 D-17에 따라 갱신 후 재시도하고, 재인증이 필요하면 로그인 화면으로 보낸다. | D-14, D-17 |
| REQ-UPL-006 | `/posts/today`의 그 밖의 실패(네트워크, 5xx, 응답 검증 실패)는 "게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요."를 보여 준다. | D-14, AN §2.8 |
| REQ-UPL-007 | `isPosted=false`인데 `postId`나 `moderationStatus`가 있거나, `isPosted=true`인데 `postId`·`moderationStatus`가 없으면 잘못된 응답으로 보고 REQ-UPL-006으로 처리한다. | iOS PhotoUploadFeatureTests L415, API §1.3 |
| REQ-UPL-008 | 게이트를 통과하면 응답의 `topicDate`를 업로드 화면에 고정하고, 화면이 열려 있는 동안 KST 자정이 지나도 그 `topicDate`의 주제로 제출한다. | D-14, AN §2.8 |
| REQ-UPL-009 | 업로드 화면은 `GET /topics?date={topicDate}`로 `topicId`와 제목을 받고, 응답의 `topicDate`가 요청과 다르면 잘못된 응답으로 처리한다. | D-14, iOS PhotoUploadFeatureTests L492 |
| REQ-UPL-010 | 주제를 받지 못하면 화면 안에 "주제를 불러오지 못했어요. 다시 시도해 주세요."와 "다시 시도"를 보여 주고, "다시 시도"는 주제만 다시 받는다. | iOS §2.8, AN-src PhotoUploadScreen |
| REQ-UPL-011 | 게이트 확인 중에 사용자가 화면을 벗어나면 대기 중인 요청과 뒤늦게 시작되는 요청을 모두 취소한다. | iOS PhotoUploadFeatureTests L354 |

### 사진 선택과 촬영 (UPL)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-UPL-012 | 앨범 선택은 권한이 필요 없는 시스템 선택기로 이미지 한 장만 고른다. | D-14, iOS §2.8 |
| REQ-UPL-013 | 카메라는 시스템 카메라(또는 플랫폼 카메라 UI)로 한 장을 촬영하고, 카메라를 쓸 수 없는 기기와 웹 데스크톱에서는 카메라 버튼을 숨긴다. | D-14, AN §2.8, iOS §2.8 |
| REQ-UPL-014 | 촬영본은 기기 앨범에 한 번만 저장하고(전시할 때 다시 저장하지 않으며, 앨범에서 고른 사진은 저장하지 않는다), 저장 파일은 JPEG이다. | D-14, iOS PhotoUploadFeatureTests L124·L156, AN §2.8 |
| REQ-UPL-015 | 촬영본 저장이 실패하거나 권한이 거부되면 "사진을 갤러리에 저장하지 못했어요."만 토스트로 띄우고 선택한 사진과 업로드는 그대로 이어 갈 수 있다. | D-14, iOS PhotoUploadFeatureTests L172 |
| REQ-UPL-016 | 업로드 화면을 나간 뒤 늦게 끝난 촬영본 저장의 실패도 앱 토스트로 알린다. | iOS PhotoUploadFeatureTests L197 |
| REQ-UPL-017 | 사진을 고르거나 찍으면 항상 편집기를 먼저 연다. | PIE, iOS PhotoEditFeatureTests L649 |
| REQ-UPL-018 | 읽을 수 없거나 비어 있는 사진 데이터는 편집기를 열지 않고 "사진을 준비하지 못했어요. 다시 시도해 주세요."를 보여 준다. | iOS PhotoUploadFeatureTests L227 |
| REQ-UPL-019 | 사진 선택·로딩 결과는 가장 최근 선택의 것만 반영하고 이전 선택의 늦은 결과는 버린다. | iOS PhotoUploadFeatureTests L307 |
| REQ-UPL-020 | 선택한 사진은 원본 비율로 보여 준다. | iOS PhotoUploadFeatureTests L679 |
| REQ-UPL-021 | 선택된 사진을 탭하면 저장된 편집값으로 편집기를 다시 연다. | PIE, iOS PhotoEditFeatureTests L729 |

### 제목 입력 (UPL)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-UPL-022 | 제목은 선택 입력이며 앞뒤 공백을 제거한 뒤 Unicode code point 10개까지 입력할 수 있고, 11번째부터는 입력되지 않으며 붙여넣기는 10 code point까지만 받는다. | D-01, POST-005 |
| REQ-UPL-023 | 제목이 비었거나 공백뿐이면 제목 없음으로 보고 `POST /posts`에 `title: null`(키 생략과 서버에서 동일)을 보내고, 값이 있으면 앞뒤 공백을 제거한 값을 보낸다. | D-01, API §6.2 H1·H5 |
| REQ-UPL-024 | 이모지는 한 글자(code point)로 세어 10개까지 허용하고, 결합 이모지는 구성 code point 수만큼 센다. | D-01, API §6.2 H4 |

### 이미지 준비와 WebP 규격 (UPL)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-UPL-025 | 편집을 마친 즉시(편집 없이 확정한 경우 포함) 백그라운드에서 `POST /posts/uploads` 정책 발급과 로컬 WebP 준비를 시작하고, 이 단계에서는 S3로 전송하지 않는다. | D-14, PIE, AN §2.8 |
| REQ-UPL-026 | 정책 응답의 `contentType`이 `image/webp`가 아니면 인코딩하지 않고 준비 실패로 처리한다. | D-14, AN §2.8, POST-004 |
| REQ-UPL-027 | 인코딩 입력은 EXIF 방향을 반영한 이미지이며, 긴 변이 4096을 넘으면 4096 이하로 줄이고 어떤 경우에도 확대하지 않는다. | PIE, iOS §2.8, 00-overview §6(`POST_IMAGE_MAX_LONG_EDGE`) |
| REQ-UPL-028 | 편집이 있으면 PIE 순서(디코드 → EXIF 회전 → 편집 적용 → 인코딩)로 원본에서 다시 그리고, 편집하지 않은 사진은 다시 그리지 않고 그대로 인코딩한다. | PIE, PE §1, AN-src PhotoEdit.isIdentity |
| REQ-UPL-029 | 편집 결과는 한 번만 손실 압축한다(중간 JPEG 변환 없음). | D-13, iOS §5.1-11 |
| REQ-UPL-030 | 인코딩은 정지 이미지 손실(lossy) WebP이며 품질을 90 → 80 → 60 → 40 순으로 낮춰 가며 첫 번째로 `maxBytes` 이하가 되는 결과를 쓴다. | PIE, 공통 상수 `WEBP_QUALITY_LADDER` |
| REQ-UPL-031 | 품질 40에서도 `maxBytes`를 넘으면 가로·세로를 0.85배로 줄여 품질 사다리를 다시 처음부터 시도하고, 이 축소는 최대 3번(총 4라운드)까지만 한다. | PIE, AN §2.8 |
| REQ-UPL-032 | 4라운드 안에 `maxBytes` 이하가 되지 못하면 준비 실패로 처리하며, `maxBytes`는 항상 정책 응답값을 쓰고 크기가 정확히 `maxBytes`인 파일은 허용한다. | PIE, API §3.1·§6.2 U1 |
| REQ-UPL-033 | 인코딩 결과는 RIFF/WEBP 헤더를 가진 파일이어야 하고 EXIF·위치 등 메타데이터를 포함하지 않으며 회전은 픽셀에 반영돼 있어야 한다. | iOS §2.8, AN §2.8, D-13 |
| REQ-UPL-034 | 인코딩 중 사진 교체·화면 이탈이 일어나면 인코딩을 즉시 취소하고 결과 파일과 임시 파일을 삭제하며, 늦게 끝난 이전 작업이 새 선택 상태를 덮지 않는다. | PIE, iOS PhotoUploadFeatureTests L788·L813 |
| REQ-UPL-035 | 편집을 다른 값으로 다시 확정하면 이전 준비를 취소하고 새로 준비하며, 같은 편집값으로 확정하면 다시 준비하지 않는다. | PIE, iOS PhotoEditFeatureTests L763 |
| REQ-UPL-036 | 사전 준비 실패는 선택한 사진과 제목을 유지한 채 즉시 실패 문구로 알리고, 별도 재시도 버튼 없이 "전시하기"가 정책 발급과 준비부터 다시 시도한다. | PIE, AN §2.8 |

### 제출 흐름 (UPL)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-UPL-037 | "전시하기"는 사진이 선택돼 있고 제출 중이 아닐 때 활성이며, 사진이 아직 준비 중이거나 준비에 실패한 상태여도 활성이다. | iOS PhotoUploadFeatureTests L42·L58, AN §2.8 |
| REQ-UPL-038 | 제출 중에는 버튼 문구를 "전시 중..."으로 바꾸고 연타해도 제출은 한 번만 일어나며, 입력과 사진은 건드릴 수 없다. | D-14, AN-src PhotoUploadScreen |
| REQ-UPL-039 | 준비가 끝나지 않았으면 제출을 보류한 채 "전시 중..." 상태로 준비 완료를 기다렸다가 자동으로 이어 간다. | PIE, AN §2.8 |
| REQ-UPL-040 | 제출 순서는 URL 만료 확인 → `PUT {uploadUrl}` → `POST /posts {topicId, photoUploadId, title}`이다. | D-14, API §3.1 |
| REQ-UPL-041 | 업로드 URL은 정책 응답을 받은 시각에서 `expiresInSeconds - 5초`가 지나면 만료로 보고(단조 시계 기준) 새 정책을 발급하며, 새 정책은 새 `uploadId`다. | D-14, 공통 상수 `UPLOAD_URL_SAFETY_MARGIN`, PIE |
| REQ-UPL-042 | 새 정책의 `maxBytes`가 준비된 파일보다 작으면 저장해 둔 편집값으로 원본에서 다시 인코딩하고, 크거나 같으면 준비된 파일을 재사용한다. | D-14, PIE |
| REQ-UPL-043 | `PUT`은 인증 헤더 없이 보내고 `Content-Type`은 정책 응답값 그대로이며 본문은 WebP 바이트 그대로이다. | D-14, API §3.1·§9 |
| REQ-UPL-044 | `PUT` 전에 파일 크기가 `maxBytes`를 넘는지 검사하고, 넘으면 보내지 않는다. | API §3.1 |
| REQ-UPL-045 | 일반 API 연결은 10초·응답은 15초, `PUT`은 60초 제한을 쓰고 정책 발급과 `PUT`은 네트워크 오류·5xx에서 최대 2회 자동 재시도하며 `POST /posts`는 자동 재시도하지 않는다. | D-21 |
| REQ-UPL-046 | `POST /posts` 본문에는 `topicId`, `photoUploadId`(정책의 `uploadId`), `title`을 담고, 응답 201의 `moderationStatus`는 `VALIDATING` 또는 `PENDING`만 받아들인다. | API §1.3, AN §2.8 |
| REQ-UPL-047 | 제출이 실패하면 선택한 사진과 입력한 제목을 유지한 채 실패 문구를 보여 주고 다시 제출할 수 있게 한다. | D-14 |
| REQ-UPL-048 | 제출이 끝나거나 실패하거나 화면을 나가면 소유한 임시 파일을 삭제한다. | PIE, AN §2.8 |

### 오류 분기와 복구 (UPL)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-UPL-049 | `POST /posts`가 타임아웃·연결 끊김으로 응답을 받지 못하면 자동 재전송하지 않고 `GET /posts/today`로 확인해, `isPosted=true`이면 성공 화면으로 간다(상태는 응답의 `moderationStatus`). | D-07, POST-011 |
| REQ-UPL-050 | 복구 확인에서 `isPosted=false`이면 "네트워크 연결을 확인해 주세요."를 보여 주고 같은 `uploadId`로 다시 제출할 수 있게 한다(재제출은 URL이 만료되지 않았으면 같은 URL에 `PUT`을 다시 보내고, 만료됐으면 REQ-UPL-041에 따라 새 정책을 받는다). | D-07, API §3.1(업로드 ID 1시간) |
| REQ-UPL-051 | `POST /posts`가 400 `BUSINESS_ERROR`이면 message로 분기하지 않고 `GET /posts/today`를 다시 불러 판정한다. | D-02 |
| REQ-UPL-052 | 판정에서 `isPosted=true`이면 성공 화면 대신 "이미 이 주제에 전시한 사진이 있어요."를 보여 준다. | D-02 |
| REQ-UPL-053 | 판정에서 `/posts/today`가 404이거나 응답의 `topicDate`가 진입 때와 다르면 "주제가 변경되어 전시할 수 없어요."를 보여 준다. | D-02 |
| REQ-UPL-054 | 그 밖의 400(업로드 만료·재사용·처리 거절 등)은 서버 `message`를 그대로 보여 주고 사진 준비(정책 발급과 인코딩)를 처음부터 다시 하도록 상태를 되돌린다. | D-02, API §3.1·§5.2 |
| REQ-UPL-055 | `POST /posts`가 401이면 D-17에 따라 갱신 후 1회 재전송하고, 재인증이 필요하면 로그인 화면으로 보낸다. | D-17, AN §2.8 |
| REQ-UPL-056 | `POST /posts/uploads`나 `POST /posts`가 403이면 "이용이 정지되어 게시물을 작성할 수 없어요."를 보여 주고 같은 요청을 다시 보내지 않는다. | D-08, API §2.6 |
| REQ-UPL-057 | 정책 발급·`PUT`·생성 중 네트워크 오류는 "네트워크 연결을 확인해 주세요."로 알린다. | AN §2.8, D-20 |
| REQ-UPL-058 | 정책 발급 실패(그 밖)는 "사진을 준비하지 못했어요. 다시 시도해 주세요."로, `PUT` 거절(그 밖 HTTP 실패)은 "사진을 업로드하지 못했어요. 다시 시도해 주세요."로, 생성의 그 밖 실패는 "전시를 완료하지 못했어요. 다시 시도해 주세요."로 알린다. | iOS §2.8, AN §2.8 |
| REQ-UPL-059 | `PUT`이 거절된 뒤의 다음 제출은 이전 정책을 버리고 정책 발급부터 다시 한다. | API §3.1(U4·U5), PIE |

### 성공 화면 (UPL)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-UPL-060 | 성공 화면은 "‘{주제}’을/를 기록했어요."를 보여 주며 받침이 있는 한글 음절로 끝나면 "을", 받침이 없거나 한글이 아니거나 비어 있으면 "를"을 쓰고 끝의 공백은 무시한다. | D-14, iOS PhotoUploadFeatureTests L10~L24, AN-src PhotoUploadSuccessScreen |
| REQ-UPL-061 | `moderationStatus`가 `PENDING`이면 "검수를 기다리고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!"를, 그 밖(`VALIDATING`)이면 "사진을 확인하고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요!"를 보여 준다. | D-14, AN §2.8 |
| REQ-UPL-062 | "확인했어요."를 누르면 전시 탭의 업로드한 `topicDate` 날짜로 이동한다. | D-14, AN §1.4 |
| REQ-UPL-063 | 업로드 성공 뒤 홈(히어로·AI 카드·이번 주 기록)과 기록(그 달 캐시), 전시 캐시는 다시 불러온다. | D-06, POST-011 |
| REQ-UPL-064 | 성공 화면이 보이는 동안 업로드 화면으로 되돌아가 같은 사진을 다시 제출할 수 없다. | AN §1.4(`popUpTo(PhotoUpload)`) |

### 편집기 공통 (EDIT)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-EDIT-001 | 편집기는 업로드 화면 위의 전체 화면이고 상단에 "취소"와 "완료", 하단에 "자르기"·"조정"·"필터" 탭이 있으며 처음에는 "자르기" 탭이 선택된다. | AN §2.8, AN-src PhotoEditUiState |
| REQ-EDIT-002 | 편집기는 편집값(90도 회전 횟수, 자르기 영역, 필터, 조정 값)만 만들고 실제 픽셀은 업로드 준비 때 원본에서 같은 값으로 다시 그리며, 미리보기와 업로드 결과는 같은 영역·같은 색이어야 한다. | PE §1 |
| REQ-EDIT-003 | "취소"는 이번 편집의 모든 변경을 버린다. 처음 고른 사진의 편집을 취소하면 사진 선택을 취소하고, 다시 편집 중이던 사진의 편집을 취소하면 기존 선택과 준비 결과를 유지한다. | AN §2.8, iOS PhotoEditFeatureTests L671, PIE |
| REQ-EDIT-004 | "완료"는 편집값을 확정해 업로드 화면으로 돌려주며, 자르기 영역이 전체와 1e-3 이내로 같으면 전체로, 자동 보정이 꺼져 있으면 자동 보정값은 버리고 확정한다. | AN-src PhotoEditViewModel.normalized |
| REQ-EDIT-005 | 편집값이 하나도 바뀌지 않았으면(회전 0, 전체 자르기, 원본 필터, 조정 0) 편집하지 않은 사진으로 취급한다. | AN-src PhotoEdit.isIdentity |
| REQ-EDIT-006 | 편집 이미지 렌더링에 실패하면 편집기를 닫지 않고 "사진을 편집하지 못했어요. 다시 시도해 주세요."를 보여 준다. | iOS §2.9, iOS PhotoEditFeatureTests L602 |
| REQ-EDIT-007 | 편집에 쓰는 원본은 EXIF 방향을 이미 반영한 사진(화면에 보이는 방향)이며, 미리보기는 긴 변 1440 px 이내로 줄여 쓸 수 있다. | PE §2, AN-src PhotoEditPreviewEffects |
| REQ-EDIT-008 | 편집 처리 순서는 자르기·회전(기하) → 색 조정 → 필터이다. | PE §3, PIE |
| REQ-EDIT-009 | 같은 입력 이미지와 같은 편집값은 플랫폼이 달라도 평균 ΔE 3 이하의 같은 결과여야 한다. | D-13 |

### 자르기·회전 (EDIT)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-EDIT-010 | 자르기 비율은 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9 아홉 가지이며 이 순서로 보여 주고 처음 선택은 "자유"이다. | D-13, AN-src CropAspectRatio |
| REQ-EDIT-011 | 비율을 고르면 그 비율로 사진 안에서 가장 크게 들어가는 자르기 영역으로 바꾸고, "자유"는 현재 영역을 유지하며 비율 고정을 푼다. | AN-src PhotoEditViewModel.onAspectRatioSelect |
| REQ-EDIT-012 | "원본" 비율은 지금 회전 방향의 사진 가로세로 비율을 고정 비율로 쓴다. | AN-src PhotoEditViewModel |
| REQ-EDIT-013 | 자르기 영역은 끌어서 옮기고 모서리를 끌어 크기를 바꾸며, 사진 밖으로 나가지 않고 짧은 변이 사진 짧은 변의 0.1배(10%) 아래로 줄지 않는다. | AN-src CropGeometry.MIN_CROP_FRACTION |
| REQ-EDIT-014 | "90도 회전"은 시계 방향으로 90도씩 돌리고 4번이면 처음으로 돌아오며, 고정 비율이 있으면 회전 뒤에도 같은 비율로 다시 가장 크게 맞춘다. | PE §2, AN-src PhotoEditViewModel.onRotateClick |
| REQ-EDIT-015 | "원본" 비율이거나 영역이 사진 전체인 "자유"에서 회전하면 영역이 사진과 함께 돌며 고정 비율의 가로세로가 뒤바뀐다. | AN-src PhotoEditViewModel.onRotateClick |
| REQ-EDIT-016 | 자르기의 "초기화"는 회전과 자르기 영역·비율만 처음으로 되돌리고 필터와 조정은 유지한다. | AN-src PhotoEditViewModel.onResetClick |
| REQ-EDIT-017 | 수평 보정 각도(`straightenDegrees`)는 UI가 없으며 항상 0이다. | PE §2, AN §2.8 |
| REQ-EDIT-018 | 자르기·회전은 업로드할 때 긴 변 4096으로 줄인 이미지에 적용한다. | PIE |

### 조정 (EDIT)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-EDIT-019 | 조정 항목은 자동(강도 0~1), 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함이며 이 순서로 보여 주고, 직접 조정 값의 범위는 -1~1(화면 표시는 100배한 정수 -100~100)이다. | D-13, AN §2.8, AN-src PhotoEditUiState |
| REQ-EDIT-020 | 처음 선택된 조정 항목은 "자동"이고 자동 보정은 꺼져(강도 0) 있다. | AN-src PhotoEditUiState |
| REQ-EDIT-021 | 다른 항목에서 "자동"으로 옮겨 오면 꺼져 있을 때만 강도 1로 켜고, 이미 "자동"이 선택된 상태에서 다시 누르면 켜짐(1)과 꺼짐(0)을 번갈아 바꾼다. | AN-src PhotoEditViewModel.onAdjustItemSelect |
| REQ-EDIT-022 | 항목에 적용되는 값은 사용자가 직접 만졌으면 그 값, 아니면 자동 보정값 × 강도이며, 자동 보정을 끄거나 강도를 바꿔도 사용자가 직접 만진 항목은 그대로 남는다. | PE §4 |
| REQ-EDIT-023 | 항목을 자동 보정 몫(자동 보정값 × 강도, 꺼져 있으면 0)과 같은 값으로 되돌리면 직접 만진 표시를 지워 그 항목이 다시 자동 보정을 따르게 한다. | PE §4, AN-src PhotoAdjustmentLayers.withValue |
| REQ-EDIT-024 | 조정 탭의 "초기화"는 자동 강도를 0으로 하고 직접 만진 값을 모두 지우되 분석해 둔 자동 보정값은 유지한다. | AN-src PhotoAdjustmentLayers.cleared |
| REQ-EDIT-025 | 자동 보정값은 편집기를 처음 열 때, 자르기를 바꾼 뒤 탭을 옮길 때, 자동 보정을 켠 채 "완료"할 때 자른 영역을 긴 변 256 px로 줄여 분석해 정하고, 같은 자르기로 이미 분석했으면 다시 분석하지 않는다. | PE §4, AN-src PhotoEditViewModel.refreshAutoAdjustments |
| REQ-EDIT-026 | 자동 보정은 노출 → 블랙 포인트 → 그림자·하이라이트·대비 → 채도 순으로 정하고(따뜻함은 정하지 않는다), 각 값은 소수 둘째 자리(화면의 정수)로 반올림한다. | PE §4, AN-src PhotoAutoAdjuster |
| REQ-EDIT-027 | 사진을 분석할 수 없으면 자동 보정은 아무것도 바꾸지 않는다. | AN-src PhotoEditViewModel |

### 필터 (EDIT)

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| REQ-EDIT-028 | 필터는 원본, 흑백, 따뜻하게, 차갑게, 빈티지, 선명하게 여섯 가지이며 이 순서로 보여 주고 처음은 "원본"이다(iOS의 선명·크롬·페이드·흑백·누아르 목록은 쓰지 않는다). | D-13, AN-src PhotoEditLabels |
| REQ-EDIT-029 | 필터는 조정까지 적용한 0~255 R·G·B·A 값에 4×5 컬러 행렬을 곱하고 결과를 반올림해 0~255로 자르는 마지막 단계이며, 행렬 값은 아래 표와 `shared/photo-edit/filters.json`이 같아야 한다. | D-13, PE §3, AN-src PhotoColorTransform |

### 부록: 편집 연산 규격 (EDIT, 수치 상수)

모든 수치의 근거는 PE §3~4와 AN-src(`domain/model/photoedit/*`)이며, 구현은 `shared/photo-edit/filters.json`과 이 표를 단일 근거로 삼는다.

#### 필터 4×5 행렬 (행: 결과 R, G, B, A / 열: 입력 R, G, B, A, 더하는 값)

결과 값 = 입력 R·m0 + G·m1 + B·m2 + A·m3 + m4 (색 값은 0~255, 더하는 값도 0~255 단위).

| 필터 | 결과 R | 결과 G | 결과 B | 결과 A |
| --- | --- | --- | --- | --- |
| 원본 | (적용 안 함) | (적용 안 함) | (적용 안 함) | (적용 안 함) |
| 흑백 | 0.299, 0.587, 0.114, 0, 0 | 0.299, 0.587, 0.114, 0, 0 | 0.299, 0.587, 0.114, 0, 0 | 0, 0, 0, 1, 0 |
| 따뜻하게 | 1.08, 0, 0, 0, 8 | 0, 1.02, 0, 0, 4 | 0, 0, 0.88, 0, 0 | 0, 0, 0, 1, 0 |
| 차갑게 | 0.9, 0, 0, 0, 0 | 0, 1, 0, 0, 2 | 0, 0, 1.1, 0, 10 | 0, 0, 0, 1, 0 |
| 빈티지 | 0.63, 0.35, 0.09, 0, 18 | 0.16, 0.76, 0.08, 0, 14 | 0.12, 0.24, 0.51, 0, 10 | 0, 0, 0, 1, 0 |
| 선명하게 | 1.2754, -0.2503, -0.0252, 0, 0 | -0.0746, 1.0997, -0.0252, 0, 0 | -0.0746, -0.2503, 1.3248, 0, 0 | 0, 0, 0, 1, 0 |

#### 조정 항목 상수

| 항목 | 상수 | 값 |
| --- | --- | --- |
| 노출 | 1.0이 올리는 밝기 | 1.5 EV (빛 배율 = 2^(1.5 × v)), 선형 값에 곱함 |
| 따뜻함 | gain | 0.25 (선형 R × (1 + 0.25w), 선형 B × (1 − 0.25w), G 불변) |
| 채도 | 밝기 기준 | 선형 L = 0.2125R + 0.7154G + 0.0721B, 결과 = L + (1 + v) × (색 − L) |
| 블랙 포인트 | 범위 | 0.3. v > 0: 입력 밝기 0.3v 아래를 0으로 보내고 `(x − b)/(1 − b)`로 다시 펴며, v < 0: 출력 최소값을 0.3 × (−v)로 띄움 |
| 그림자 | 톤 양 | 0.25. `t += v × 0.25 × 4 × t × (1 − t)²` |
| 하이라이트 | 톤 양 | 0.25. `t += v × 0.25 × 4 × t² × (1 − t)` |
| 대비 | 대비 양 | 0.6. `t −= v × 0.6 × sin(2πt) / (2π)` |

#### sRGB 변환과 처리 순서

| 단계 | 식 / 규칙 |
| --- | --- |
| 저장 → 선형 | x ≤ 0.04045 이면 x / 12.92, 아니면 ((x + 0.055) / 1.055)^2.4 |
| 선형 → 저장 | x ≤ 0.0031308 이면 12.92x, 아니면 1.055 × x^(1/2.4) − 0.055 |
| 1. 선형 단계 | 픽셀 R·G·B(0~255 → 0~1)를 선형으로 바꾼 뒤 노출·따뜻함 배율 곱 → 채도 적용 |
| 2. 저장 단계 | 선형을 저장 값으로 돌린 뒤 톤 곡선 표로 변환(표는 256칸, 칸 사이는 직선 보간, 블랙 포인트 → 그림자 → 하이라이트 → 대비 순서로 t를 갱신하고 표가 줄어들지 않도록 누적 최대값을 취함) |
| 3. 필터 | 위 4×5 행렬을 0~255 값에 곱하고 반올림 후 0~255로 자름 |
| 알파 | 조정 단계는 알파를 바꾸지 않는다 |

톤 곡선 표(256칸) 생성: i번째 입력 `x = i / 255`를 블랙 포인트 `t = clamp((x − inputBlack)/(1 − inputBlack), 0, 1)`로 편 뒤 그림자·하이라이트·대비를 순서대로 적용하고 `y = outputBlack + (1 − outputBlack) × clamp(t, 0, 1)`로 만든다. 여기서 inputBlack = max(v_bp, 0) × 0.3, outputBlack = max(−v_bp, 0) × 0.3이다.

#### 자동 보정 상수 (밝기 L = 0.2126R + 0.7152G + 0.0722B, 저장 값 기준 256칸 히스토그램)

| 단계 | 상수 | 값 |
| --- | --- | --- |
| 노출 | 흰 점 백분위 / 목표 흰색 / 최소 흰색 | 0.995 / 0.96 / 0.05 |
| 노출 | 반영 비율(tempering) | 0.6 |
| 노출 | 밝은 사진 기준 중앙값 / 기울기 | 0.62 / 1.2 |
| 노출 | 허용 범위 | −0.5 ~ 1.0 EV (값 = EV / 1.5로 환산) |
| 블랙 포인트 | 백분위 / 여유 / 반영 비율 / 상한 | 0.005 / 0.01 / 0.8 / 0.25 (값 = 입력 블랙 / 0.3) |
| 그림자 | 어두운 기준 / 가득 찬 비율 / 최대 | 0.25 / 0.8 / 0.45 |
| 하이라이트 | 밝은 기준 / 가득 찬 비율 / 최대 | 0.85 / 0.3 / −0.5 |
| 그림자·하이라이트 | 반응 지수 | 0.7 (비율^0.7) |
| 대비 | 하위·상위 사분위 / 목표 중간 폭 / 기울기 / 최대 | 0.25·0.75 / 0.42 / 2.0 / 0.4 (낮추지 않음) |
| 채도 | 흑백 기준 / 목표 / 기울기 / 최대 | 0.05 / 0.7 / 0.6 / 0.25, 결과 × (1 − 피부색 비율) |
| 공통 | 반올림 | 소수 둘째 자리(0.5는 0에서 먼 쪽) |
| 분석 | 분석 표본 긴 변 / 원본 로드 긴 변 | 256 / 1024 |
| 채도 통계 | 채도 = 가장 큰 채널 − 가장 작은 채널, 하위 90% 지점 | 90% |
| 피부색 판정 | R ≥ G ≥ B, R ≥ 0.2, (R−B)/R가 0.1~0.6, 색상 0~50° | 위 조건을 모두 만족하면 피부색 |

예: 밝은 피부색(0.94, 0.78, 0.69)과 어두운 피부색(0.45, 0.30, 0.22) 단색 사진의 자동 채도는 0, 하늘색(0.53, 0.81, 0.92)은 +19, 풀색(0.30, 0.60, 0.20)은 +18이다.

#### 자동 보정 식

`P(f)`는 밝기 히스토그램에서 누적 비율이 처음 f 이상이 되는 칸 번호 / 255(없으면 1.0)이다. 밝기 칸 번호는 min(255, round(L × 255))이다. `round2(v)`는 sign(v) × floor(|v| × 100 + 0.5) / 100이다. `linear`, `gamma`는 위 sRGB 변환이다.

| 값 | 식 |
| --- | --- |
| 노출 | white = P(0.995), median = P(0.5). white < 0.96이면 ev = log2(linear(0.96) / linear(max(white, 0.05))) × 0.6, 아니면 median > 0.62이면 ev = −(median − 0.62) × 1.2, 아니면 0. ev를 −0.5~1.0으로 자르고 노출 = round2(ev / 1.5) |
| expose(L) | gamma(min(1, linear(L) × 2^(1.5 × 노출))) |
| 블랙 포인트 | black = expose(P(0.005)), inputBlack = min(max(black − 0.01, 0) × 0.8, 0.25), 블랙 포인트 = round2(inputBlack / 0.3) |
| afterBlack(L) | 계산한 블랙 포인트의 inputBlack′ = max(블랙 포인트, 0) × 0.3 에 대해 clamp((expose(L) − inputBlack′) / (1 − inputBlack′), 0, 1) |
| 그림자 | dark = afterBlack(L) < 0.25인 칸의 비율 합, 그림자 = round2(0.45 × clamp(dark / 0.8, 0, 1)^0.7) |
| 하이라이트 | bright = afterBlack(L) > 0.85인 칸의 비율 합, 하이라이트 = round2(−0.5 × clamp(bright / 0.3, 0, 1)^0.7) |
| 대비 | spread = afterBlack(P(0.75)) − afterBlack(P(0.25)), 대비 = round2(clamp((0.42 − spread) × 2.0, 0, 0.4)) |
| 채도 | s = 채도 통계의 90% 지점. s ≤ 0.05이면 0, 아니면 round2(clamp((0.7 − s) × 0.6, 0, 0.25) × (1 − 피부색 비율)) |

#### 편집값 모델과 좌표(플랫폼 공통)

| 필드 | 의미 |
| --- | --- |
| `quarterTurns` | 시계 방향 90도 회전 횟수 0~3 |
| `crop.centerX`, `crop.centerY` | 회전 전 원본의 가로·세로에 대한 0~1 비율 (자르기 영역의 중심) |
| `crop.width`, `crop.height` | 90도씩 돌린 원본의 가로·세로에 대한 0~1 비율 |
| 전체 자르기 | (0.5, 0.5, 1, 1) |
| `filter` | 원본/흑백/따뜻하게/차갑게/빈티지/선명하게 |
| `adjustmentLayers` | 자동 보정값, 강도(0~1), 항목별 직접 값(-1~1) |

돌린 사진의 점 (xr, yr)을 원본 W×H의 점 (x, y)로: 0회전은 (xr, yr), 1회전은 (yr, H − xr), 2회전은 (W − xr, H − yr), 3회전은 (W − yr, xr)이다.

#### 업로드 인코딩 상수

| 이름 | 값 |
| --- | --- |
| 정책 `contentType` | `image/webp` (다르면 실패) |
| `maxBytes` | 정책 응답값(현재 5,242,880) |
| 입력 긴 변 상한 | 4096 px |
| 품질 사다리 | 90, 80, 60, 40 |
| 축소 비율 / 최대 축소 횟수 | 0.85배 / 3회 (총 4라운드) |
| URL 안전 여유 | 5초 |
| 업로드 URL 수명 | 300초(정책 `expiresInSeconds`) |
| 업로드 ID 사용 기한 | 발급 후 1시간 |

## 상태

### 업로드 화면 상태

| 상태 | 진입 조건 | 보이는 것 | 다음 전이 |
| --- | --- | --- | --- |
| 게이트 확인 중 | 업로드 버튼 | (화면 없음, 재탭 무시) | 통과 → 입력 대기, 막힘 → 토스트/로그인 |
| 입력 대기 | 게이트 통과, 사진 없음 | 앨범/카메라 버튼, "전시하기" 비활성 | 사진 선택 → 편집 중 |
| 편집 중 | 사진 선택·사진 탭 | 편집기 | 완료 → 준비 중, 취소(처음) → 입력 대기, 취소(재편집) → 이전 상태 |
| 준비 중 | 편집 완료 | 사진 + "전시하기" 활성 | 성공 → 준비 완료, 실패 → 준비 실패 |
| 준비 완료 | 정책 발급 + 인코딩 성공 | 사진 + "전시하기" | 전시하기 → 제출 중 |
| 준비 실패 | 준비 단계 실패 | 사진 유지 + 오류 문구 | 전시하기 → 처음부터 재준비하며 제출 |
| 제출 중 | "전시하기" | "전시 중...", 입력 잠금 | 성공 → 성공 화면, 실패 → 준비 완료/준비 실패, 응답 유실 → 복구 확인 |
| 복구 확인 | `POST /posts` 응답 유실 | "전시 중..." | `isPosted=true` → 성공 화면, `false` → 재제출 가능 |
| 성공 | 201 또는 복구 성공 | 성공 화면 | 확인 → 전시 탭 |

### 사진 준비 상태(백그라운드)

| 상태 | 전이 |
| --- | --- |
| 없음 → 정책 발급 중 | 편집 완료 |
| 정책 발급 중 → 인코딩 중 | 정책 `contentType`이 `image/webp` |
| 정책 발급 중 → 실패 | 발급 오류 또는 `contentType`이 다름 |
| 인코딩 중 → 준비 완료 | `maxBytes` 이하 WebP 생성 |
| 인코딩 중 → 실패 | 4라운드 후에도 초과 |
| 준비 완료 → 만료 | 제출 시점에 URL 만료 5초 전 |
| 어떤 상태 → 폐기 | 사진 교체, 다른 편집값 확정, 화면 이탈 |

## API 호출

### 호출 순서

| 순서 | 호출 | 핵심 요청 | 핵심 응답 |
| --- | --- | --- | --- |
| 1 | `GET /posts/today` | — | `{topicDate, isPosted, postId, moderationStatus}` |
| 2 | `GET /topics?date={topicDate}` | — | `{id, title, topicDate}` |
| 3 | `POST /posts/uploads` | 본문 없음 | 200 `{uploadId, uploadUrl, expiresInSeconds:300, contentType:"image/webp", maxBytes:5242880}` |
| 4 | `PUT {uploadUrl}` (S3 presigned, 인증 헤더 없음) | `Content-Type: {정책 contentType}`, 본문 WebP 바이트 | 200 |
| 5 | `POST /posts` | `{topicId, photoUploadId, title}` | 201 `{postId, moderationStatus: VALIDATING\|PENDING}` |
| 6 | (복구/판정) `GET /posts/today` | — | 위와 같음 |

1은 게이트, 2는 업로드 화면 진입, 3은 편집 완료 직후 백그라운드, 4~5는 "전시하기"에서 실행한다.

### 실패별 처리

| 호출 | HTTP + errorCode | 동작 | 사용자 문구 |
| --- | --- | --- | --- |
| `GET /posts/today` | 401 `UNAUTHORIZED` | D-17 갱신 후 1회 재시도, 재인증 필요면 로그인 화면 | — |
| `GET /posts/today` | 403 `FORBIDDEN` | 화면 열지 않음 | "이용이 정지되어 게시물을 작성할 수 없어요." |
| `GET /posts/today` | 404 `BUSINESS_ERROR` | 화면 열지 않음 | "지금 참여할 수 있는 주제가 없어요." |
| `GET /posts/today` | `isPosted=true` | 화면 열지 않음 | "이미 이 주제에 게시물을 작성했어요." |
| `GET /posts/today` | 그 밖(네트워크, 5xx, 검증 실패) | 화면 열지 않음 | "게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요." |
| `GET /topics` | 404/그 밖/날짜 불일치 | 화면 안에 오류 + "다시 시도" | "주제를 불러오지 못했어요. 다시 시도해 주세요." |
| `GET /topics` | 401 | D-17 | — |
| `POST /posts/uploads` | 403 `FORBIDDEN` | 재요청 없음 | "이용이 정지되어 게시물을 작성할 수 없어요." |
| `POST /posts/uploads` | 401 | D-17 | — |
| `POST /posts/uploads` | 네트워크 | 자동 재시도 후 실패면 준비 실패 | "네트워크 연결을 확인해 주세요." |
| `POST /posts/uploads` | 그 밖 | 준비 실패 | "사진을 준비하지 못했어요. 다시 시도해 주세요." |
| `PUT {uploadUrl}` | 네트워크·타임아웃 | 자동 재시도 후 실패면 제출 실패(입력 유지) | "네트워크 연결을 확인해 주세요." |
| `PUT {uploadUrl}` | S3 4xx/5xx(서명 불일치·만료 등) | 정책을 버리고 다음 제출에서 재발급 | "사진을 업로드하지 못했어요. 다시 시도해 주세요." |
| `POST /posts` | 타임아웃·연결 끊김(응답 없음) | 재전송하지 않고 `GET /posts/today`로 복구 확인 | 복구 실패(`isPosted=false`): "네트워크 연결을 확인해 주세요." |
| `POST /posts` | 400 `BUSINESS_ERROR` | `GET /posts/today`로 판정 | 판정 결과에 따라 아래 세 줄 |
| ↳ 판정 | `isPosted=true` | 성공 화면 대신 안내 | "이미 이 주제에 전시한 사진이 있어요." |
| ↳ 판정 | 404 또는 `topicDate` 변경 | 안내 | "주제가 변경되어 전시할 수 없어요." |
| ↳ 판정 | 그 밖 | 서버 message 표시 + 사진 준비 처음부터 다시 | 서버 `message` 그대로 |
| `POST /posts` | 403 `FORBIDDEN` | 재요청 없음 | "이용이 정지되어 게시물을 작성할 수 없어요." |
| `POST /posts` | 401 | D-17 | — |
| `POST /posts` | 404 `BUSINESS_ERROR` | 그 밖 실패로 처리 + 사진 준비 처음부터 다시 | "전시를 완료하지 못했어요. 다시 시도해 주세요." |
| `POST /posts` | 5xx, 201 응답 검증 실패 | 입력 유지 | "전시를 완료하지 못했어요. 다시 시도해 주세요." |

## 문구

| 키 | 문구 | 상황 |
| --- | --- | --- |
| upload.gate.login_required | 게시물을 추가하려면 로그인이 필요해요 | 게스트가 업로드 버튼 탭 (D-05) |
| upload.gate.already_posted | 이미 이 주제에 게시물을 작성했어요. | `isPosted=true` |
| upload.gate.no_open_topic | 지금 참여할 수 있는 주제가 없어요. | `/posts/today` 404 |
| upload.gate.banned | 이용이 정지되어 게시물을 작성할 수 없어요. | 403 (D-08) |
| upload.gate.check_failed | 게시물 작성 여부를 확인하지 못했어요. 다시 시도해 주세요. | 게이트 그 밖 실패 |
| upload.topic.load_failed | 주제를 불러오지 못했어요. 다시 시도해 주세요. | 주제 조회 실패 |
| upload.topic.retry | 다시 시도 | 주제 다시 시도 버튼 |
| upload.title | 전시하기 | 상단 바 제목 |
| upload.heading | 주제 ‘{주제}’에 맞는 한 장 | 사진 영역 안내 |
| upload.subheading | 앨범에서 고르거나 지금 찍어요 | 사진 영역 보조 문구 |
| upload.caption.placeholder | 작품 제목은 선택이에요. | 제목 입력 |
| upload.submit | 전시하기 | 제출 버튼 |
| upload.submitting | 전시 중... | 제출 중 |
| upload.camera.save_failed | 사진을 갤러리에 저장하지 못했어요. | 촬영본 저장 실패 (D-14) |
| upload.error.network | 네트워크 연결을 확인해 주세요. | 연결 실패·타임아웃, 복구 확인 실패 |
| upload.error.prepare | 사진을 준비하지 못했어요. 다시 시도해 주세요. | 정책 발급·인코딩·빈 사진 |
| upload.error.upload | 사진을 업로드하지 못했어요. 다시 시도해 주세요. | `PUT` 거절 |
| upload.error.create | 전시를 완료하지 못했어요. 다시 시도해 주세요. | 생성 거절·그 밖 |
| upload.error.duplicate | 이미 이 주제에 전시한 사진이 있어요. | 400 판정 `isPosted=true` (D-02) |
| upload.error.topic_changed | 주제가 변경되어 전시할 수 없어요. | 400 판정 404/주제 변경 (D-02) |
| upload.success.title | ‘{주제}’{을/를} 기록했어요. | 성공 화면 |
| upload.success.pending | 검수를 기다리고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요! | `PENDING` |
| upload.success.validating | 사진을 확인하고 있어요. 피드 표시까지 시간이 조금 걸릴 수도 있어요! | `VALIDATING` |
| upload.success.confirm | 확인했어요. | 성공 화면 버튼 |
| edit.top.cancel | 취소 | 편집기 상단 |
| edit.top.done | 완료 | 편집기 상단 |
| edit.tab.crop | 자르기 | 탭 |
| edit.tab.adjust | 조정 | 탭 |
| edit.tab.filter | 필터 | 탭 |
| edit.crop.rotate | 90도 회전 | 버튼 |
| edit.crop.reset | 초기화 | 자르기 초기화 버튼 |
| edit.adjust.reset | 초기화 | 조정 초기화 버튼 |
| edit.adjust.auto | 자동 | 조정 항목 |
| edit.adjust.exposure | 노출 | 조정 항목 |
| edit.adjust.contrast | 대비 | 조정 항목 |
| edit.adjust.highlights | 하이라이트 | 조정 항목 |
| edit.adjust.shadows | 그림자 | 조정 항목 |
| edit.adjust.black_point | 블랙 포인트 | 조정 항목 |
| edit.adjust.saturation | 채도 | 조정 항목 |
| edit.adjust.warmth | 따뜻함 | 조정 항목 |
| edit.filter.original | 원본 | 필터 |
| edit.filter.mono | 흑백 | 필터 |
| edit.filter.warm | 따뜻하게 | 필터 |
| edit.filter.cool | 차갑게 | 필터 |
| edit.filter.vintage | 빈티지 | 필터 |
| edit.filter.vivid | 선명하게 | 필터 |
| edit.ratio.original | 원본 | 자르기 비율 |
| edit.ratio.free | 자유 | 자르기 비율 |
| edit.ratio.1_1 | 1:1 | 자르기 비율 |
| edit.ratio.4_5 | 4:5 | 자르기 비율 |
| edit.ratio.5_4 | 5:4 | 자르기 비율 |
| edit.ratio.3_4 | 3:4 | 자르기 비율 |
| edit.ratio.4_3 | 4:3 | 자르기 비율 |
| edit.ratio.9_16 | 9:16 | 자르기 비율 |
| edit.ratio.16_9 | 16:9 | 자르기 비율 |
| edit.error.render | 사진을 편집하지 못했어요. 다시 시도해 주세요. | 편집 렌더링 실패 (iOS) |

고른 기준:
- 게이트의 "이용이 정지되어 게시물을 작성할 수 없어요."와 "지금 참여할 수 있는 주제가 없어요."는 iOS와 Android가 같았다.
- 편집기 상단 "취소"/"완료", 탭 "자르기"/"조정"/"필터"는 Android 기준(D-13에서 Android 목록 채택). iOS 필터 이름(선명, 크롬, 페이드, 누아르)은 쓰지 않는다.
- 편집 렌더 실패 문구는 Android에 해당 문구가 없어 iOS 문구를 쓴다.
- 촬영 사진 저장 권한 안내의 iOS 알림(제목 "촬영 사진 저장 권한", 버튼 "설정 열기"/"저장 없이 촬영"/"취소")은 iOS 플랫폼 권한 UI이므로 아래 "플랫폼별 허용 차이"에 적었다.

## 플랫폼별 허용 차이

- 카메라 권한 흐름:
  - iOS: 카메라를 열기 전에 "사진 추가 전용" 권한을 먼저 요청하고, 거부되면 알림(제목 "촬영 사진 저장 권한", 선택지 "설정 열기"/"저장 없이 촬영"/"취소")을 보여 준다. "저장 없이 촬영"을 고르면 저장 없이 촬영한 사진을 쓴다.
  - Android: CAMERA 권한 없이 시스템 카메라 앱을 호출하고 촬영본은 `Pictures/Chalkak/chalkak-photo-*.jpg`로 저장한다. API 28 이하만 저장 권한(`WRITE_EXTERNAL_STORAGE`)을 요청하며 거부되면 REQ-UPL-015의 토스트를 띄운다.
  - 웹: 카메라는 `<input type="file" accept="image/*" capture>` 같은 파일 입력으로 대신하며, 브라우저가 사진을 기기 앨범에 직접 저장할 수 없으므로 촬영본 저장(REQ-UPL-014)은 하지 않아도 된다. 카메라 입력을 지원하지 않는 데스크톱은 카메라 버튼을 숨긴다.
  - Flutter/React Native: 각 플랫폼의 카메라·갤러리 플러그인을 쓰되 위 iOS·Android 흐름과 같은 결과여야 한다.
- 앨범 선택: PHPicker(iOS), 시스템 문서/사진 선택기(Android), 파일 입력(웹).
- WebP 인코더: Android는 `WEBP_LOSSY`(API 30+)/`WEBP`, iOS는 libwebp 기반 라이브러리, 웹은 canvas가 WebP 인코딩을 지원하지 않으면 WASM 인코더를 쓴다. 결과가 REQ-UPL-030~033을 만족하면 된다(웹은 `image/webp`가 아닌 형식으로 폴백하면 안 된다).
- 다운샘플 방식: 기존 두 앱은 2의 거듭제곱 비율로 줄여 디코딩한다. 새 클라이언트는 긴 변이 4096 이하이고 확대하지만 않으면 연속 비율 축소를 써도 된다.
- 편집기 입력: 눈금자 슬라이더의 형태(기존 Android는 단위당 400dp, 눈금 50개, 10마다 굵은 눈금, 기준값 근처 멈춤과 햅틱), 자르기 프레임 제스처, 확대 미리보기는 플랫폼 관례를 따른다. 값의 범위와 연산은 부록과 같아야 한다.
- 편집기 구조: iOS의 도구별 하위 화면(Mantis)이나 웹의 모달은 허용하지만 "취소"는 이번 편집 전체를 버려야 한다.
- 진입 버튼 연타 방지와 로딩 표시 방식은 자유이다.

## 범위 밖

- 홈 히어로의 사진 상태: [home.md](home.md)
- 성공 후 전시 화면: [display-feed.md](display-feed.md)
- 푸시 알림(승인·반려): notification-push.md
- 사인 변경·가입 사인 업로드(PNG): onboarding-signature.md
- 이미지 처리 실패(VALIDATING → REJECTED)의 알림 부재: open-questions Q-08

## 확인 필요

- 서버가 이미지 처리 결과를 알려 주는 별도 조회가 없어 `VALIDATING` 게시물이 `REJECTED`가 되어도 앱이 즉시 알 방법이 `GET /posts/today` 재조회뿐이다(Q-08). 성공 화면 이후 상태를 추적하지 않는다.
- D-02의 400 판정을 위한 `GET /posts/today` 재조회가 네트워크 오류 등으로 실패했을 때의 문구가 정해져 있지 않다. 현재는 "전시를 완료하지 못했어요. 다시 시도해 주세요."로 처리하고 입력을 유지한다[추정].
- `POST /posts`의 404(`업로드한 사진을 찾을 수 없습니다.`, `게시물을 작성할 주제를 찾을 수 없습니다.`)는 D-02가 400만 다룬다. 현재는 "전시를 완료하지 못했어요. 다시 시도해 주세요." + 사진 준비 다시 하기로 처리한다[추정].
- 2xx인데 응답 본문이 깨졌거나 `moderationStatus`가 알 수 없는 값일 때(서버에는 게시물이 이미 생겼을 수 있다) D-07의 복구 확인을 적용할지 정해져 있지 않다. 현재는 실패 문구만 보여 주므로 사용자가 다시 제출하면 중복 오류(REQ-UPL-051~052)를 만난다.
- 로그인 화면으로 보낸 뒤(401 재인증) 선택한 사진과 제목을 복원하는지가 불명확하다. Android 문서는 "입력 유지"라 하나 화면 스택상 어려워 보인다[추정].
- 사진 영역에서 편집 없이 확정한 경우(회전·자르기·필터·조정이 전부 기본값)에 WebP 변환이 일어나는 것 외에 편집기 "완료"가 비활성인지 여부는 문서에 없다. 현재는 항상 활성이다.
- 조정 탭 "초기화" 버튼과 자르기 탭 "초기화" 버튼의 라벨이 같다. 기존 Android 코드의 두 버튼 모두 "초기화"이다.
- 업로드 화면 제목 입력의 글자 수 표시(카운터) 여부는 기존 앱 문서에 없다.
- 촬영 사진 저장(iOS 알림의 본문 문구)은 소스에서 확인하지 못했다.
- 편집 연산 수치의 단일 근거는 Android 소스다. iOS·Flutter·RN·웹 구현이 평균 ΔE 3 이내(D-13)인지는 구현 후 스크린샷 비교로 확인해야 한다.
