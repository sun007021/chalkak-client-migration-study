import '../../../core/copy/ko.g.dart';
import '../../../core/ui/toast/toast_controller.dart';

/// 게스트가 막히는 동작(D-05). 문구는 `Copy.navGuest*`.
enum GuestRestriction {
  record,
  upload,
  feed,
  like,
  notification,
  feedback;

  /// 해당 동작의 토스트 문구.
  String get message => switch (this) {
    record => Copy.navGuestRecord,
    upload => Copy.navGuestUpload,
    feed => Copy.navGuestFeed,
    like => Copy.navGuestLike,
    notification => Copy.navGuestNotification,
    feedback => Copy.navGuestFeedback,
  };
}

/// 게스트 제한 판정. 게스트면 [GuestRestriction.message] 토스트를 띄우고 true를 돌려준다.
/// 네트워크는 부르지 않는다(REQ-NAV-019).
class GuestGuard {
  GuestGuard({required this._isGuest, required this._toast});

  final bool _isGuest;
  final ToastSink _toast;

  bool get isGuest => _isGuest;

  /// true면 막혔으니 호출한 쪽은 동작을 중단한다.
  bool blocks(GuestRestriction restriction) {
    if (!_isGuest) return false;
    _toast.show(restriction.message);
    return true;
  }
}
