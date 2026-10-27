import '../domain/signature_repository.dart';

/// 업로드 발급 응답(`uploadId`, `uploadUrl`, `expiresInSeconds`)을 읽는다.
/// 가입과 사인 변경이 같은 모양을 쓴다. 필드가 없거나 타입이 틀리면 예외를 던지고,
/// ApiClient가 이를 invalidResponse로 바꾼다.
SignatureUploadTicket parseUploadTicket(Map<Object?, Object?> json) {
  return SignatureUploadTicket(
    uploadId: json['uploadId']! as String,
    uploadUrl: Uri.parse(json['uploadUrl']! as String),
    expiresInSeconds: json['expiresInSeconds']! as int,
  );
}
