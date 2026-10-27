# push fixture 메모

- `payload__*`: `_kind: "push"`. `data`의 값은 모두 문자열(예외: `non-string-values`는 일부러 숫자·객체·배열). 라우트는 method `PUSH`, path `push`.
- `payload__*`에는 README 규약에 없는 선택 키 `notification: {title, body}`를 추가했다(표시용, TC-PUSH-051·068). `data`만 읽는 소비자는 무시해도 된다.
- eventId는 `66666666-6666-4666-8666-6666666666NN`(공지는 eventId = sourceId). notificationId는 알림 fixture ID와 같은 값(`3333...33NN`).
- `jwt__*`: **새 `_kind: "case"`**(method `NONE`, path `-`). 서명 없는 가짜 JWT 문자열을 `token`에 담는다.
  - `jwt__with-session-id`, `jwt__without-session-id`: `{"_kind":"case","token":"<h.p.s>","payload":{...},"expect":{"hasSessionId":bool}}`
  - `jwt__malformed`: `{"_kind":"case","cases":[{"name","token"}...],"expect":{"hasSessionId":false}}`
  - 서명 검증을 하지 않으므로 서명 자리는 `fixture-unsigned-signature` 고정. `iat`는 기준 시각(1793070000), `exp`는 +1800초.
- `push-devices-current__*`: `PUT /api/v1/push-devices/current` 서버 응답. `bad-request-empty-token`은 서버 응답 묘사일 뿐 클라이언트는 빈 토큰을 아예 보내지 않는다(TC-PUSH-031).
