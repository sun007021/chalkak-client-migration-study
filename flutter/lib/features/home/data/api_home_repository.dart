// ignore_for_file: unused_field
import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/time/kst_date.dart';
import '../domain/home_models.dart';
import '../domain/home_repository.dart';
import '../domain/today_post_repository.dart';

class ApiHomeRepository implements HomeRepository, TodayPostRepository {
  ApiHomeRepository({required this._client});

  final ApiClient _client;

  @override
  Future<Topic?> topicOn(KstDate date, {CancelToken? cancelToken}) =>
      throw UnimplementedError();

  @override
  Future<List<PostSummary>> popularPosts(
    KstDate topicDate, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  @override
  Future<List<CalendarEntry>> calendar(
    KstMonth month, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  @override
  Future<bool> hasUnreadNotifications({CancelToken? cancelToken}) =>
      throw UnimplementedError();

  @override
  Future<TodayPost> today({CancelToken? cancelToken}) =>
      throw UnimplementedError();
}
