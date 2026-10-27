import '../../../core/analytics/analytics_constants.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/copy/ko.g.dart';

/// 가입 약관 화면과 설정이 같이 쓰는 약관 문서(D-25).
enum LegalDocument {
  service,
  privacy;

  /// 공통 상수 URL(`TERMS_URLS`). 5개 플랫폼이 같은 값을 쓴다.
  String get url => switch (this) {
    LegalDocument.service => AppConstants.termsServiceUrl,
    LegalDocument.privacy => AppConstants.termsPrivacyUrl,
  };

  /// 시트 제목: `onb.terms.doc.title.service` / `.privacy`.
  String get title => switch (this) {
    LegalDocument.service => Copy.onbTermsDocTitleService,
    LegalDocument.privacy => Copy.onbTermsDocTitlePrivacy,
  };

  /// screen_view 이름: `terms_of_service` / `privacy_policy`.
  String get screenName => switch (this) {
    LegalDocument.service => ScreenNames.termsOfService,
    LegalDocument.privacy => ScreenNames.privacyPolicy,
  };
}

enum LegalLinkTarget {
  /// 앱 안 웹뷰로 연다.
  inApp,

  /// 외부 브라우저로 넘긴다.
  external,

  /// 열지 않는다(빈 문자열, 파싱 불가, http/https가 아닌 scheme, userinfo 포함).
  rejected,
}

/// URL 판정(REQ-ONB-008, TC-ONB-010, 011).
class LegalLinkPolicy {
  const LegalLinkPolicy._();

  /// https이고 호스트가 `notion.com`·`notion.so`·`notion.site` 또는 그 하위 도메인이면 inApp.
  /// http/https인 그 밖의 URL은 external(예: 스킴이 http인 notion.so, 호스트가 notion.com.evil.example인 주소).
  /// 호스트는 대소문자를 구분하지 않는다. userinfo가 섞였거나 http/https가 아니면 rejected.
  static LegalLinkTarget decide(String url) {
    final Uri uri;
    try {
      uri = Uri.parse(url.trim());
    } on FormatException {
      return LegalLinkTarget.rejected;
    }
    final scheme = uri.scheme.toLowerCase();
    if ((scheme != 'http' && scheme != 'https') ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty) {
      return LegalLinkTarget.rejected;
    }
    return scheme == 'https' && _isAllowedHost(uri.host)
        ? LegalLinkTarget.inApp
        : LegalLinkTarget.external;
  }

  static bool _isAllowedHost(String host) {
    final lower = host.toLowerCase();
    return AppConstants.termsAllowedHosts.any(
      (allowed) => lower == allowed || lower.endsWith('.$allowed'),
    );
  }
}

/// 외부 브라우저로 URL을 연다. 열지 못하면 false.
abstract interface class ExternalLinkLauncher {
  Future<bool> open(Uri url);
}
