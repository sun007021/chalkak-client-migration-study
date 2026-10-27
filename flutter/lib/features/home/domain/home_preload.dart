// ignore_for_file: unused_field
import '../../../core/time/kst_date.dart';
import '../../auth/domain/user_data_cleaner.dart';
import '../../banner/domain/banner_models.dart';
import '../../banner/domain/banner_repository.dart';
import '../../boot/domain/home_preloader.dart';
import 'home_models.dart';
import 'home_repository.dart';
import 'today_post_repository.dart';

/// 프리로드가 받아 둔 섹션 결과. 못 받은 섹션은 null이고 홈이 직접 요청한다.
class HomeSnapshot {
  const HomeSnapshot({
    required this.today,
    required this.guest,
    this.topic,
    this.topicFound = false,
    this.popular,
    this.banners,
    this.hero,
  });

  final KstDate today;
  final bool guest;

  /// 오늘 주제 응답. 404면 [topicFound]=false이고 [topic]=null.
  final Topic? topic;
  final bool topicFound;
  final List<PostSummary>? popular;
  final BannerPage? banners;

  /// 로그인 상태일 때만.
  final TodayPost? hero;
}

/// 프리로드 결과 보관소. 한 번 꺼내면 비워지고(재사용 금지), 날짜·게스트 여부가 다르면
/// 꺼내지 못한다. 로그아웃·재인증 때 [clearAll]로 지우며, 지운 뒤 늦게 도착한
/// [store]는 버린다(TC-HOME-044).
class HomePreloadCache implements UserDataCleaner {
  HomeSnapshot? take({required bool guest, required KstDate today}) =>
      throw UnimplementedError();

  void store(HomeSnapshot snapshot) => throw UnimplementedError();

  @override
  Future<void> clearAll() => throw UnimplementedError();
}

/// 스플래시 동안 홈 첫 화면 데이터를 미리 읽어 [HomePreloadCache]에 둔다(REQ-BOOT-003).
/// 게스트는 오늘 주제·오늘 인기·배너만(인증 호출 0건), 로그인 상태는 `/posts/today`도.
/// 일부가 실패해도 성공한 섹션은 캐시에 두며, 전부 실패하면 던진다(부트가 즉시 해제한다).
class ApiHomePreloader implements HomePreloader {
  ApiHomePreloader({
    required this._home,
    required this._today,
    required this._banners,
    required this._cache,
  });

  final HomeRepository _home;
  final TodayPostRepository _today;
  final BannerRepository _banners;
  final HomePreloadCache _cache;

  @override
  Future<void> preload({required bool guest}) => throw UnimplementedError();
}
