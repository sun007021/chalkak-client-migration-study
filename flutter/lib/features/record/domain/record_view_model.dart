import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/time/kst_clock.dart';
import '../../../core/time/kst_date.dart';
import '../../../core/time/kst_format.dart';
import '../../../core/time/record_months.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../auth/domain/user_data_cleaner.dart';
import 'record_calendar_image.dart';
import 'record_models.dart';
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
  }) {
    _refreshClock();
    _selectedMonth = _currentMonth;
    _removedSubscription = _postEvents.removedPostIds.listen(_onPostRemoved);
    _state = _build();
  }

  final RecordRepository _repository;
  final RecordPostEvents _postEvents;
  final CalendarImageRenderer _imageRenderer;
  final CalendarImageSaver _imageSaver;
  final ToastSink _toast;
  final KstClock _kstClock;

  final StreamController<RecordEvent> _events =
      StreamController<RecordEvent>.broadcast(sync: true);
  late final StreamSubscription<String> _removedSubscription;

  /// 달별 검증을 통과한 응답(삭제한 postId를 거르기 전 원본). 화면은 읽을 때 거른다.
  final Map<KstMonth, List<RecordPhoto>> _cache = {};

  /// 캐시 없는 달의 첫 불러오기 실패. 달을 다시 열거나 다시 시도하면 지운다.
  final Map<KstMonth, RecordFailure> _failures = {};

  /// 진행 중인 달 요청. 같은 달은 하나만 보낸다(TC-REC-025).
  final Map<KstMonth, _Fetch> _inflight = {};
  _Fetch? _monthsFetch;

  final Set<String> _removedPostIds = {};
  List<KstMonth> _serverMonths = const [];

  late KstDate _today;
  late KstMonth _currentMonth;
  late KstMonth _selectedMonth;
  late RecordState _state;

  /// 사용자가 고른 날짜. 새 응답에 없으면 기본 선택으로 돌아간다(REQ-REC-023).
  KstDate? _userDate;

  /// 홈이 요청한 날짜. 사진이 없어도 다른 날짜로 대신하지 않는다(TC-REC-026).
  KstDate? _requestedDate;
  bool _entered = false;
  bool _tooltipOpen = false;
  bool _isSaving = false;
  int _saveRun = 0;
  bool _disposed = false;

  RecordState get state => _state;

  /// 이동 요청 스트림(broadcast).
  Stream<RecordEvent> get events => _events.stream;

  // ---- 진입 ----

  /// 화면 진입·탭 재선택·이동에서 복귀. 현재 달을 다시 계산하고 월 목록과 보는 달을 요청한다.
  /// 첫 호출이면 현재 달(또는 [requestedDate]의 달)을 고른다.
  Future<void> enter({KstDate? requestedDate}) {
    if (_disposed) return Future.value();
    _refreshClock();
    if (requestedDate != null) {
      _selectedMonth = requestedDate.yearMonth;
      _requestedDate = requestedDate;
      _userDate = null;
      _tooltipOpen = false;
    } else if (!_entered) {
      _selectedMonth = _currentMonth;
      _requestedDate = null;
      _userDate = null;
    }
    _entered = true;
    _failures.remove(_selectedMonth);
    final loads = Future.wait([_loadMonths(), _loadCalendar(_selectedMonth)]);
    _publish();
    return loads;
  }

  /// 앱 포그라운드 복귀. [enter]와 같은 재검증(요청 날짜 없음).
  Future<void> onForeground() => enter();

  /// 화면을 벗어남. 진행 중 요청을 취소한다.
  void onHidden() {
    if (_disposed) return;
    _cancelRequests();
    _publish();
  }

  // ---- 월 이동 ----

  Future<void> selectMonth(KstMonth month) {
    if (_disposed || month == _selectedMonth || !_options.contains(month)) {
      return Future.value();
    }
    _selectedMonth = month;
    _userDate = null;
    _requestedDate = null;
    _tooltipOpen = false;
    _failures.remove(month);
    final load = _loadCalendar(month);
    _publish();
    return load;
  }

  Future<void> goToPreviousMonth() {
    // 최신순 목록에서 선택한 달보다 오래된 첫 달이 바로 이전 달이다.
    for (final month in _options) {
      if (month.compareTo(_selectedMonth) < 0) return selectMonth(month);
    }
    return Future.value();
  }

  Future<void> goToNextMonth() {
    for (final month in _options.reversed) {
      if (month.compareTo(_selectedMonth) > 0) return selectMonth(month);
    }
    return Future.value();
  }

  /// 오류 화면의 "다시 시도": 보는 달을 [RecordLoading]으로 두고 다시 요청한다.
  Future<void> retry() {
    if (_disposed) return Future.value();
    _failures.remove(_selectedMonth);
    final load = _loadCalendar(_selectedMonth);
    _publish();
    return load;
  }

  // ---- 날짜·동작 ----

  /// 사진이 있는 날짜만 선택된다. 없는 칸은 아무 일도 없다.
  void selectDate(KstDate date) {
    if (_disposed || _state.photoOn(date) == null) return;
    _userDate = date;
    _requestedDate = null;
    _tooltipOpen = false;
    _publish();
  }

  /// "피드에서 보기": APPROVED 선택 사진만 [RecordOpenFeed]를 낸다.
  void onViewFeedPressed() {
    final photo = _state.selectedPhoto;
    if (_disposed || photo == null || !photo.isApproved) return;
    _events.add(RecordOpenFeed(photo));
  }

  /// "전시 보러가기": APPROVED 선택 사진만 [RecordOpenDisplay]를 낸다.
  void onViewDisplayPressed() {
    final photo = _state.selectedPhoto;
    if (_disposed || photo == null || !photo.isApproved) return;
    _events.add(RecordOpenDisplay(photo.topicDate));
  }

  /// "로그인 하기": [RecordGoToLogin].
  void onLoginPressed() {
    if (!_disposed) _events.add(const RecordGoToLogin());
  }

  /// "사진 반영 중" 배지 누름: 안내 풍선 열기/닫기(처음엔 닫힘).
  void togglePendingTooltip() {
    if (_disposed || _state.selectedPhoto?.isPending != true) return;
    _tooltipOpen = !_tooltipOpen;
    _publish();
  }

  // ---- 달력 이미지 저장 ----

  Future<void> saveCalendarImage() async {
    final content = _state.content;
    if (_disposed || _isSaving || content is! RecordReady) return;
    final month = _selectedMonth;
    final run = ++_saveRun;
    _isSaving = true;
    _publish();
    final String message;
    try {
      final png = await _imageRenderer.render(
        RecordCalendarImageSpec(month: month, photos: content.photos),
      );
      await _imageSaver.save(
        fileName: KstFormat.calendarImageFileName(month),
        pngBytes: png,
      );
      message = Copy.recordSaveOk;
    } on CalendarImagePermissionDenied {
      return _finishSave(run, Copy.recordSaveDenied);
    } on Object {
      return _finishSave(run, Copy.recordSaveFail);
    }
    _finishSave(run, message);
  }

  /// 저장 도중 화면이 사라졌거나 계정이 바뀌었으면(세대가 다르면) 결과를 알리지 않는다.
  void _finishSave(int run, String message) {
    if (_disposed || run != _saveRun) return;
    _isSaving = false;
    _publish();
    _toast.show(message);
  }

  // ---- 계정 전환·해제 ----

  @override
  Future<void> clearAll() async {
    if (_disposed) return;
    _cancelRequests();
    _cache.clear();
    _failures.clear();
    _removedPostIds.clear();
    _serverMonths = const [];
    _userDate = null;
    _requestedDate = null;
    _entered = false;
    _tooltipOpen = false;
    _saveRun++;
    _isSaving = false;
    _refreshClock();
    _selectedMonth = _currentMonth;
    _publish();
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelRequests();
    unawaited(_removedSubscription.cancel());
    unawaited(_events.close());
    super.dispose();
  }

  // ---- 요청 ----

  List<KstMonth> get _options =>
      RecordMonths.options(serverMonths: _serverMonths, current: _currentMonth);

  void _refreshClock() {
    _today = _kstClock.today();
    _currentMonth = _today.yearMonth;
  }

  /// 진행 중 요청을 모두 취소하고 잊는다. 늦게 끝난 요청은 [_Fetch] 동일성 검사로 버려진다.
  void _cancelRequests() {
    for (final fetch in [..._inflight.values, ?_monthsFetch]) {
      fetch.token.cancel();
    }
    _inflight.clear();
    _monthsFetch = null;
  }

  Future<void> _loadMonths() {
    final existing = _monthsFetch;
    if (existing != null) return existing.future;
    final fetch = _Fetch();
    _monthsFetch = fetch;
    return fetch.future = _runMonths(fetch);
  }

  Future<void> _runMonths(_Fetch fetch) async {
    List<KstMonth>? months;
    try {
      months = await _repository.months(cancelToken: fetch.token);
    } on Object {
      // 실패해도 현재 달만으로 진행하고 알리지 않는다(REQ-REC-008).
    }
    if (_disposed || _monthsFetch != fetch) return;
    _monthsFetch = null;
    if (months != null) _serverMonths = months;
    _publish();
  }

  Future<void> _loadCalendar(KstMonth month) {
    final existing = _inflight[month];
    if (existing != null) return existing.future;
    final fetch = _Fetch();
    _inflight[month] = fetch;
    return fetch.future = _runCalendar(month, fetch);
  }

  Future<void> _runCalendar(KstMonth month, _Fetch fetch) async {
    List<RecordPhoto>? photos;
    Object? failure;
    try {
      photos = await _repository.calendar(month, cancelToken: fetch.token);
    } on Object catch (error) {
      failure = error;
    }
    if (_disposed || _inflight[month] != fetch) return;
    _inflight.remove(month);
    if (photos != null) {
      _cache[month] = photos;
      _failures.remove(month);
    } else {
      _onCalendarFailed(month, failure is ApiError ? failure : null);
    }
    _publish();
  }

  void _onCalendarFailed(KstMonth month, ApiError? error) {
    if (error != null && error.isCancelled) return;
    // 보고 있지 않은 달의 실패는 알리지 않는다. 그 달을 열면 새로 요청한다.
    if (month != _selectedMonth) return;
    if (_cache.containsKey(month)) {
      _toast.show(
        error != null && error.isNetwork
            ? Copy.commonErrorNetwork
            : Copy.recordErrOther,
      );
      return;
    }
    _failures[month] = switch (error?.status) {
      401 => RecordFailure.unauthorized,
      400 => RecordFailure.invalidMonth,
      _ => RecordFailure.other,
    };
  }

  void _onPostRemoved(String postId) {
    if (_disposed) return;
    _removedPostIds.add(postId);
    final requested = _requestedDate;
    if (requested != null && _state.photoOn(requested)?.postId == postId) {
      _requestedDate = null;
    }
    _publish();
  }

  // ---- 상태 조립 ----

  void _publish() {
    if (_disposed) return;
    _state = _build();
    notifyListeners();
  }

  RecordState _build() {
    final content = _buildContent();
    final selectedDate = _buildSelectedDate(content);
    final selectedIsPending =
        content is RecordReady &&
        content.photos.any((p) => p.topicDate == selectedDate && p.isPending);
    return RecordState(
      today: _today,
      currentMonth: _currentMonth,
      selectedMonth: _selectedMonth,
      availableMonths: _options,
      content: content,
      selectedDate: selectedDate,
      isSaving: _isSaving,
      isPendingTooltipOpen: _tooltipOpen && selectedIsPending,
    );
  }

  RecordContent _buildContent() {
    final cached = _cache[_selectedMonth];
    if (cached != null) {
      return RecordReady(
        photos: [
          for (final photo in cached)
            if (!_removedPostIds.contains(photo.postId)) photo,
        ],
        isRevalidating: _inflight.containsKey(_selectedMonth),
      );
    }
    final failure = _failures[_selectedMonth];
    return failure == null ? const RecordLoading() : RecordFailed(failure);
  }

  KstDate? _buildSelectedDate(RecordContent content) {
    if (content is! RecordReady) return null;
    final dates = {for (final photo in content.photos) photo.topicDate};
    final requested = _requestedDate;
    if (requested != null && requested.yearMonth == _selectedMonth) {
      return dates.contains(requested) ? requested : null;
    }
    final user = _userDate;
    if (user != null && dates.contains(user)) return user;
    return dates.isEmpty ? null : dates.reduce((a, b) => a >= b ? a : b);
  }
}

/// 진행 중인 요청 하나. 취소·계정 전환 뒤 늦게 끝난 요청은 이 객체가 더 이상 등록돼 있지 않아 버려진다.
class _Fetch {
  final CancelToken token = CancelToken();
  late final Future<void> future;
}
