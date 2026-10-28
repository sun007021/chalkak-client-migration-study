import '../../../core/time/kst_date.dart';
import '../../edit/domain/photo_edit.dart';
import '../../home/domain/home_models.dart';
import 'photo_file_store.dart';

/// `POST /posts/uploads` 응답(POST-004). `maxBytes`는 64비트 정수로 보존한다.
class UploadPolicy {
  const UploadPolicy({
    required this.uploadId,
    required this.uploadUrl,
    required this.expiresInSeconds,
    required this.contentType,
    required this.maxBytes,
  });

  final String uploadId;
  final Uri uploadUrl;
  final int expiresInSeconds;
  final String contentType;
  final int maxBytes;

  /// `contentType == image/webp`인가(REQ-UPL-026).
  bool get isWebp => throw UnimplementedError();
}

/// 정책 발급과 WebP 인코딩이 끝난 제출 준비물.
class PreparedUpload {
  const PreparedUpload({
    required this.policy,
    required this.file,
    required this.sizeBytes,
    required this.edit,
    required this.issuedAt,
  });

  final UploadPolicy policy;

  /// 앱이 소유한 임시 WebP 파일.
  final StoredPhoto file;
  final int sizeBytes;

  /// 이 파일을 만든 편집값. 새 maxBytes가 더 작으면 같은 값으로 원본에서 다시 인코딩한다.
  final PhotoEdit edit;

  /// 정책을 받은 시각(단조 시계 기준).
  final Duration issuedAt;

  /// 정책을 받은 뒤 `expiresInSeconds - 5초`(UPLOAD_URL_SAFETY_MARGIN)가 지났으면 true.
  /// 정확히 경계(295.000초)도 만료로 본다(REQ-UPL-041).
  bool isExpiredAt(Duration monotonicNow) => throw UnimplementedError();
}

/// `POST /posts` 201 응답. `moderationStatus`는 VALIDATING 또는 PENDING만 받는다(REQ-UPL-046).
class CreatedPost {
  const CreatedPost({required this.postId, required this.moderationStatus});

  final String postId;
  final ModerationStatus moderationStatus;
}

/// 게이트가 고정한 제출 대상(REQ-UPL-008). 자정이 지나도 바꾸지 않는다.
class UploadTarget {
  const UploadTarget({required this.topicId, required this.topicDate});

  final String topicId;
  final KstDate topicDate;
}

enum UploadFailureKind {
  /// 사용자에게 [UploadFailure.message]를 보여 주고 입력을 유지한다.
  failed,

  /// 갱신 후에도 401. 로그인 화면으로 보낸다(REQ-UPL-055).
  loginRequired,

  /// 취소됨. 아무것도 보여 주지 않는다.
  cancelled,
}

/// 준비·제출 단계의 실패. 오류는 errorCode·HTTP 상태·호출 API로만 분기한다(D-02).
class UploadFailure implements Exception {
  const UploadFailure(
    this.message, {
    this.kind = UploadFailureKind.failed,
    this.discardPrepared = false,
  });

  const UploadFailure.cancelled()
    : this('', kind: UploadFailureKind.cancelled, discardPrepared: false);

  const UploadFailure.loginRequired()
    : this('', kind: UploadFailureKind.loginRequired, discardPrepared: true);

  /// 사용자에게 보일 문구(`Copy.upload*` 또는 서버 message 그대로).
  final String message;
  final UploadFailureKind kind;

  /// true면 정책과 임시 파일을 버리고 다음 "전시하기"가 정책 발급부터 다시 한다.
  final bool discardPrepared;

  @override
  String toString() => 'UploadFailure($kind, $message)';
}
