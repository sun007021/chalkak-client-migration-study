import 'package:dio/dio.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_request.dart';
import '../domain/banner_models.dart';
import '../domain/banner_repository.dart';
import '../domain/banner_web_policy.dart';

class ApiBannerRepository implements BannerRepository {
  ApiBannerRepository({required this._client});

  final ApiClient _client;

  @override
  Future<BannerPage> fetchPage(int page, {CancelToken? cancelToken}) {
    return _client.request<BannerPage>(
      ApiRequest.get(
        '/banners',
        query: {'page': '$page', 'pageSize': '${AppConstants.bannerPageSize}'},
      ),
      decode: (json) {
        final map = json! as Map<String, Object?>;
        return BannerPage(
          page: (map['currentPage'] as int?) ?? page,
          hasNext: (map['hasNext'] as bool?) ?? false,
          banners: [
            for (final item in map['banners']! as List)
              _banner(item! as Map<String, Object?>),
          ],
        );
      },
      cancelToken: cancelToken,
    );
  }

  static BannerItem _banner(Map<String, Object?> json) {
    final webViewUrl = Uri.parse(json['webViewUrl']! as String);
    // 하나라도 안전하지 않으면 응답 전체를 버린다(던지면 invalidResponse).
    if (!BannerWebNavigationPolicy.isLoadable(webViewUrl)) {
      throw FormatException('https가 아닌 webViewUrl', webViewUrl.toString());
    }
    return BannerItem(
      id: json['id']! as String,
      title: json['title']! as String,
      subtitle: json['subtitle']! as String,
      webViewUrl: webViewUrl,
      thumbnailUrl: _thumbnail(json['thumbnailUrl']),
      createdAt: DateTime.parse(json['createdAt']! as String),
    );
  }

  /// 잘못된 썸네일은 배너를 버리지 않고 null로 둔다(REQ-BANR-003).
  static Uri? _thumbnail(Object? raw) {
    if (raw is! String) return null;
    final uri = Uri.tryParse(raw);
    if (uri == null || !BannerWebNavigationPolicy.isLoadable(uri)) return null;
    return uri;
  }
}
