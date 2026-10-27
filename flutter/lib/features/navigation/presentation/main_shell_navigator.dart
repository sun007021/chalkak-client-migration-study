import '../../../core/time/kst_date.dart';
import '../../banner/domain/banner_models.dart';
import '../../home/domain/home_models.dart';

/// 메인 셸이 다른 화면으로 가야 할 때 부르는 창구. 실제 구현은 라우터가 맡고,
/// 테스트는 호출을 기록하는 Fake를 쓴다.
/// 반환 Future는 그 화면이 닫힐 때 완료된다. 셸은 완료 전의 같은 이동 요청(연타)을 무시한다
/// (REQ-NAV-032).
abstract interface class MainShellNavigator {
  /// 알림함. 닫히면 홈이 미읽음 점을 다시 조회한다(D-10).
  Future<void> openNotifications();

  /// 게시물 상세(피드). [seed]의 이미지·좋아요 값을 먼저 보여 준다.
  Future<void> openFeed(PostSummary seed);

  /// 업로드 화면(다음 PR). [topicDate]를 고정한다.
  Future<void> openUpload(KstDate topicDate);

  /// 배너 웹 화면.
  Future<void> openBanner(BannerItem item);

  /// 로그인 화면으로(스택 교체).
  void goToLogin();
}
