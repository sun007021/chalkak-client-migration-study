import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/push/push_payload.dart';
import '../domain/notification_permission_prompt.dart';
import '../domain/pending_push_store.dart';

// 저장소로 SharedPreferences를 쓴다(flutter_secure_storage가 아니다). 이유:
// - 두 값 모두 비밀이 아니다(안내를 했는지, 어떤 푸시를 눌렀는지).
// - iOS 키체인은 앱을 지워도 남는다. "앱 설치당 한 번"인 권한 요청 표시와 보류 푸시가 재설치 뒤에도
//   남으면 새 설치에서 OS 권한을 영영 묻지 못하고 낡은 탭을 처리한다. SharedPreferences는 삭제와 함께 사라진다.

/// 보류 중인 푸시 탭 하나를 JSON 문자열로 저장한다(TC-PUSH-063).
class SharedPreferencesPendingPushStore implements PendingPushStore {
  SharedPreferencesPendingPushStore([Future<SharedPreferences>? prefs])
    : _prefs = prefs ?? SharedPreferences.getInstance();

  static const String key = 'push.pending';

  final Future<SharedPreferences> _prefs;

  @override
  Future<PendingPush?> read() async {
    final prefs = await _prefs;
    final raw = prefs.getString(key);
    if (raw == null) return null;
    try {
      final json = jsonDecode(raw);
      if (json is! Map) return null;
      final userId = json['userId'];
      final data = json['payload'];
      if (userId is! String || userId.isEmpty || data is! Map) return null;
      return PendingPush(
        payload: PushPayload.fromData(data.cast<Object?, Object?>()),
        userId: userId,
      );
    } on Object {
      // 깨진 값은 없는 것으로 보고 지운다. 잘못된 이동을 하는 것보다 낫다.
      await prefs.remove(key);
      return null;
    }
  }

  @override
  Future<void> write(PendingPush pending) async {
    final prefs = await _prefs;
    await prefs.setString(
      key,
      jsonEncode({
        'userId': pending.userId,
        'payload': pending.payload.toData(),
      }),
    );
  }

  @override
  Future<void> clear() async {
    final prefs = await _prefs;
    await prefs.remove(key);
  }
}

/// "OS 권한을 이미 요청했다" 표시. 계정과 무관한 기기(설치) 단위다(TC-PUSH-011).
class SharedPreferencesPermissionPromptFlag implements PermissionPromptFlag {
  SharedPreferencesPermissionPromptFlag([Future<SharedPreferences>? prefs])
    : _prefs = prefs ?? SharedPreferences.getInstance();

  static const String key = 'push.permission_requested';

  final Future<SharedPreferences> _prefs;

  @override
  Future<bool> isRequested() async => (await _prefs).getBool(key) ?? false;

  @override
  Future<void> markRequested() async {
    await (await _prefs).setBool(key, true);
  }
}
