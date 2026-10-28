import 'package:flutter/foundation.dart';

import '../../../core/ui/toast/toast_controller.dart';
import '../../auth/domain/user_data_cleaner.dart';
import '../domain/notification_permission.dart';
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

  // ignore: unused_field
  final NotificationSettingsRepository _repository;
  // ignore: unused_field
  final NotificationPermissionGateway _permission;
  // ignore: unused_field
  final ToastSink _toast;

  PushSettingsState get state => throw UnimplementedError();

  /// 설정 탭이 보일 때마다 부른다. [load]와 같다.
  Future<void> onSettingsTabShown() => throw UnimplementedError();

  Future<void> load() => throw UnimplementedError();

  /// loadFailed의 "다시 시도". [load]와 같다.
  Future<void> retry() => throw UnimplementedError();

  Future<void> toggle(PushSetting setting, bool enabled) =>
      throw UnimplementedError();

  void cancelPending() => throw UnimplementedError();

  @override
  Future<void> clearAll() => throw UnimplementedError();
}
