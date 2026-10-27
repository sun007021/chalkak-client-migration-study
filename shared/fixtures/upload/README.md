# upload fixture 메모

- `posts-uploads__*`: 정책 발급 응답. 정상 uploadUrl은 README 규약의 `http://localhost:4010/__upload/<uploadId>?X-Amz-Expires=300`. 업로드 ID는 `5555...5501`(issued), `02`(issued-new), `03`~`07`(변형).
- `posts-uploads__insecure-upload-url`: 일반 mock URL(localhost, http)과 구분하려고 `http://upload.example.test/...`를 쓴다. 클라이언트 규칙은 "https만 허용, 테스트용 localhost 예외"로 가정한다.
- `s3-put__*`: 경로는 `/__upload/<uploadId>`(PUT). 403·500은 S3 XML 오류를 `_raw` + `_contentType: application/xml`로 묘사한다.
- `posts-create__timeout`: `_fault: timeout`, 라우트에 `delayMs: 20000`(status 없음).
- 새 `_kind` 없음.
- 입력 이미지(`upload/images/*`)는 JSON이 아니며 이 폴더가 아니라 생성기 스크립트가 만든다.
