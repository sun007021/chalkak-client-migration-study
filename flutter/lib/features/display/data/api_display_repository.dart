import 'package:dio/dio.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/api_request.dart';
import '../../../core/time/kst_date.dart';
import '../domain/display_models.dart';
import '../domain/display_repository.dart';

class ApiDisplayRepository implements DisplayRepository {
  ApiDisplayRepository({required this._client});

  static final RegExp _seedPattern = RegExp(r'^[A-Za-z0-9_-]{1,64}$');

  final ApiClient _client;

  @override
  Future<DisplayTopic> fetchTopic(KstDate date, {CancelToken? cancelToken}) {
    return _client.request<DisplayTopic>(
      ApiRequest.get('/topics', query: {'date': date.toApiString()}),
      decode: (json) {
        final map = json! as Map;
        final topicDate = KstDate.parse(map['topicDate']! as String);
        if (topicDate != date) {
          throw ApiError.invalidResponse(
            cause: const FormatException('응답 topicDate가 요청 날짜와 다르다'),
          );
        }
        return DisplayTopic(
          id: map['id']! as String,
          title: map['title']! as String,
          topicDate: topicDate,
          phase: map['phase']! as String,
        );
      },
      cancelToken: cancelToken,
    );
  }

  @override
  Future<PostPage> fetchPosts({
    required KstDate topicDate,
    required DisplaySort sort,
    required int page,
    String? randomSeed,
    CancelToken? cancelToken,
  }) async {
    if (page < 1) throw ArgumentError.value(page, 'page', '1 이상이어야 한다');
    if (randomSeed != null && !_seedPattern.hasMatch(randomSeed)) {
      throw ArgumentError.value(randomSeed, 'randomSeed', '허용되지 않는 형식이다');
    }
    return _client.request<PostPage>(
      ApiRequest.get(
        '/posts',
        query: {
          'topicDate': topicDate.toApiString(),
          'sort': sort.wire,
          'page': '$page',
          'pageSize': '${AppConstants.pageSize}',
          'randomSeed': ?randomSeed,
        },
      ),
      decode: _parsePage,
      cancelToken: cancelToken,
    );
  }

  static PostPage _parsePage(Object? json) {
    final map = json! as Map;
    return PostPage(
      currentPage: map['currentPage']! as int,
      pageSize: map['pageSize']! as int,
      hasNext: map['hasNext']! as bool,
      randomSeed: map['randomSeed'] as String?,
      posts: [
        for (final item in map['posts']! as List) _parseCard(item! as Map),
      ],
    );
  }

  static PostCard _parseCard(Map<dynamic, dynamic> map) {
    final likeCount = map['likeCount']! as int;
    if (likeCount < 0) {
      throw ApiError.invalidResponse(
        cause: const FormatException('likeCount가 음수다'),
      );
    }
    final original = map['originalImageUrl']! as String;
    return PostCard(
      id: map['id']! as String,
      authorId: map['authorId']! as String,
      originalImageUrl: original,
      thumbnailImageUrl: (map['thumbnailImageUrl'] as String?) ?? original,
      signatureOriginalImageUrl: map['signatureOriginalImageUrl']! as String,
      signatureThumbnailImageUrl: map['signatureThumbnailImageUrl'] as String?,
      title: map['title'] as String?,
      likeCount: likeCount,
      isLiked: map['isLiked']! as bool,
      isMine: map['isMine']! as bool,
    );
  }
}
