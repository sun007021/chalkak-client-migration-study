import '../../../core/time/kst_clock.dart';
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

  /// 오늘 주제 응답. 받지 못했거나 404면 [topic]=null이고 [topicFound]=false라 홈이 직접 요청한다.
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
  HomeSnapshot? _snapshot;
  int _generation = 0;

  /// [clearAll]마다 올라간다. 프리로드는 시작할 때 값을 기억해 두었다가 [store]에 넘겨,
  /// 그 사이 지워졌으면 결과를 버리게 한다.
  int get generation => _generation;

  /// 날짜·게스트 여부가 같을 때만 꺼내고 비운다. 맞지 않으면 보관한 채 null.
  HomeSnapshot? take({required bool guest, required KstDate today}) {
    final snapshot = _snapshot;
    if (snapshot == null ||
        snapshot.guest != guest ||
        snapshot.today != today) {
      return null;
    }
    _snapshot = null;
    return snapshot;
  }

  /// [ifGeneration]을 주면 그 사이 [clearAll]이 있었을 때 저장하지 않는다.
  void store(HomeSnapshot snapshot, {int? ifGeneration}) {
    if (ifGeneration != null && ifGeneration != _generation) return;
    _snapshot = snapshot;
  }

  @override
  Future<void> clearAll() async {
    _generation++;
    _snapshot = null;
  }
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
    this._kstClock = const KstClock(),
  });

  final HomeRepository _home;
  final TodayPostRepository _today;
  final BannerRepository _banners;
  final HomePreloadCache _cache;
  final KstClock _kstClock;

  @override
  Future<void> preload({required bool guest}) async {
    final generation = _cache.generation;
    final today = _kstClock.today();

    final topic = _Attempt.of(() => _home.topicOn(today));
    final banners = _Attempt.of(() => _banners.fetchPage(1));
    final hero = guest ? null : _Attempt.of(() => _today.today());
    final topicResult = await topic;
    final topicValue = topicResult.value;
    final popular = topicValue == null
        ? null
        : await _Attempt.of(() => _home.popularPosts(topicValue.topicDate));
    final bannerResult = await banners;
    final heroResult = await hero;

    final results = [topicResult, popular, bannerResult, heroResult];
    final attempted = results.whereType<_Attempt<Object?>>().toList();
    if (attempted.every((attempt) => attempt.failed)) {
      throw attempted.first.error!;
    }
    _cache.store(
      HomeSnapshot(
        today: today,
        guest: guest,
        topic: topicValue,
        topicFound: topicValue != null,
        popular: popular?.value,
        banners: bannerResult.value,
        hero: heroResult?.value,
      ),
      ifGeneration: generation,
    );
  }
}

/// 한 섹션의 성공 값 또는 실패. 한 섹션이 던져도 나머지는 계속 받는다.
class _Attempt<T> {
  const _Attempt._({this.value, this.error});

  static Future<_Attempt<T>> of<T>(Future<T> Function() request) async {
    try {
      return _Attempt._(value: await request());
    } on Object catch (error) {
      return _Attempt._(error: error);
    }
  }

  final T? value;
  final Object? error;

  bool get failed => error != null;
}
