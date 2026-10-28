import 'package:dio/dio.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/api_request.dart';
import '../../../core/time/kst_date.dart';
import '../domain/home_models.dart';
import '../domain/home_repository.dart';
import '../domain/today_post_repository.dart';

class ApiHomeRepository implements HomeRepository, TodayPostRepository {
  ApiHomeRepository({required this._client});

  final ApiClient _client;

  @override
  Future<Topic?> topicOn(KstDate date, {CancelToken? cancelToken}) async {
    try {
      return await _client.request<Topic>(
        ApiRequest.get('/topics', query: {'date': date.toApiString()}),
        decode: (json) {
          final map = json! as Map<String, Object?>;
          final topicDate = KstDate.parse(map['topicDate']! as String);
          // 다른 날짜의 주제가 섞이면 화면이 거짓 날짜를 그리므로 응답 전체를 버린다.
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
    } on ApiError catch (error) {
      if (error.status == 404) return null;
      rethrow;
    }
  }

  @override
  Future<List<PostSummary>> popularPosts(
    KstDate topicDate, {
    CancelToken? cancelToken,
  }) async {
    try {
      return await _client.request<List<PostSummary>>(
        ApiRequest.get(
          '/posts',
          query: {
            'topicDate': topicDate.toApiString(),
            'sort': 'popular',
            'page': '1',
            'pageSize': '${AppConstants.pageSize}',
          },
        ),
        decode: (json) => [
          for (final item in (json! as Map<String, Object?>)['posts']! as List)
            _postSummary(item! as Map<String, Object?>),
        ],
        cancelToken: cancelToken,
      );
    } on ApiError catch (error) {
      if (error.status == 404) return const [];
      rethrow;
    }
  }

  @override
  Future<List<CalendarEntry>> calendar(
    KstMonth month, {
    CancelToken? cancelToken,
  }) {
    return _client.request<List<CalendarEntry>>(
      ApiRequest.get(
        '/posts/calendar',
        query: {'year': '${month.year}', 'month': '${month.month}'},
      ),
      decode: (json) => [
        for (final item in (json! as Map<String, Object?>)['posts']! as List)
          _calendarEntry(item! as Map<String, Object?>),
      ],
      cancelToken: cancelToken,
    );
  }

  @override
  Future<bool> hasUnreadNotifications({CancelToken? cancelToken}) {
    return _client.request<bool>(
      const ApiRequest.get('/notifications/unread-status'),
      decode: (json) => (json! as Map<String, Object?>)['hasUnread']! as bool,
      cancelToken: cancelToken,
    );
  }

  @override
  Future<TodayPost> today({CancelToken? cancelToken}) {
    return _client.request<TodayPost>(
      const ApiRequest.get('/posts/today'),
      decode: _todayPost,
      cancelToken: cancelToken,
    );
  }

  static PostSummary _postSummary(Map<String, Object?> json) => PostSummary(
    id: json['id']! as String,
    thumbnailImageUrl: json['thumbnailImageUrl']! as String,
    originalImageUrl: json['originalImageUrl']! as String,
    likeCount: json['likeCount']! as int,
    isLiked: json['isLiked']! as bool,
    isMine: json['isMine']! as bool,
  );

  static CalendarEntry _calendarEntry(Map<String, Object?> json) =>
      CalendarEntry(
        topicDate: KstDate.parse(json['topicDate']! as String),
        postId: json['postId']! as String,
        thumbnailImageUrl: json['thumbnailImageUrl']! as String,
        status: switch (json['status']) {
          'PENDING' => CalendarStatus.pending,
          'APPROVED' => CalendarStatus.approved,
          final other => throw FormatException('알 수 없는 캘린더 상태', other),
        },
      );

  /// `isPosted`와 `postId`·`moderationStatus`가 어긋나면 던진다(REQ-HOME-017).
  static TodayPost _todayPost(Object? raw) {
    final json = raw! as Map<String, Object?>;
    final topicDate = KstDate.parse(json['topicDate']! as String);
    final isPosted = json['isPosted']! as bool;
    final postId = json['postId'] as String?;
    final statusWire = json['moderationStatus'] as String?;
    if (!isPosted) {
      if (postId != null || statusWire != null) {
        throw const FormatException('isPosted=false인데 게시물 정보가 있다');
      }
      return TodayPost(topicDate: topicDate, isPosted: false);
    }
    if (postId == null || statusWire == null) {
      throw const FormatException('isPosted=true인데 게시물 정보가 없다');
    }
    final status = switch (statusWire) {
      'VALIDATING' => ModerationStatus.validating,
      'PENDING' => ModerationStatus.pending,
      'APPROVED' => ModerationStatus.approved,
      _ => throw FormatException('알 수 없는 검수 상태', statusWire),
    };
    return TodayPost(
      topicDate: topicDate,
      isPosted: true,
      postId: postId,
      moderationStatus: status,
    );
  }
}
