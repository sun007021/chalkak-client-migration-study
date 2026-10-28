import '../../home/domain/home_models.dart';

/// 성공 화면 문구 생성(REQ-UPL-060~061).
abstract final class UploadSuccessText {
  /// 받침이 있는 한글 음절로 끝나면 "을", 받침이 없거나 한글이 아니거나 비어 있으면 "를".
  /// 끝의 공백은 무시한다(`"겨울 "` -> 을).
  static String objectParticle(String word) => throw UnimplementedError();

  /// `Copy.uploadSuccessTitle`의 `{주제}`·`{을/를}`을 채운 문장.
  static String title(String topicTitle) => throw UnimplementedError();

  /// PENDING이면 `Copy.uploadSuccessPending`, 그 밖(VALIDATING)이면 `Copy.uploadSuccessValidating`.
  static String status(ModerationStatus status) => throw UnimplementedError();
}
