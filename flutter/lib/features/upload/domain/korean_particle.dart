import '../../../core/copy/ko.g.dart';
import '../../home/domain/home_models.dart';

/// 성공 화면 문구 생성(REQ-UPL-060~061).
abstract final class UploadSuccessText {
  /// 받침이 있는 한글 음절로 끝나면 "을", 받침이 없거나 한글이 아니거나 비어 있으면 "를".
  /// 끝의 공백은 무시한다(`"겨울 "` -> 을).
  static String objectParticle(String word) {
    final trimmed = word.trimRight();
    if (trimmed.isEmpty) return '를';
    final last = trimmed.runes.last;
    const first = 0xAC00;
    const lastSyllable = 0xD7A3;
    if (last < first || last > lastSyllable) return '를';
    return (last - first) % 28 == 0 ? '를' : '을';
  }

  /// `Copy.uploadSuccessTitle`의 `{주제}`·`{을/를}`을 채운 문장.
  static String title(String topicTitle) => Copy.fill(Copy.uploadSuccessTitle, {
    '주제': topicTitle,
    '을/를': objectParticle(topicTitle),
  });

  /// PENDING이면 `Copy.uploadSuccessPending`, 그 밖(VALIDATING)이면 `Copy.uploadSuccessValidating`.
  static String status(ModerationStatus status) =>
      status == ModerationStatus.pending
      ? Copy.uploadSuccessPending
      : Copy.uploadSuccessValidating;
}
