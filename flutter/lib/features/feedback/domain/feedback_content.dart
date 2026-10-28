import '../../../core/constants/app_constants.dart';
import '../../../core/text/code_points.dart';

enum FeedbackValidation {
  /// trim 후 0 code point. 보낼 수 없고 요청도 메시지도 없다.
  blank,

  /// trim 후 1~[AppConstants.feedbackMax] code point.
  valid,

  /// trim 후 [AppConstants.feedbackMax] 초과. 요청을 보내지 않고 `Copy.fdbkErrorInvalid`를 보인다.
  tooLong,
}

/// 피드백 내용 규칙(REQ-FDBK-003~005, 007, TC-FDBK-004~012).
/// - 길이는 앞뒤 공백(스페이스, 탭, 개행, 전각 공백 U+3000 포함)을 뺀 값의 Unicode code point 수다.
///   grapheme(결합 이모지 👨‍👩‍👧는 5)도 UTF-16 길이(이모지 하나가 2)도 아니며 NFC/NFD로 정규화하지 않는다.
/// - 중간의 개행·연속 공백은 그대로 둔다. 서버로 보내는 내용은 [normalize] 결과다.
abstract final class FeedbackContent {
  /// 앞뒤 공백만 제거한 값.
  static String normalize(String raw) => raw.trim();

  /// [normalize]한 값의 code point 수(카운터 값).
  static int length(String raw) => codePointLength(normalize(raw));

  static FeedbackValidation validate(String raw) {
    final length = FeedbackContent.length(raw);
    if (length == 0) return FeedbackValidation.blank;
    if (length > AppConstants.feedbackMax) return FeedbackValidation.tooLong;
    return FeedbackValidation.valid;
  }
}
