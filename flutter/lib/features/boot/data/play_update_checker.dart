import '../domain/update_checker.dart';

/// Play Core `AppUpdateInfo`의 필요한 부분.
class PlayUpdateInfo {
  const PlayUpdateInfo({
    required this.updateAvailable,
    required this.priority,
    required this.immediateAllowed,
  });

  final bool updateAvailable;
  final int priority;
  final bool immediateAllowed;
}

/// Play In-App Update를 감싼 플랫폼 경계. 감지(updatePriority)에만 쓴다. 업데이트 실행은 스토어 페이지 열기([StoreUpdateLauncher]).
abstract interface class PlayUpdateSource {
  /// 조회 실패는 예외.
  Future<PlayUpdateInfo> fetchInfo();
}

/// 업데이트가 있고 우선순위가 1 이상(그리고 즉시 업데이트 허용)이면 필수(REQ-BOOT-008).
/// 우선순위 0이면 통과, 조회 예외는 [UpdateStatus.unavailable].
class PlayUpdateChecker implements UpdateChecker {
  PlayUpdateChecker({required this._source});

  final PlayUpdateSource _source;

  @override
  Future<UpdateStatus> check() async {
    try {
      final info = await _source.fetchInfo();
      final required =
          info.updateAvailable && info.priority >= 1 && info.immediateAllowed;
      return required ? UpdateStatus.updateRequired : UpdateStatus.upToDate;
    } on Object {
      return UpdateStatus.unavailable;
    }
  }
}
