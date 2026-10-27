# anl fixtures

전부 `_kind: "case"`, `_routes.json`은 `method: "NONE"`, `path: "-"`.
- `events__expected-screen-names`: `cases`는 허용 screen_name 19종 문자열 배열(순서 = TC-ANL-002 나열 순서).
- `events__journey-*`: `cases[]`는 `{name, events[]}`. 이벤트는 `{name, params}`이고 `screen_view{screen_name}` 또는 `bottom_navigation_selected{destination}`. 탭 선택 이벤트가 화면 진입 이벤트보다 먼저 나가는 순서는 추정이다(원본 확인 필요).
