import 'dart:async';

import '../../core/analytics/analytics_tracker.dart';
import '../banner/domain/banner_list_controller.dart';
import '../display/domain/display_models.dart';
import '../display/presentation/display_view_model.dart';
import '../home/domain/home_view_model.dart';
import '../like/domain/like_store.dart';
import 'domain/guest_guard.dart';
import 'domain/main_shell_view_model.dart';
import 'domain/upload_entry_gate.dart';
import 'main_dependencies.dart';

/// 메인 화면이 함께 쓰는 ViewModel 묶음. 조립은 여기서 하고, 화면 위젯은 만들고 [dispose]만 한다.
class MainComposition {
  MainComposition._(this.banners, this.home, this.shell);

  factory MainComposition.create({
    required MainDependencies dependencies,
    required AnalyticsTracker analytics,
    required bool isGuest,
  }) {
    dependencies.guestFlag.value = isGuest;
    final banners = BannerListController(
      repository: dependencies.bannerRepository,
    );
    final home = HomeViewModel(
      home: dependencies.homeRepository,
      todayPost: dependencies.todayPostRepository,
      banners: banners,
      isGuest: isGuest,
      toast: dependencies.toast,
      preloadCache: dependencies.preloadCache,
      likeToggler: _StoreToggler(dependencies.likeStore),
      likeStore: dependencies.likeStore,
      postEvents: dependencies.postEvents,
    );
    final shell = MainShellViewModel(
      guard: GuestGuard(isGuest: isGuest, toast: dependencies.toast),
      analytics: analytics,
      uploadGate: UploadEntryGate(todayPost: dependencies.todayPostRepository),
      toast: dependencies.toast,
    );
    return MainComposition._(banners, home, shell);
  }

  final BannerListController banners;
  final HomeViewModel home;
  final MainShellViewModel shell;

  /// 전시 탭 ViewModel을 만든다. 처음 열 때 한 번 호출하며, 소유와 정리는 부른 쪽이 한다.
  static DisplayViewModel createDisplay({
    required MainDependencies dependencies,
    DisplayTarget? target,
  }) => DisplayViewModel(
    repository: dependencies.displayRepository,
    likes: dependencies.likeStore,
    postEvents: dependencies.postEvents,
    isGuest: () => dependencies.guestFlag.value,
    initialDate: target?.date,
    initialSort: (target?.popular ?? false)
        ? DisplaySort.popular
        : DisplaySort.recent,
  );

  void dispose() {
    shell.dispose();
    home.dispose();
    banners.dispose();
  }
}

/// 홈 랭킹의 하트 탭을 공용 좋아요 저장소로 넘긴다(LIKE-005).
class _StoreToggler implements RankingLikeToggler {
  const _StoreToggler(this._likes);

  final LikeStore _likes;

  @override
  void toggle(String postId) => unawaited(_likes.toggle(postId));
}
