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
  factory Session.guest() => throw UnimplementedError();

  factory Session.fromJson(Map<String, Object?> json) =>
      throw UnimplementedError();

  final String userId;
  final String accessToken;
  final DateTime accessTokenExpiresAt;
  final String refreshToken;
  final DateTime refreshTokenExpiresAt;
  final bool isGuest;

  /// 만료 시각이 now 이하이면 만료.
  bool isAccessExpired(DateTime now) => throw UnimplementedError();
  bool isRefreshExpired(DateTime now) => throw UnimplementedError();

  Map<String, Object?> toJson() => throw UnimplementedError();
}
