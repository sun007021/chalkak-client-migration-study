import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_request.dart';
import '../../../core/time/kst_date.dart';
import '../../home/domain/home_models.dart';
import '../domain/upload_topic_source.dart';

/// `GET /topics?date=yyyy-MM-dd`. 날짜는 기기 시간대와 무관하게 [KstDate.toApiString]이다.
class ApiUploadTopicSource implements UploadTopicSource {
  const ApiUploadTopicSource({required this.client});

  final ApiClient client;

  @override
  Future<Topic> topicOn(KstDate date, {CancelToken? cancelToken}) {
    return client.request<Topic>(
      ApiRequest.get('/topics', query: {'date': date.toApiString()}),
      decode: (json) {
        final map = json! as Map<String, Object?>;
        final topicDate = KstDate.parse(map['topicDate']! as String);
        // 다른 날짜의 주제로 제출하면 안 되므로 응답 전체를 버린다.
        if (topicDate != date) {
          throw FormatException('요청 날짜와 다른 주제 날짜', topicDate.toString());
        }
        return Topic(
          id: map['id']! as String,
          title: map['title']! as String,
          topicDate: topicDate,
          phase: map['phase']! as String,
        );
      },
      cancelToken: cancelToken,
    );
  }
}
