import 'package:flutter/widgets.dart';

import '../../core/network/api_client.dart';
import '../../core/post_events/post_event_bus.dart';
import '../../core/ui/toast/toast_controller.dart';
import '../banner/data/api_banner_repository.dart';
import '../banner/data/url_launcher_banner_link_launcher.dart';
import '../banner/presentation/webview_banner_builder.dart';
import '../display/data/api_display_repository.dart';
import '../feed/data/api_post_repository.dart';
import '../home/data/api_home_repository.dart';
import '../home/domain/home_preload.dart';
import '../like/data/api_like_repository.dart';
import '../like/domain/like_store.dart';
import '../record/data/api_record_repository.dart';
import '../record/data/gallery_calendar_image_saver.dart';
import '../record/data/png_calendar_image_renderer.dart';
import '../record/data/post_bus_record_events.dart';
import '../record/domain/record_data_cleaner.dart';
import 'domain/guest_flag.dart';
import 'main_dependencies.dart';

/// 실제 구현(ApiHomeRepository, ApiBannerRepository, 웹뷰·외부 링크 어댑터)으로
/// 전시·상세·좋아요 저장소를 포함해 [MainDependencies]를 조립한다. AI 카드는 AIR PR이 채울 때까지 빈 자리를 둔다.
MainDependencies buildMainDependencies(ApiClient client) {
  final home = ApiHomeRepository(client: client);
  final guestFlag = GuestFlag();
  final postEvents = PostEventBus();
  return MainDependencies(
    homeRepository: home,
    todayPostRepository: home,
    bannerRepository: ApiBannerRepository(client: client),
    preloadCache: HomePreloadCache(),
    toast: ToastController(),
    bannerWebViewBuilder: const WebViewBannerBuilder(),
    externalLinks: const UrlLauncherBannerLinkLauncher(),
    aiCardBuilder: (context, postId) => const SizedBox.shrink(),
    displayRepository: ApiDisplayRepository(client: client),
    postRepository: ApiPostRepository(client: client),
    likeStore: LikeStore(
      repository: ApiLikeRepository(client: client),
      events: postEvents,
      isGuest: () => guestFlag.value,
    ),
    postEvents: postEvents,
    guestFlag: guestFlag,
    recordRepository: ApiRecordRepository(client: client),
    recordImageRenderer: const PngCalendarImageRenderer(),
    recordImageSaver: const GalleryCalendarImageSaver(),
    recordPostEvents: PostBusRecordEvents(postEvents),
    recordCleaner: RecordDataCleaner(),
  );
}
