# notification fixture 메모

- 알림 ID `3333...33NN`: 목록 page1은 NN=01~20, `i % 5`로 type 순환(1 승인, 2 반려, 3 AI 완료, 4 AI 실패, 0 공지). NN 01~05 미읽음, 나머지 읽음. page2-last는 21~25, overlap-page2는 19·20(page1과 동일 객체) + 26~28.
- 상세 fixture ID는 목록과 맞물린다: approved=01, rejected=02, notice=05, rejected-long-reason=07. not-found는 `...99`.
- 공지 ID `77777777-7777-4777-8777-777777777701`, 리마인더 ID `99999999-9999-4999-8999-999999999901`.
- 목록 쿼리는 문자열 값(`page`, `pageSize`).
- 새 `_kind` 없음.
