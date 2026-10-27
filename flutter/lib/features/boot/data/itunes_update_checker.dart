import '../domain/app_version.dart';
import '../domain/store_version_source.dart';
import '../domain/update_checker.dart';

/// 설치 버전과 스토어 최신 버전의 major/minor를 비교한다(REQ-BOOT-006).
/// 조회 예외, 빈 결과, 파싱 실패는 모두 [UpdateStatus.unavailable].
class ItunesUpdateChecker implements UpdateChecker {
  ItunesUpdateChecker({required this._source, required this._installed});

  final StoreVersionSource _source;
  final AppVersion _installed;

  @override
  Future<UpdateStatus> check() async {
    try {
      final raw = await _source.fetchLatestVersion();
      final latest = raw == null ? null : AppVersion.tryParse(raw);
      if (latest == null) return UpdateStatus.unavailable;
      return latest.requiresUpdateFrom(_installed)
          ? UpdateStatus.updateRequired
          : UpdateStatus.upToDate;
    } on Object {
      return UpdateStatus.unavailable;
    }
  }
}
