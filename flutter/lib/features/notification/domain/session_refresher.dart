import '../../../core/auth/session.dart';

/// 지금 세션의 토큰을 `POST /auth/refresh`로 갱신하는 창구(single-flight는 구현 몫).
/// ApiClient에 공개 갱신 메서드가 없어 구현 PR이 어댑터를 만든다(통합 지점).
/// - 성공하면 저장된 새 세션을 돌려준다.
/// - 로그아웃·계정 전환으로 세션이 없거나 바뀌었으면 null.
/// - `REAUTHENTICATION_REQUIRED`는 세션을 지우고(로그인 화면 이동은 세션 정리 이벤트가 한다) `ApiError`를 던진다.
abstract interface class SessionRefresher {
  Future<Session?> refresh();
}
