import '../../core/ui/toast/toast_controller.dart';
import '../banner/domain/banner_link_launcher.dart';
import '../banner/domain/banner_repository.dart';
import '../banner/presentation/banner_web_view_builder.dart';
import '../home/domain/home_preload.dart';
import '../home/domain/home_repository.dart';
import '../home/domain/today_post_repository.dart';
import '../home/presentation/home_screen.dart';

/// 메인(홈 탭·배너·업로드 게이트)이 쓰는 의존성 묶음. `AppDependencies.main`으로 들어간다.
/// 테스트는 Fake로 채운 묶음을 통째로 넣는다.
class MainDependencies {
  const MainDependencies({
    required this.homeRepository,
    required this.todayPostRepository,
    required this.bannerRepository,
    required this.preloadCache,
    required this.toast,
    required this.bannerWebViewBuilder,
    required this.externalLinks,
    required this.aiCardBuilder,
  });

  final HomeRepository homeRepository;
  final TodayPostRepository todayPostRepository;
  final BannerRepository bannerRepository;
  final HomePreloadCache preloadCache;
  final ToastController toast;
  final BannerWebViewBuilder bannerWebViewBuilder;
  final BannerLinkLauncher externalLinks;
  final HomeAiCardBuilder aiCardBuilder;
}
