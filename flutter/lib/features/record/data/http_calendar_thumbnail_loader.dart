import 'dart:io';
import 'dart:typed_data';

import '../../../core/network/url_rule.dart';

/// 썸네일 URL의 바이트를 받는다. 받지 못하면 null이고, 그 칸은 사진 대신 색 칸으로 그린다.
typedef CalendarThumbnailLoader = Future<Uint8List?> Function(String url);

/// `dart:io` HttpClient로 썸네일을 내려받는 [CalendarThumbnailLoader]. https(또는 loopback http)만 받고
/// 200이 아니거나 크기 한도를 넘으면 null이다.
class HttpCalendarThumbnailLoader {
  const HttpCalendarThumbnailLoader();

  static const int maxBytes = 5 * 1024 * 1024;

  Future<Uint8List?> call(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !UrlRule.isAllowed(uri)) return null;
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
    try {
      final request = await client.getUrl(uri);
      final response = await request.close();
      if (response.statusCode != HttpStatus.ok) {
        await response.drain<void>();
        return null;
      }
      final builder = BytesBuilder(copy: false);
      await for (final chunk in response) {
        builder.add(chunk);
        if (builder.length > maxBytes) return null;
      }
      return builder.takeBytes();
    } finally {
      client.close(force: true);
    }
  }
}
