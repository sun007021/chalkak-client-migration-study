// TDD 껍데기: 구현 단계에서 이 줄과 사용하지 않는 필드 경고를 지운다.
// ignore_for_file: unused_field

import 'package:flutter/foundation.dart';

import '../../../core/time/kst_clock.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../auth/domain/user_data_cleaner.dart';
import 'record_calendar_image.dart';
import 'record_post_events.dart';
import 'record_repository.dart';
import 'record_state.dart';

/// 기록 탭 ViewModel(게스트는 이 화면에 들어오지 않는다: 셸의 `GuestGuard`가 REQ-REC-040을
/// 처리하므로 VM은 로그인 회원 전용이다).
///
/// 규칙 요약(docs/spec/features/record.md):
/// - 현재 달: [enter]·[onForeground]마다 `KstClock.currentMonth()`로 다시 계산한다(D-19, REQ-003).
///   월 선택지 = 서버 `GET /posts/calendar/months` ∪ 현재 달, 최신순(REQ-002). 월 목록 조회가
///   실패해도 현재 달만으로 진행하고 토스트는 없다(REQ-008).
/// - 첫 [enter]는 현재 달을 고른다(REQ-004). 이후 [enter]는 사용자가 보던 달·선택 날짜를 유지하고
///   재검증만 한다(REQ-007, 023, 036). 현재 달이 바뀌어도 보던 달은 그대로다.
/// - 월 이동([selectMonth]·[goToPreviousMonth]·[goToNextMonth])은 `availableMonths` 안에서만
///   한다. 이미 선택된 달이나 선택지에 없는 달은 아무 일도 없다(요청 0건, REQ-005~006).
/// - 달 조회: 캐시가 없으면 [RecordLoading](이전 달 내용 비움), 있으면 [RecordReady]
///   (`isRevalidating`)로 캐시를 먼저 보여 주고 곧바로 다시 요청한다(REQ-021~022). 같은 달 요청이
///   진행 중이면 다시 보내지 않는다. 늦게 도착한 다른 달 응답은 화면을 덮지 않는다(REQ-026).
/// - 실패(REQ-024~025, D-20): 캐시 없음 -> [RecordFailed](401 unauthorized, 400 invalidMonth,
///   그 밖 other). 캐시 있음 -> 내용 유지 + 토스트(네트워크 오류는 `Copy.commonErrorNetwork`, 그 밖은
///   `Copy.recordErrOther`). 응답 검증 실패는 서버 오류와 같게 처리한다(REQ-019). 알 수 없는
///   status는 응답 전체를 계약 위반으로 본다(REQ-018 (5)).
/// - 선택 날짜: 사진이 있는 칸만 선택된다(REQ-030). 기본 선택은 그 달에서 topicDate가 가장 늦은
///   사진(REQ-031). 사용자가 고른 날짜는 캐시 교체·재검증 뒤에도 그 날짜가 아직 있으면 유지한다.
///   [enter]의 `requestedDate`(홈 이번 주 칸)는 그 달을 고르고 그 날짜를 최신 사진보다 우선해
///   선택하며 재검증·실패 후 다시 시도에도 유지한다. 그 날짜에 사진이 없으면(삭제됨) 다른 날짜의
///   사진을 대신 열지 않는다(선택 없음, TC-REC-026).
/// - 삭제: [RecordPostEvents.removedPostIds]를 받으면 postId를 기억하고 캐시와 이후 모든 응답에서
///   걸러 낸다. 선택 날짜의 사진이 지워지면 같은 달 가장 최신 사진 날짜로, 없으면 선택 없음으로
///   옮긴다(REQ-027~028). `availableMonths`는 임의로 줄이지 않는다(REQ-029).
/// - [onHidden]: 화면을 벗어나면 진행 중 요청을 취소한다. 취소는 오류가 아니라 로딩으로 남고
///   다시 [enter]하면 불러온다(TC-REC-027).
/// - [clearAll]: 계정 전환·로그아웃(UserDataCleaner). 월별 캐시·삭제 기억·선택 날짜·선택 달을 지우고
///   진행 중 요청의 늦은 응답은 무시한다(TC-REC-028).
/// - [saveCalendarImage]: 현재 보는 달을 PNG로 렌더해 `chalkak-calendar-yyyy-MM.png`로 저장하고
///   결과 토스트(`Copy.recordSaveOk`/`recordSaveDenied`/`recordSaveFail`). 저장 중 재호출은 무시.
class RecordViewModel extends ChangeNotifier implements UserDataCleaner {
  RecordViewModel({
    required this._repository,
    required this._postEvents,
    required this._imageRenderer,
    required this._imageSaver,
    required this._toast,
    this._kstClock = const KstClock(),
  });

  final RecordRepository _repository;
  final RecordPostEvents _postEvents;
  final CalendarImageRenderer _imageRenderer;
  final CalendarImageSaver _imageSaver;
  final ToastSink _toast;
  final KstClock _kstClock;

  RecordState get state => throw UnimplementedError();

  /// 이동 요청 스트림(broadcast).
  Stream<RecordEvent> get events => throw UnimplementedError();

  /// 화면 진입·탭 재선택·이동에서 복귀. 현재 달을 다시 계산하고 월 목록과 보는 달을 요청한다.
  /// 첫 호출이면 현재 달(또는 [requestedDate]의 달)을 고른다.
  Future<void> enter({KstDate? requestedDate}) => throw UnimplementedError();

  /// 앱 포그라운드 복귀. [enter]와 같은 재검증(요청 날짜 없음).
  Future<void> onForeground() => throw UnimplementedError();

  /// 화면을 벗어남. 진행 중 요청을 취소한다.
  void onHidden() => throw UnimplementedError();

  Future<void> selectMonth(KstMonth month) => throw UnimplementedError();
  Future<void> goToPreviousMonth() => throw UnimplementedError();
  Future<void> goToNextMonth() => throw UnimplementedError();

  /// 사진이 있는 날짜만 선택된다. 없는 칸은 아무 일도 없다.
  void selectDate(KstDate date) => throw UnimplementedError();

  /// 오류 화면의 "다시 시도": 보는 달을 [RecordLoading]으로 두고 다시 요청한다.
  Future<void> retry() => throw UnimplementedError();

  /// "피드에서 보기": APPROVED 선택 사진만 [RecordOpenFeed]를 낸다.
  void onViewFeedPressed() => throw UnimplementedError();

  /// "전시 보러가기": APPROVED 선택 사진만 [RecordOpenDisplay]를 낸다.
  void onViewDisplayPressed() => throw UnimplementedError();

  /// "로그인 하기": [RecordGoToLogin].
  void onLoginPressed() => throw UnimplementedError();

  /// "사진 반영 중" 배지 누름: 안내 풍선 열기/닫기(처음엔 닫힘).
  void togglePendingTooltip() => throw UnimplementedError();

  Future<void> saveCalendarImage() => throw UnimplementedError();

  @override
  Future<void> clearAll() => throw UnimplementedError();
}
