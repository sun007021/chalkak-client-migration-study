import '../../../core/time/kst_date.dart';

/// 달력에 나오는 사진의 검수 상태(POST-009). 서버는 `PENDING`·`APPROVED`만 준다(REQ-REC-014).
/// `VALIDATING`·`REJECTED`·알 수 없는 값은 모델로 만들지 않고 응답 전체를 계약 위반으로 본다
/// (REQ-REC-018 (5)).
enum RecordPhotoStatus { pending, approved }

/// `GET /posts/calendar`의 한 건. 날짜 칸은 [topicDate](서버 문자열 그대로, 시간대 변환 없음)로
/// 정한다(REQ-REC-012).
class RecordPhoto {
  const RecordPhoto({
    required this.topicDate,
    required this.postId,
    required this.thumbnailImageUrl,
    required this.status,
  });

  final KstDate topicDate;
  final String postId;

  /// 비어 있지 않다(검증을 통과한 값).
  final String thumbnailImageUrl;
  final RecordPhotoStatus status;

  bool get isApproved => status == RecordPhotoStatus.approved;
  bool get isPending => status == RecordPhotoStatus.pending;
}
