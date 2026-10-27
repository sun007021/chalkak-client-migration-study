abstract final class AppRoutes {
  static const splash = '/';
  static const login = '/login';
  static const main = '/main';

  /// 가입 1단계. 로그인이 `SIGN_UP_REQUIRED`를 알리면 `SignUpContext`를 채우고 들어온다.
  static const terms = '/terms';

  /// 가입 2단계(사인 그리기). terms 위에 쌓인다.
  static const signUpSignature = '/terms/signature';

  /// 가입 3단계(미리보기). extra로 PNG 바이트([Uint8List])를 받는다.
  static const signUpPreview = '/terms/signature/preview';
}
