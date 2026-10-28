/// 홈 ISSUE 배너 한 건(REQ-BANR-001~004).
class BannerItem {
  const BannerItem({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.webViewUrl,
    required this.thumbnailUrl,
    required this.createdAt,
  });

  final String id;
  final String title;
  final String subtitle;

  /// 항상 https이고 호스트가 있다(아니면 응답 전체가 invalidResponse).
  final Uri webViewUrl;

  /// 잘못된 URL이면 null. 화면이 대체 배경을 그린다(REQ-BANR-003).
  final Uri? thumbnailUrl;
  final DateTime createdAt;
}

/// `GET /banners` 한 페이지. `hasNext`가 응답에 없으면 false(REQ-BANR-002).
class BannerPage {
  const BannerPage({
    required this.page,
    required this.hasNext,
    required this.banners,
  });

  final int page;
  final bool hasNext;
  final List<BannerItem> banners;
}
