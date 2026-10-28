import '../../../core/time/kst_date.dart';
import 'record_calendar_grid.dart';
import 'record_models.dart';

/// 오류 화면 종류(REQ-REC-024, D-02: errorCode·HTTP 상태·호출 API로만 가른다).
/// 401 -> [unauthorized], 400 -> [invalidMonth], 그 밖(네트워크·5xx·계약 위반) -> [other].
enum RecordFailure { unauthorized, invalidMonth, other }

/// 선택한 달의 내용 상태.
sealed class RecordContent {
  const RecordContent();
}

/// 캐시 없는 달을 처음 불러오는 중. 이전 달 내용은 비운다(`record.loading`).
final class RecordLoading extends RecordContent {
  const RecordLoading();
}

/// 달력을 보여 줄 수 있음. [isRevalidating]은 캐시를 보여 주며 서버에 다시 묻는 중.
final class RecordReady extends RecordContent {
  const RecordReady({required this.photos, this.isRevalidating = false});

  /// 날짜 오름차순, 삭제한 postId는 걸러진 목록. 비어 있으면 빈 달(오류 아님).
  final List<RecordPhoto> photos;
  final bool isRevalidating;
}

/// 캐시 없는 달의 첫 불러오기 실패(`record.error-state`).
final class RecordFailed extends RecordContent {
  const RecordFailed(this.failure);
  final RecordFailure failure;
}

/// 기록 화면 전체 상태. 불변 값 객체.
class RecordState {
  const RecordState({
    required this.today,
    required this.currentMonth,
    required this.selectedMonth,
    required this.availableMonths,
    required this.content,
    required this.selectedDate,
    this.isSaving = false,
    this.isPendingTooltipOpen = false,
  });

  /// 이 상태가 기준으로 삼은 KST 오늘(오늘 칸 강조).
  final KstDate today;

  /// KST 현재 달. 진입·포그라운드 복귀마다 다시 계산한다(D-19).
  final KstMonth currentMonth;
  final KstMonth selectedMonth;

  /// 월 선택지: 서버 목록 ∪ 현재 달, 최신순(REQ-REC-002).
  final List<KstMonth> availableMonths;
  final RecordContent content;

  /// 사진이 있는 날짜만 선택된다. 선택 없음이면 null.
  final KstDate? selectedDate;
  final bool isSaving;
  final bool isPendingTooltipOpen;

  /// 선택한 달의 격자.
  RecordCalendarGrid get grid => throw UnimplementedError();

  /// 'yyyy년 M월'(예: 2026년 10월). 형식은 spec에 없어 구현 재량이다.
  String get monthLabel => throw UnimplementedError();

  /// [content]가 [RecordReady]일 때 [date]의 사진, 아니면 null.
  RecordPhoto? photoOn(KstDate date) => throw UnimplementedError();

  RecordPhoto? get selectedPhoto => throw UnimplementedError();

  /// 선택지의 가장 오래된 달이면 false(REQ-REC-005).
  bool get canGoPrevious => throw UnimplementedError();

  /// 선택지의 가장 최신 달이면 false.
  bool get canGoNext => throw UnimplementedError();
}

/// 화면 밖(셸·라우터)에 요청하는 일회성 이동. 이동에서 돌아오면 화면이 [RecordViewModel.enter]로
/// 재검증한다(REQ-REC-036).
sealed class RecordEvent {
  const RecordEvent();
}

/// "피드에서 보기": 내 게시물 상세. 썸네일 URL을 시드로 넘긴다(REQ-REC-034).
final class RecordOpenFeed extends RecordEvent {
  const RecordOpenFeed(this.photo);
  final RecordPhoto photo;
}

/// "전시 보러가기": 그 사진의 topicDate로 전시를 연다(REQ-REC-035).
final class RecordOpenDisplay extends RecordEvent {
  const RecordOpenDisplay(this.date);
  final KstDate date;
}

/// "로그인 하기".
final class RecordGoToLogin extends RecordEvent {
  const RecordGoToLogin();
}
