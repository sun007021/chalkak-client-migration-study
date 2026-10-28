import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/time/kst_date.dart';
import '../../home/domain/home_models.dart';
import '../domain/korean_particle.dart';

sealed class UploadSuccessEvent {
  const UploadSuccessEvent();
}

/// "확인했어요." -> 전시 탭의 [date]로 이동하고 업로드 화면으로 돌아오지 않는다(REQ-UPL-062, 064).
final class OpenDisplayOn extends UploadSuccessEvent {
  const OpenDisplayOn(this.date);

  final KstDate date;
}

/// 업로드 성공 화면 상태(REQ-UPL-060~062). 홈·기록·전시 캐시 갱신은 화면 이탈 쪽 몫이다(REQ-UPL-063).
/// [onShown]은 `screen_view photo_upload_success`를 인스턴스당 한 번만 보낸다.
class UploadSuccessViewModel extends ChangeNotifier {
  UploadSuccessViewModel({
    required this.topicTitle,
    required this.topicDate,
    required this.moderationStatus,
    required this.analytics,
  });

  final String topicTitle;
  final KstDate topicDate;
  final ModerationStatus moderationStatus;
  final AnalyticsTracker analytics;

  /// "‘{주제}’을/를 기록했어요." (조사는 받침으로 고른다).
  String get message => UploadSuccessText.title(topicTitle);

  /// PENDING / VALIDATING에 따른 상태 안내.
  String get statusMessage => UploadSuccessText.status(moderationStatus);

  final StreamController<UploadSuccessEvent> _events =
      StreamController<UploadSuccessEvent>.broadcast();
  bool _shown = false;
  bool _disposed = false;

  Stream<UploadSuccessEvent> get events => _events.stream;

  void onShown() {
    if (_shown) return;
    _shown = true;
    analytics.logEvent(
      AnalyticsEvent.screenView(ScreenNames.photoUploadSuccess),
    );
  }

  void onConfirmPressed() {
    if (_disposed) return;
    _events.add(OpenDisplayOn(topicDate));
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_events.close());
    super.dispose();
  }
}
