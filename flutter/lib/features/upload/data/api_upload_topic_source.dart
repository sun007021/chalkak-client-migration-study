import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/time/kst_date.dart';
import '../../home/domain/home_models.dart';
import '../domain/upload_topic_source.dart';

/// `GET /topics?date=yyyy-MM-dd`. 날짜는 기기 시간대와 무관하게 [KstDate.toApiString]이다.
class ApiUploadTopicSource implements UploadTopicSource {
  const ApiUploadTopicSource({required this.client});

  final ApiClient client;

  @override
  Future<Topic> topicOn(KstDate date, {CancelToken? cancelToken}) =>
      throw UnimplementedError();
}
