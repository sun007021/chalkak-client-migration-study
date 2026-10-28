import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../home/domain/home_models.dart';
import '../../home/domain/today_post_repository.dart';
import 'monotonic_clock.dart';
import 'post_upload_repository.dart';
import 'upload_models.dart';
import 'upload_preparer.dart';

sealed class SubmitOutcome {
  const SubmitOutcome();
}

/// 성공(201 또는 응답 유실 복구에서 `isPosted=true`). 임시 파일은 지워져 있다.
final class SubmitSucceeded extends SubmitOutcome {
  const SubmitSucceeded(this.postId, this.moderationStatus);

  final String postId;
  final ModerationStatus moderationStatus;
}

/// 실패. [retained]가 있으면 다음 "전시하기"가 그 준비물(같은 uploadId)로 이어 간다.
/// [failure.discardPrepared]이면 [retained]는 null이고 임시 파일은 지워져 있다.
final class SubmitFailed extends SubmitOutcome {
  const SubmitFailed(this.failure, {this.retained});

  final UploadFailure failure;
  final PreparedUpload? retained;
}

/// "전시하기"의 제출 순서: URL 만료 확인 -> `PUT` -> `POST /posts`(REQ-UPL-040).
///
/// 1. [UploadPreparer.refresh]로 만료를 확인한다(실패는 [SubmitFailed]).
/// 2. 파일 크기가 정책 `maxBytes`를 넘으면 PUT 없이 막는다(`Copy.uploadErrorPrepare`, 폐기).
/// 3. PUT 실패: 네트워크 -> `Copy.uploadErrorNetwork`(준비물 유지), 그 밖(S3 403·5xx, URL 거부)
///    -> `Copy.uploadErrorUpload`이며 정책을 버리고 다음 제출은 정책 발급부터(폐기, REQ-UPL-059).
/// 4. `POST /posts`는 자동 재시도 없이 1회. 결과:
///    - 201 -> [SubmitSucceeded]. 알 수 없는 `moderationStatus`·필드 누락(2xx 계약 위반)은
///      D-07처럼 `GET /posts/today`로 확인해 `isPosted=true`면 그 상태로 성공, 아니면
///      `Copy.uploadErrorCreate`(준비물 유지).
///    - 타임아웃·연결 끊김 -> 재전송하지 않고 `GET /posts/today`. `isPosted=true`면 성공(상태는 today의
///      moderationStatus), `false`거나 today도 실패면 `Copy.uploadErrorNetwork`(준비물 유지,
///      같은 uploadId로 다시 제출 가능).
///    - 400 `BUSINESS_ERROR`(그리고 404 `BUSINESS_ERROR`)는 message가 아니라 `GET /posts/today`로
///      판정(D-02): `isPosted=true` -> `Copy.uploadErrorDuplicate`(준비물 유지), today 404 또는
///      `topicDate`가 [UploadTarget.topicDate]와 다름 -> `Copy.uploadErrorTopicChanged`,
///      그 밖 -> 서버 message 그대로 + 폐기(사진 준비 처음부터). today 확인이 실패하면
///      `Copy.uploadErrorCreate`(준비물 유지, 스펙 추정).
///    - 401(갱신 후에도) -> loginRequired(폐기, 임시 파일 삭제).
///    - 403 -> `Copy.uploadGateBanned`, 재요청 없음.
///    - 5xx·그 밖 -> `Copy.uploadErrorCreate`(준비물 유지, 재시도 없음).
/// 5. 성공·폐기 실패에는 임시 파일을 지운다.
class PostSubmitter {
  const PostSubmitter({
    required this.repository,
    required this.todayPost,
    required this.preparer,
    required this.monotonic,
  });

  final PostUploadRepository repository;
  final TodayPostRepository todayPost;
  final UploadPreparer preparer;
  final MonotonicClock monotonic;

  Future<SubmitOutcome> submit({
    required PreparedUpload prepared,
    required Uint8List source,
    required UploadTarget target,
    String? title,
    CancelToken? cancelToken,
  }) => throw UnimplementedError();
}
