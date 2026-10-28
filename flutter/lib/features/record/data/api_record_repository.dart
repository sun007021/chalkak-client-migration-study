import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_request.dart';
import '../../../core/time/kst_date.dart';
import '../domain/record_models.dart';
import '../domain/record_repository.dart';

/// [RecordRepository]의 `ApiClient` 구현. 응답 검증은 [RecordRepository.calendar] 문서를 따른다.
class ApiRecordRepository implements RecordRepository {
  ApiRecordRepository({required this._client});

  final ApiClient _client;

  @override
  Future<List<KstMonth>> months({CancelToken? cancelToken}) {
    return _client.request<List<KstMonth>>(
      const ApiRequest.get('/posts/calendar/months'),
      decode: (json) => [
        for (final item in (json! as Map<String, Object?>)['months']! as List)
          _month(item! as Map<String, Object?>),
      ],
      cancelToken: cancelToken,
    );
  }

  @override
  Future<List<RecordPhoto>> calendar(
    KstMonth month, {
    CancelToken? cancelToken,
  }) {
    return _client.request<List<RecordPhoto>>(
      ApiRequest.get(
        '/posts/calendar',
        query: {'year': '${month.year}', 'month': '${month.month}'},
      ),
      decode: (json) => _validated(month, json! as Map<String, Object?>),
      cancelToken: cancelToken,
    );
  }

  static KstMonth _month(Map<String, Object?> json) {
    final year = json['year']! as int;
    final month = json['month']! as int;
    if (year < 1 || year > 9999 || month < 1 || month > 12) {
      throw FormatException('범위 밖 연월', '$year-$month');
    }
    return KstMonth(year, month);
  }

  /// REQ-REC-018. 하나라도 어기면 던지고, [ApiClient]가 invalidResponse로 바꾼다.
  static List<RecordPhoto> _validated(
    KstMonth month,
    Map<String, Object?> json,
  ) {
    if (json['year'] != month.year || json['month'] != month.month) {
      throw FormatException(
        '응답 연월이 요청과 다름',
        '${json['year']}-${json['month']}',
      );
    }
    final seen = <KstDate>{};
    final photos = <RecordPhoto>[];
    for (final item in json['posts']! as List) {
      final map = item! as Map<String, Object?>;
      final topicDate = KstDate.parse(map['topicDate']! as String);
      if (topicDate.yearMonth != month) {
        throw FormatException('주제 날짜가 그 달 밖', topicDate.toString());
      }
      if (!seen.add(topicDate)) {
        throw FormatException('같은 날짜 중복', topicDate.toString());
      }
      final thumbnail = map['thumbnailImageUrl']! as String;
      if (thumbnail.isEmpty) {
        throw FormatException('빈 썸네일 URL', topicDate.toString());
      }
      final status = switch (map['status']) {
        'PENDING' => RecordPhotoStatus.pending,
        'APPROVED' => RecordPhotoStatus.approved,
        final other => throw FormatException('알 수 없는 status', '$other'),
      };
      photos.add(
        RecordPhoto(
          topicDate: topicDate,
          postId: map['postId']! as String,
          thumbnailImageUrl: thumbnail,
          status: status,
        ),
      );
    }
    return photos..sort((a, b) => a.topicDate.compareTo(b.topicDate));
  }
}
