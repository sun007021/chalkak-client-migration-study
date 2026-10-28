import '../../core/analytics/analytics_tracker.dart';
import '../banner/domain/banner_list_controller.dart';
import '../home/domain/home_view_model.dart';
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

  void dispose() {
    shell.dispose();
    home.dispose();
    banners.dispose();
  }
}
