import 'dart:async';

import 'package:clock/clock.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/time/kst_clock.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../auth/domain/user_data_cleaner.dart';
import 'ai_review_models.dart';
import 'ai_review_repository.dart';
import 'ai_review_state.dart';
import 'ai_review_target.dart';

/// 게시물 하나의 AI 피드백 상태·시트·폴링을 맡는 세션(상세 알약과 홈 카드가 같은 로직을 쓴다,
/// REQ-AIR-050). 화면(상세·홈)을 모르고 호스트가 대상·가시성·사용자 동작을 넘겨 준다.
///
/// 규칙 요약(docs/spec/features/ai-review.md, D-03):
/// - 대상이 없거나(null) 화면이 보이지 않으면 요청 0건, 알약은 [AiPill.hidden]이다(REQ-AIR-001, 007).
/// - [onShown]은 `GET`만 보낸다. `POST`는 시작 시트의 [onStartConfirmed]로만 한 번 나가고 자동으로
///   다시 보내지 않는다(REQ-AIR-002, 019, 020). 진행 중인 `POST`가 있으면 추가 `POST`는 0건이다.
/// - 새 분석·재요청은 대상의 `topicDate`가 KST 오늘일 때만 가능하고, 알약을 그릴 때와 누를 때
///   ([onPillPressed]·[onStartConfirmed]) 둘 다 `KstClock.today()`로 다시 판정한다(REQ-AIR-003).
///   지난 주제의 NONE은 알약을 숨기고, 그 밖의 상태는 보여 주되 시작·재요청은 없다(REQ-AIR-004).
/// - 알약 매핑: 첫 `GET` 진행 checking, 첫 `GET` 실패 recheck, NONE(오늘) request, `POST` 진행
///   requesting, PROCESSING processing, COMPLETED view, FAILED는 `canRequestAgain`이고 오늘이면
///   retry 아니면 failed. 404는 hidden이고 더 조회하지 않는다(REQ-AIR-005, 008~016).
/// - 알약 탭: request -> 시작 시트, retry -> 재요청 시트([AiReviewSurface.home]은 시트 없이 바로
///   `POST`, REQ-AIR-036), view -> 결과 시트, failed -> 실패 시트, recheck -> `GET` 1회.
///   시트를 닫으면 요청이 없다(REQ-AIR-019).
/// - `POST` 응답은 HTTP 코드가 아니라 `status`로 해석한다: PROCESSING이면 폴링 시작, COMPLETED면
///   폴링 없이 결과 상태(시트는 자동으로 열지 않음), FAILED면 실패 상태(REQ-AIR-021, 022).
///   창 시작은 `POST`를 보낸 시각이다(REQ-AIR-034).
/// - `POST` 실패(REQ-AIR-035, 024, 실패별 처리 표): 400은 서버 `message` 그대로 토스트하고 이전 상태를
///   유지, 403 `Copy.aiErrorBanned`, 404 `Copy.aiErrorNotFound` + 숨김, 401 `Copy.aiErrorLogin`
///   (갱신/로그인 이동은 ApiClient·D-17), 연결 오류 `Copy.aiErrorNetwork`·5xx·검증 실패
///   `Copy.aiErrorLoad` 뒤 `GET`으로 한 번 동기화한다. 어떤 경우도 `POST`를 다시 보내지 않는다.
/// - 폴링은 PROCESSING일 때만, 직전 응답 뒤 [AppConstants.aiReviewPollInterval](3초) 간격으로
///   `GET`하고(동시에 둘 이상 없음), 창은 [AppConstants.aiReviewPollWindow](300초)이며 시작 시각은
///   `POST`를 보낸 시각 또는 폴링을 시작한 시각이다(서버 `requestedAt`은 쓰지 않는다). 시간은
///   `package:clock`과 `Timer`로만 다룬다. 창을 넘기면 `GET` 없이 멈추고 `state.notice`에
///   `Copy.aiPollTimeout`을 담으며 PROCESSING·`POST` 0건을 유지한다. 정확히 300.000초에는 요청하지
///   않는다(3.0, 6.0, ... 297.0초에 99회, REQ-AIR-025~027).
/// - COMPLETED·FAILED·NONE이 확인되면 폴링을 멈춘다(REQ-AIR-032). 폴링 중 네트워크 오류·5xx는 계속
///   폴링하고 오류 토스트는 한 번만 띄운다. 404는 메시지 없이 숨기고 멈추며 401은 멈추고
///   `Copy.aiErrorLogin`을 알린다(REQ-AIR-029, 030). 첫 `GET`의 404 외 오류는 recheck + 토스트다.
/// - [onHidden](백그라운드·다른 화면·다른 탭): 폴링을 멈추고 진행 중 요청의 결과를 버린다. 다시
///   [onShown]이면 `GET`부터 새 300초 창이다(REQ-AIR-028). 화면 이탈 뒤 도착한 `GET`·`POST` 응답은
///   상태를 바꾸지 않는다(REQ-AIR-023, 031).
/// - 늦은 응답은 버린다: 수동 갱신([onPillPressed] recheck) 뒤 도착한 이전 폴링 응답은 완료 결과를 덮지
///   않고, 대상이 A에서 B로 바뀌면 A의 응답이 B를 덮지 않는다. [clearAll](계정 전환·로그아웃)은 대상·
///   결과·시트·진행 중 응답을 모두 지운다(D-17).
/// - 완료 결과 재진입: [AiReviewSurface.feed]는 `GET`으로 갱신하고, [AiReviewSurface.home]은 같은
///   게시물의 완료 결과를 다시 조회하지 않으며 처리 중이면 `GET`을 재개한다. 다른 게시물로 바뀌면
///   이전 결과를 지우고 새로 조회한다(REQ-AIR-051).
/// - 푸시 진입([openSheetOnEntry]): 진입 뒤 첫 `GET`이 COMPLETED면 결과 시트, FAILED면 실패 시트를
///   한 번만 자동으로 연다. PROCESSING·NONE이면 열지 않고, 닫은 뒤나 재진입에서는 다시 열지 않는다
///   (REQ-AIR-046, 047).
class AiReviewSession extends ChangeNotifier implements UserDataCleaner {
  AiReviewSession({
    required this._repository,
    required this._toast,
    this._surface = AiReviewSurface.feed,
    this._openSheetOnEntry = false,
    this._kstClock = const KstClock(),
  });

  final AiReviewRepository _repository;
  final ToastSink _toast;
  final AiReviewSurface _surface;
  final bool _openSheetOnEntry;
  final KstClock _kstClock;

  AiReviewTarget? _target;
  bool _visible = false;
  bool _disposed = false;

  AiReview? _review;

  /// 첫 `GET`이 404 외 오류로 실패했고 아직 확인한 상태가 없다(recheck).
  bool _recheck = false;

  /// 첫 `GET`을 기다리는 중(확인한 상태가 없을 때만 알약에 보인다).
  bool _checking = false;
  bool _notFound = false;
  bool _requesting = false;
  AiSheet? _sheet;
  bool _criteriaOpen = false;
  String? _notice;

  /// 푸시 진입의 자동 시트는 첫 성공 응답에서 한 번만 쓴다.
  late bool _entryPending = _openSheetOnEntry;

  /// 늦은 응답을 가려내는 세대. 화면 이탈·대상 변경·수동 갱신·정리 때마다 올린다.
  int _generation = 0;
  CancelToken? _getToken;

  /// 진입·수동 갱신으로 보낸 `GET`이 아직 안 끝났다(같은 순간의 중복 호출을 합친다).
  bool _entryFetchInFlight = false;

  Timer? _pollTimer;

  /// 폴링 창 시작 시각(`POST`를 보낸 시각 또는 폴링을 시작한 시각). 폴링 중이 아니면 null.
  DateTime? _windowStart;

  /// 현재 폴링 연속 구간에서 오류 토스트를 이미 띄웠다.
  bool _pollErrorToasted = false;

  AiReviewState get state => AiReviewState(
    pill: _pill(),
    sheet: _sheet,
    criteriaDialogOpen: _criteriaOpen,
    notice: _notice,
    review: _review,
  );

  /// 현재 대상. 없으면 null.
  AiReviewTarget? get target => _target;

  bool get _isToday =>
      _target != null && _target!.topicDate == _kstClock.today();

  AiPill _pill() {
    if (_target == null || _notFound) return AiPill.hidden;
    if (_requesting) return AiPill.requesting;
    final review = _review;
    if (review == null) {
      if (_checking) return AiPill.checking;
      if (_recheck) return AiPill.recheck;
      return AiPill.hidden;
    }
    return switch (review.status) {
      AiReviewStatus.none => _isToday ? AiPill.request : AiPill.hidden,
      AiReviewStatus.processing => AiPill.processing,
      AiReviewStatus.completed => AiPill.view,
      AiReviewStatus.failed =>
        review.canRequestAgain && _isToday ? AiPill.retry : AiPill.failed,
    };
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  /// 진행 중인 요청 결과를 버리고 폴링을 멈춘다.
  void _invalidate() {
    _generation++;
    _getToken?.cancel();
    _getToken = null;
    _entryFetchInFlight = false;
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  void _resetForTarget() {
    _review = null;
    _recheck = false;
    _checking = false;
    _notFound = false;
    _requesting = false;
    _sheet = null;
    _criteriaOpen = false;
    _notice = null;
    _windowStart = null;
    _pollErrorToasted = false;
  }

  /// 대상을 정한다(null = 없음). 같은 대상이면 아무 일도 없고, 다른 대상이면 이전 대상의 결과·시트·
  /// 진행 중 응답을 모두 버린다. 이미 보이는 중이면 `GET`부터 시작한다.
  void setTarget(AiReviewTarget? target) {
    if (_disposed || target == _target) return;
    _invalidate();
    _resetForTarget();
    _target = target;
    if (target != null && _visible) {
      _beginFetch();
    } else {
      _notify();
    }
  }

  /// 화면이 보이게 됐다. `GET`(자동 `POST` 없음)을 보내고 PROCESSING이면 폴링한다. 이미 보이는 중에
  /// 다시 불리면 새로 `GET`해 상태를 맞추고(수동 갱신) 이전 폴링 응답은 버린다. 다만 바로 앞의
  /// [setTarget]이 이미 시작한 조회와 겹쳐 불리면 `GET`은 한 번이다.
  void onShown() {
    if (_disposed) return;
    final wasVisible = _visible;
    _visible = true;
    if (_target == null) return;
    if (wasVisible && _entryFetchInFlight) return;
    // 홈은 같은 게시물의 완료 결과를 다시 조회하지 않고 유지한다(REQ-AIR-051).
    if (_surface == AiReviewSurface.home &&
        _review?.status == AiReviewStatus.completed) {
      return;
    }
    if (_notFound) return;
    _beginFetch();
  }

  /// 화면이 보이지 않게 됐다(백그라운드·덮임·다른 탭). 폴링 중단, 진행 중 응답 폐기.
  void onHidden() {
    if (_disposed) return;
    final wasActive = _visible;
    _visible = false;
    _invalidate();
    _windowStart = null;
    _pollErrorToasted = false;
    final changed = _requesting || _checking;
    _requesting = false;
    if (_checking) {
      _checking = false;
      _recheck = _review == null;
    }
    if (wasActive || changed) _notify();
  }

  /// 알약·카드 탭.
  void onPillPressed() {
    if (_disposed || _target == null) return;
    final pill = _pill();
    if (!pill.enabled) return;
    switch (pill) {
      case AiPill.request:
        _openSheet(const AiStartSheet(retry: false));
      case AiPill.retry:
        if (_surface == AiReviewSurface.home) {
          _startPost();
        } else {
          _openSheet(const AiStartSheet(retry: true));
        }
      case AiPill.view:
        final result = _review?.result;
        if (result != null) _openSheet(AiResultSheet(AiResultUi.from(result)));
      case AiPill.failed:
        _openSheet(_failedSheet());
      case AiPill.recheck:
        _beginFetch();
      case AiPill.hidden ||
          AiPill.checking ||
          AiPill.requesting ||
          AiPill.processing:
        break;
    }
  }

  AiFailedSheet _failedSheet() {
    final review = _review;
    final String? reason;
    if (review != null && !review.canRequestAgain) {
      reason = Copy.aiFailedNoMore;
    } else if (!_isToday) {
      reason = Copy.aiFailedPast;
    } else {
      reason = null;
    }
    return AiFailedSheet(reason: reason);
  }

  void _openSheet(AiSheet sheet) {
    _sheet = sheet;
    _notify();
  }

  /// 시작(재요청) 시트의 "분석 시작하기". `POST`를 보내는 유일한 경로다.
  void onStartConfirmed() {
    if (_disposed || _sheet is! AiStartSheet) return;
    _startPost();
  }

  /// 시트를 요청 없이 닫았다(기준 다이얼로그도 닫는다).
  void onSheetDismissed() {
    if (_disposed || (_sheet == null && !_criteriaOpen)) return;
    _sheet = null;
    _criteriaOpen = false;
    _notify();
  }

  /// 결과 시트의 기준 설명 진입.
  void onCriteriaHelpPressed() {
    if (_disposed || _sheet is! AiResultSheet || _criteriaOpen) return;
    _criteriaOpen = true;
    _notify();
  }

  void onCriteriaHelpDismissed() {
    if (_disposed || !_criteriaOpen) return;
    _criteriaOpen = false;
    _notify();
  }

  @override
  Future<void> clearAll() async {
    if (_disposed) return;
    _invalidate();
    _resetForTarget();
    _target = null;
    _entryPending = false;
    _notify();
  }

  /// 화면이 닫힘: 모든 요청·타이머를 정리하고 늦은 응답은 아무 것도 바꾸지 않는다.
  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _invalidate();
    super.dispose();
  }

  // ---- GET ----

  /// 진입·수동 갱신 조회. 이전 요청과 폴링은 버린다.
  void _beginFetch() {
    _invalidate();
    _notice = null;
    _notFound = false;
    _recheck = false;
    _checking = _review == null;
    _windowStart ??= clock.now();
    _entryFetchInFlight = true;
    _notify();
    _sendGet(poll: false);
  }

  Future<void> _sendGet({required bool poll, bool silent = false}) async {
    final target = _target;
    if (target == null) return;
    final generation = _generation;
    final token = _getToken = CancelToken();
    try {
      final review = await _repository.get(target.postId, cancelToken: token);
      if (_stale(generation)) return;
      _entryFetchInFlight = false;
      _checking = false;
      _pollErrorToasted = false;
      _applyReview(review);
    } on Object catch (error) {
      if (_stale(generation)) return;
      _entryFetchInFlight = false;
      _checking = false;
      _onGetError(error, poll: poll, silent: silent);
    }
  }

  bool _stale(int generation) => _disposed || generation != _generation;

  void _onGetError(Object error, {required bool poll, required bool silent}) {
    final api = error is ApiError ? error : null;
    if (api?.isCancelled ?? false) return;
    if (api?.status == 404) {
      _hide();
      return;
    }
    if (silent) {
      _notify();
      return;
    }
    final unauthorized = api?.status == 401;
    if (poll) {
      if (unauthorized) {
        _stopPolling();
        _toast.show(Copy.aiErrorLogin);
        _notify();
        return;
      }
      if (!_pollErrorToasted) {
        _pollErrorToasted = true;
        _toast.show(_errorMessage(api));
      }
      _schedulePoll();
      _notify();
      return;
    }
    if (_review == null) _recheck = true;
    if (_review?.status == AiReviewStatus.processing) {
      _schedulePoll();
    } else {
      _stopPolling();
    }
    _toast.show(unauthorized ? Copy.aiErrorLogin : _errorMessage(api));
    _notify();
  }

  /// 404: 알약을 숨기고 더 조회하지 않는다.
  void _hide() {
    _notFound = true;
    _review = null;
    _sheet = null;
    _criteriaOpen = false;
    _stopPolling();
    _notify();
  }

  String _errorMessage(ApiError? error) =>
      error != null && error.isNetwork ? Copy.aiErrorNetwork : Copy.aiErrorLoad;

  /// 새로 확인한 서버 상태를 반영하고 폴링·자동 시트를 정한다.
  void _applyReview(AiReview review) {
    _review = review;
    _recheck = false;
    _notFound = false;
    _openEntrySheet(review);
    if (_sheet is AiStartSheet) {
      final pill = _pill();
      if (pill != AiPill.request && pill != AiPill.retry) _sheet = null;
    }
    if (_sheet is AiResultSheet && review.status != AiReviewStatus.completed) {
      _sheet = null;
      _criteriaOpen = false;
    }
    if (review.status == AiReviewStatus.processing) {
      _windowStart ??= clock.now();
      _schedulePoll();
    } else {
      _stopPolling();
    }
    _notify();
  }

  void _openEntrySheet(AiReview review) {
    if (!_entryPending) return;
    _entryPending = false;
    switch (review.status) {
      case AiReviewStatus.completed:
        final result = review.result;
        if (result != null) _sheet = AiResultSheet(AiResultUi.from(result));
      case AiReviewStatus.failed:
        _sheet = _failedSheet();
      case AiReviewStatus.none || AiReviewStatus.processing:
        break;
    }
  }

  // ---- 폴링 ----

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _windowStart = null;
  }

  /// 직전 응답 3초 뒤에 다음 `GET`을 예약한다. 창이 끝나면 `GET` 없이 안내만 남기고 멈춘다.
  void _schedulePoll() {
    _pollTimer?.cancel();
    _pollTimer = null;
    final start = _windowStart;
    if (start == null) return;
    final remaining =
        AppConstants.aiReviewPollWindow - clock.now().difference(start);
    if (remaining <= Duration.zero) {
      _timeout();
      return;
    }
    final delay = remaining < AppConstants.aiReviewPollInterval
        ? remaining
        : AppConstants.aiReviewPollInterval;
    _pollTimer = Timer(delay, _onPollTimer);
  }

  void _onPollTimer() {
    _pollTimer = null;
    if (_disposed || _target == null) return;
    final start = _windowStart;
    if (start == null) return;
    if (clock.now().difference(start) >= AppConstants.aiReviewPollWindow) {
      _timeout();
      return;
    }
    _sendGet(poll: true);
  }

  void _timeout() {
    _stopPolling();
    _notice = Copy.aiPollTimeout;
    _notify();
  }

  // ---- POST ----

  Future<void> _startPost() async {
    final target = _target;
    if (target == null || _requesting) return;
    if (!_isToday) {
      // 자정이 지났다: 시트를 닫고 요청하지 않는다(REQ-AIR-003).
      _sheet = null;
      _notify();
      return;
    }
    _invalidate();
    final generation = _generation;
    _sheet = null;
    _notice = null;
    _checking = false;
    _requesting = true;
    _pollErrorToasted = false;
    _windowStart = clock.now();
    _notify();
    try {
      final review = await _repository.request(target.postId);
      if (_stale(generation)) return;
      _requesting = false;
      _applyReview(review);
    } on Object catch (error) {
      if (_stale(generation)) return;
      _requesting = false;
      _windowStart = null;
      _onPostError(error);
    }
  }

  void _onPostError(Object error) {
    final api = error is ApiError ? error : null;
    if (api == null || api.isCancelled) {
      _notify();
      return;
    }
    switch (api.status) {
      case 404:
        _toast.show(Copy.aiErrorNotFound);
        _hide();
        return;
      case 400:
        _toast.show(_serverMessage(api));
      case 401:
        _toast.show(Copy.aiErrorLogin);
      case 403:
        _toast.show(Copy.aiErrorBanned);
      case 409:
        _syncAfterPostFailure();
        _notify();
        return;
      default:
        _toast.show(_errorMessage(api));
        _syncAfterPostFailure();
    }
    _notify();
  }

  String _serverMessage(ApiError error) {
    final message = error.message;
    return message == null || message.isEmpty ? Copy.aiErrorLoad : message;
  }

  /// `POST` 결과를 알 수 없을 때 `GET`으로 한 번 맞춘다(문구 없이).
  void _syncAfterPostFailure() {
    final target = _target;
    if (target == null) return;
    _invalidate();
    _windowStart ??= clock.now();
    _entryFetchInFlight = true;
    _sendGet(poll: false, silent: true);
  }
}
