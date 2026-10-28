import 'package:dio/dio.dart';

import 'package:flutter/foundation.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/network/api_error.dart';
import '../../../core/push/notification_permission.dart';
import '../../../core/ui/toast/toast_controller.dart';
import '../../auth/domain/user_data_cleaner.dart';
import '../domain/notification_settings.dart';
import '../domain/notification_settings_repository.dart';

enum PushSettingsStatus {
  /// 아직 한 번도 불러오지 않았다(또는 계정 전환으로 비웠다).
  idle,

  /// 처음 불러오는 중. 스위치는 눌리지 않는다(REQ-SET-008, TC-SET-017).
  loading,

  /// 서버 값이 반영됐다. 스위치를 쓸 수 있다.
  ready,

  /// 조회 실패. 스위치는 비활성이고 값을 지어내 보이지 않는다(REQ-SET-010, TC-SET-016).
  loadFailed,
}

class PushSettingsState {
  const PushSettingsState({
    this.status = PushSettingsStatus.idle,
    this.values,
    this.saving = const {},
  });

  final PushSettingsStatus status;

  /// 화면에 보이는 값(낙관적 갱신 포함). [status]가 ready일 때만 있다.
  final NotificationSettings? values;

  /// 지금 저장 요청이 진행 중인 항목. 다른 항목의 입력은 막지 않는다(TC-SET-029).
  final Set<PushSetting> saving;
}

/// 설정 탭의 푸시 수신 설정 세 개(REQ-SET-008~021, TC-SET-014~038).
/// 계정 단위 상태라 [clearAll]이 로그아웃·계정 전환 때 비운다(REQ-SET-020, TC-SET-031, 032, 037).
///
/// 불러오기([load], [onSettingsTabShown]):
/// - 설정 탭이 보일 때마다 `GET /notification-settings`. 처음 불러올 때는 loading, 이미 값이 있으면
///   값을 둔 채 다시 불러와 응답으로 교체한다. 진행 중이면 중복 요청하지 않는다.
/// - 실패(어떤 오류든, 401 포함)하면 loadFailed로 두고 값을 비운다. 토스트는 없다: 화면이 인라인
///   오류와 "다시 시도"를 보인다(D-20 "콘텐츠가 없으면 오류 화면 + 다시 시도"). 요청 취소는 오류가 아니다.
///
/// 변경([toggle]):
/// - ready일 때만 동작한다. loadFailed/loading이면 오래된 서버 값을 기준으로 바꾸지 않는다(TC-SET-033).
/// - 현재 값과 같은 값이면 요청하지 않는다(빈 PATCH 방지, TC-SET-036). 같은 항목 저장이 진행 중이면
///   입력을 무시하고(TC-SET-028), 다른 항목은 독립적으로 동시에 저장한다(TC-SET-029).
/// - 끄는 경우: 응답을 기다리지 않고 동기적으로 새 값으로 바꾼 뒤 `update`. 기기 권한과 무관하다(REQ-SET-016).
/// - 켜는 경우: 기기 권한을 확인한다. denied면 값도 서버도 바꾸지 않고 `openSystemSettings` 한 번,
///   notDetermined면 `request`를 띄워 허용될 때만 진행, 거부되면 아무것도 바꾸지 않는다. granted면
///   진행(TC-SET-038, REQ-SET-015, 018). 임시 동작이며 PATCH를 먼저 보내는 방식으로 바뀔 수 있다.
/// - 저장 성공(204)은 서버 값으로 다시 덮어쓰지 않는다(REQ-SET-012).
/// - 저장 실패: 그 항목만 변경 전 값으로 되돌리고 `Copy.settingsPushSaveError` 토스트. 다른 항목의 값과
///   진행 중 요청은 그대로다(TC-SET-024~027). 401은 토스트 없이 되돌리기만 한다(로그인 이동은 앱 몫).
///   요청 취소는 되돌리기만 하고 토스트가 없다(TC-SET-030).
/// - [clearAll] 이후 도착한 이전 계정의 조회·저장 응답은 반영하지 않는다(상태도 토스트도).
///
/// [cancelPending]·[dispose]: 진행 중 요청을 취소하고 낙관적으로 바꾼 값을 되돌린다(토스트 없음).
class PushSettingsViewModel extends ChangeNotifier implements UserDataCleaner {
  PushSettingsViewModel({
    required this._repository,
    required this._permission,
    required this._toast,
  });

  final NotificationSettingsRepository _repository;
  final NotificationPermission _permission;
  final ToastSink _toast;

  PushSettingsState _state = const PushSettingsState();

  /// 계정이 바뀔 때마다 올린다. 이전 세대의 응답은 상태도 토스트도 만들지 않는다.
  int _generation = 0;

  /// 진행 중인 조회. [clearAll]·[cancelPending]이 비우면 그 조회의 응답은 버려진다.
  _Fetch? _fetch;

  /// 저장 중인 항목과 그 저장의 사정. 항목마다 하나.
  final Map<PushSetting, _Save> _saves = {};

  /// 켜기 전에 기기 권한을 확인하는 중인 항목(같은 항목의 겹친 입력을 막는다).
  final Set<PushSetting> _checking = {};

  CancelToken _cancelToken = CancelToken();
  bool _disposed = false;

  PushSettingsState get state => _state;

  /// 설정 탭이 보일 때마다 부른다. [load]와 같다.
  Future<void> onSettingsTabShown() => load();

  Future<void> load() async {
    if (_disposed || _fetch != null) return;
    final fetch = _fetch = _Fetch(_cancelToken);
    final previous = _state.values;
    if (previous == null) {
      _emit(const PushSettingsState(status: PushSettingsStatus.loading));
    }
    NotificationSettings? fetched;
    ApiError? failure;
    try {
      fetched = await _repository.fetch(cancelToken: fetch.token);
    } on ApiError catch (error) {
      failure = error;
    } on Object {
      failure = ApiError.invalidResponse();
    }
    // 계정이 바뀌었거나 취소·dispose됐다면 이 응답은 더 이상 이 화면의 것이 아니다.
    if (!identical(_fetch, fetch) || _disposed) return;
    _fetch = null;
    if (fetched == null) {
      if (failure != null && failure.isCancelled) {
        _emit(_settled(previous));
      } else {
        _emit(const PushSettingsState(status: PushSettingsStatus.loadFailed));
      }
      return;
    }
    // 저장 중인 항목은 화면의 낙관적 값을 두고 나머지만 서버 값으로 바꾼다.
    var merged = fetched;
    final shown = _state.values;
    if (shown != null) {
      for (final setting in _saves.keys) {
        merged = merged.withValue(setting, shown.valueOf(setting));
      }
    }
    _emit(PushSettingsState(status: PushSettingsStatus.ready, values: merged));
  }

  /// loadFailed의 "다시 시도". [load]와 같다.
  Future<void> retry() => load();

  Future<void> toggle(PushSetting setting, bool enabled) async {
    if (_disposed) return;
    final current = _readyValues();
    if (current == null) return;
    if (_saves.containsKey(setting) || _checking.contains(setting)) return;
    if (current.valueOf(setting) == enabled) return;

    if (enabled) {
      final generation = _generation;
      _checking.add(setting);
      final allowed = await _allowsTurningOn(generation);
      if (generation != _generation || _disposed) return;
      _checking.remove(setting);
      if (!allowed) return;
      // 기다리는 사이 화면 상태가 바뀌었을 수 있다.
      final latest = _readyValues();
      if (latest == null ||
          _saves.containsKey(setting) ||
          latest.valueOf(setting) == enabled) {
        return;
      }
    }
    await _save(setting, enabled);
  }

  /// 서버 값이 반영돼 스위치를 쓸 수 있을 때의 값. 아니면 null.
  NotificationSettings? _readyValues() =>
      _state.status == PushSettingsStatus.ready ? _state.values : null;

  /// 기기 알림 권한이 켜기를 허용하는지. 거부면 시스템 알림 설정을 한 번 열고 false,
  /// 미결정이면 OS 권한 요청을 띄워 허용될 때만 true(REQ-SET-015, 018). 권한 확인이 실패해도 값은 바꾸지 않는다.
  Future<bool> _allowsTurningOn(int generation) async {
    try {
      final status = await _permission.status();
      if (status.allowsDelivery) return true;
      if (status == OsPermissionStatus.notDetermined) {
        return (await _permission.request()).allowsDelivery;
      }
      await _permission.openSystemSettings();
      return false;
    } on Object {
      if (generation == _generation && !_disposed) {
        _toast.show(Copy.notiPermError);
      }
      return false;
    }
  }

  Future<void> _save(PushSetting setting, bool enabled) async {
    final current = _state.values!;
    final save = _Save(
      before: current.valueOf(setting),
      after: enabled,
      token: _cancelToken,
    );
    _saves[setting] = save;
    // 응답을 기다리지 않고 바로 새 값으로 바꾼다.
    _emit(
      PushSettingsState(
        status: PushSettingsStatus.ready,
        values: current.withValue(setting, enabled),
        saving: _savingNow(),
      ),
    );
    ApiError? failure;
    try {
      await _repository.update(setting, enabled, cancelToken: save.token);
    } on ApiError catch (error) {
      failure = error;
    } on Object {
      failure = ApiError.invalidResponse();
    }
    // 계정 전환·취소·dispose로 이 저장이 이미 정리됐으면 결과를 쓰지 않는다.
    if (!identical(_saves[setting], save) || _disposed) return;
    _saves.remove(setting);
    final values = _state.values;
    if (failure == null) {
      // 204는 서버 값으로 다시 덮어쓰지 않는다(REQ-SET-012).
      _emit(_with(values: values));
      return;
    }
    // 이 항목만 변경 전 값으로 되돌린다. 그 사이 다른 값으로 바뀌었다면(재조회 등) 건드리지 않는다.
    final reverted = values != null && values.valueOf(setting) == save.after
        ? values.withValue(setting, save.before)
        : values;
    _emit(_with(values: reverted));
    // 취소는 오류가 아니고, 401은 로그인 이동을 앱이 맡는다.
    if (!failure.isCancelled && failure.status != 401) {
      _toast.show(Copy.settingsPushSaveError);
    }
  }

  /// 진행 중 요청을 취소하고 낙관적으로 바꾼 값을 조용히 되돌린다(화면 이탈).
  void cancelPending() {
    if (_disposed) return;
    _emit(_cancelAll());
  }

  PushSettingsState _cancelAll() {
    // 권한 확인을 기다리던 켜기도 이어 가지 않는다.
    _generation++;
    _cancelToken.cancel();
    _cancelToken = CancelToken();
    var values = _state.values;
    for (final entry in _saves.entries) {
      if (values != null && values.valueOf(entry.key) == entry.value.after) {
        values = values.withValue(entry.key, entry.value.before);
      }
    }
    _saves.clear();
    _checking.clear();
    final hadFetch = _fetch != null;
    _fetch = null;
    // 처음 불러오던 중이었다면 아직 아무것도 못 받은 상태로 돌아간다.
    if (hadFetch && values == null) return const PushSettingsState();
    return PushSettingsState(
      status: _state.status == PushSettingsStatus.loading
          ? PushSettingsStatus.idle
          : _state.status,
      values: values,
    );
  }

  @override
  Future<void> clearAll() async {
    if (_disposed) return;
    // 취소하지 않는다: 이전 계정의 요청은 끝까지 가되 결과만 버린다.
    _generation++;
    _fetch = null;
    _saves.clear();
    _checking.clear();
    _emit(const PushSettingsState());
  }

  Set<PushSetting> _savingNow() => Set.unmodifiable(_saves.keys.toSet());

  PushSettingsState _with({NotificationSettings? values}) => PushSettingsState(
    status: _state.status,
    values: values,
    saving: _savingNow(),
  );

  /// 조회가 취소됐을 때 돌아갈 상태.
  PushSettingsState _settled(NotificationSettings? previous) => previous == null
      ? const PushSettingsState()
      : PushSettingsState(
          status: PushSettingsStatus.ready,
          values: previous,
          saving: _savingNow(),
        );

  void _emit(PushSettingsState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  @override
  void dispose() {
    if (_disposed) return;
    _cancelAll();
    _disposed = true;
    super.dispose();
  }
}

class _Fetch {
  _Fetch(this.token);

  final CancelToken token;
}

class _Save {
  _Save({required this.before, required this.after, required this.token});

  final bool before;
  final bool after;
  final CancelToken token;
}
