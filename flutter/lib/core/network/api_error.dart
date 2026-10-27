enum ApiErrorKind { server, network, cancelled, invalidResponse, config }

/// 서버 errorCode. 알 수 없는 값은 [businessError]로 취급한다(D-02).
enum ApiErrorCode {
  businessError,
  unauthorized,
  reauthenticationRequired,
  forbidden,
  internalError,
  signatureRegistrationRequired,
  signatureReuploadRequired,
  signatureProcessingPending;

  /// 알 수 없는 문자열은 [businessError].
  static ApiErrorCode fromWire(String raw) => throw UnimplementedError();
}

class ApiError implements Exception {
  const ApiError({
    required this.kind,
    this.status,
    this.errorCode,
    this.rawErrorCode,
    this.message,
    this.cause,
  });

  /// 4xx/5xx 응답 본문을 파싱한다. [rawBody]가 비었거나 JSON이 아니거나
  /// errorCode가 없으면 status만 가진 server 오류가 된다(errorCode == null).
  factory ApiError.fromErrorResponse(int status, String? rawBody) =>
      throw UnimplementedError();

  factory ApiError.network([Object? cause]) => throw UnimplementedError();
  factory ApiError.cancelled() => throw UnimplementedError();
  factory ApiError.invalidResponse({int? status, Object? cause}) =>
      throw UnimplementedError();
  factory ApiError.config(String reason) => throw UnimplementedError();

  final ApiErrorKind kind;
  final int? status;

  /// 알려진 코드로 정규화한 값. 본문에 코드가 없으면 null.
  final ApiErrorCode? errorCode;

  /// 서버가 보낸 원문 코드(로그용).
  final String? rawErrorCode;

  /// 서버 한국어 문구. 표시용으로만 쓰고 분기에 쓰지 않는다(D-02).
  final String? message;
  final Object? cause;

  bool get isNetwork => kind == ApiErrorKind.network;
  bool get isCancelled => kind == ApiErrorKind.cancelled;
  bool get isInvalidResponse => kind == ApiErrorKind.invalidResponse;
  bool get isConfig => kind == ApiErrorKind.config;
  bool get isUnauthorized =>
      status == 401 && errorCode == ApiErrorCode.unauthorized;
  bool get isReauthenticationRequired =>
      status == 401 && errorCode == ApiErrorCode.reauthenticationRequired;
}
