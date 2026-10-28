import '../../core/post_events/post_event_bus.dart';
import '../../core/ui/toast/toast_controller.dart';
import '../banner/domain/banner_link_launcher.dart';
import '../banner/domain/banner_repository.dart';
import '../banner/presentation/banner_web_view_builder.dart';
import '../display/domain/display_repository.dart';
import '../feed/domain/post_repository.dart';
import '../home/domain/home_preload.dart';
import '../home/domain/home_repository.dart';
import '../home/domain/today_post_repository.dart';
import '../home/presentation/home_screen.dart';
import '../like/domain/like_store.dart';
import 'domain/guest_flag.dart';

/// 메인(홈·전시 탭·상세·배너·업로드 게이트)이 쓰는 의존성 묶음. `AppDependencies.main`으로 들어간다.
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
    required this.displayRepository,
    required this.postRepository,
    required this.likeStore,
    required this.postEvents,
    required this.guestFlag,
  });

  final HomeRepository homeRepository;
  final TodayPostRepository todayPostRepository;
  final BannerRepository bannerRepository;
  final HomePreloadCache preloadCache;
  final ToastController toast;
  final BannerWebViewBuilder bannerWebViewBuilder;
  final BannerLinkLauncher externalLinks;
  final HomeAiCardBuilder aiCardBuilder;
  final DisplayRepository displayRepository;
  final PostRepository postRepository;

  /// 홈·전시·상세가 함께 쓰는 좋아요 저장소와 삭제·제목 변경 알림 통로(앱에 하나).
  final LikeStore likeStore;
  final PostEventBus postEvents;
  final GuestFlag guestFlag;
}
