/// Firebase 프로젝트 연결 값. `google-services.json`·`GoogleService-Info.plist`는 비밀값이라 커밋하지 않으므로
/// 빌드 때 `--dart-define`(`env/*.json`, git 제외)으로 받아 코드에서 초기화한다.
class FirebaseConfig {
  const FirebaseConfig({
    required this.apiKey,
    required this.appId,
    required this.messagingSenderId,
    required this.projectId,
    this.iosBundleId,
  });

  /// 필수 네 값이 모두 비어 있지 않을 때만 만든다. 하나라도 없으면 null(푸시 꺼짐).
  static FirebaseConfig? tryParse({
    required String? apiKey,
    required String? appId,
    required String? messagingSenderId,
    required String? projectId,
    String? iosBundleId,
  }) {
    String? clean(String? v) {
      final t = v?.trim();
      return (t == null || t.isEmpty) ? null : t;
    }

    final key = clean(apiKey);
    final app = clean(appId);
    final sender = clean(messagingSenderId);
    final project = clean(projectId);
    if (key == null || app == null || sender == null || project == null) {
      return null;
    }
    return FirebaseConfig(
      apiKey: key,
      appId: app,
      messagingSenderId: sender,
      projectId: project,
      iosBundleId: clean(iosBundleId),
    );
  }

  final String apiKey;
  final String appId;
  final String messagingSenderId;
  final String projectId;

  /// iOS 앱 번들 ID. 없으면 Firebase가 앱 번들 ID를 쓴다.
  final String? iosBundleId;

  /// 토큰·키 원문이 로그에 나오지 않도록 프로젝트 ID만 보인다.
  @override
  String toString() => 'FirebaseConfig(projectId: $projectId)';
}
