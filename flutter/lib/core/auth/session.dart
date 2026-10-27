class Session {
  const Session({
    required this.userId,
    required this.accessToken,
    required this.accessTokenExpiresAt,
    required this.refreshToken,
    required this.refreshTokenExpiresAt,
    this.isGuest = false,
  });

  /// 토큰 없는 게스트 세션.
  factory Session.guest() => Session(
    userId: '',
    accessToken: '',
    accessTokenExpiresAt: _epoch,
    refreshToken: '',
    refreshTokenExpiresAt: _epoch,
    isGuest: true,
  );

  /// 필수 필드가 없거나 타입이 다르면 [FormatException].
  factory Session.fromJson(Map<String, Object?> json) {
    String str(String key) {
      final v = json[key];
      if (v is String) return v;
      throw FormatException('세션 필드 $key가 없거나 문자열이 아니다');
    }

    final guest = json['isGuest'];
    if (guest != null && guest is! bool) {
      throw const FormatException('세션 필드 isGuest가 bool이 아니다');
    }
    return Session(
      userId: str('userId'),
      accessToken: str('accessToken'),
      accessTokenExpiresAt: DateTime.parse(str('accessTokenExpiresAt')),
      refreshToken: str('refreshToken'),
      refreshTokenExpiresAt: DateTime.parse(str('refreshTokenExpiresAt')),
      isGuest: guest as bool? ?? false,
    );
  }

  static final DateTime _epoch = DateTime.fromMillisecondsSinceEpoch(
    0,
    isUtc: true,
  );

  final String userId;
  final String accessToken;
  final DateTime accessTokenExpiresAt;
  final String refreshToken;
  final DateTime refreshTokenExpiresAt;
  final bool isGuest;

  /// 만료 시각이 now 이하이면 만료.
  bool isAccessExpired(DateTime now) => !accessTokenExpiresAt.isAfter(now);
  bool isRefreshExpired(DateTime now) => !refreshTokenExpiresAt.isAfter(now);

  Map<String, Object?> toJson() => {
    'userId': userId,
    'accessToken': accessToken,
    'accessTokenExpiresAt': accessTokenExpiresAt.toUtc().toIso8601String(),
    'refreshToken': refreshToken,
    'refreshTokenExpiresAt': refreshTokenExpiresAt.toUtc().toIso8601String(),
    'isGuest': isGuest,
  };

  /// 토큰이 로그에 나오지 않도록 막는다.
  @override
  String toString() => 'Session(userId: $userId, guest: $isGuest)';
}
