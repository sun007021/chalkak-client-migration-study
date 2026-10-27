import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../domain/legal_document.dart';

enum LegalDocumentStatus {
  /// 앱 안 웹뷰가 로딩 중.
  loading,

  /// 로드 완료.
  ready,

  /// 로드 실패 -> `onb.terms.doc.error` + "다시 시도".
  loadFailed,

  /// 열 수 없는 URL이거나 외부 브라우저 열기 실패 -> `onb.terms.doc.cannot-open`.
  cannotOpen,
}

class LegalDocumentState {
  const LegalDocumentState({
    required this.status,
    this.url,
    this.reloadCount = 0,
  });

  final LegalDocumentStatus status;

  /// 앱 안 웹뷰로 열 URL. inApp 판정일 때만 있다.
  final Uri? url;

  /// "다시 시도" 횟수. 웹뷰를 새로 불러오는 신호다.
  final int reloadCount;
}

sealed class LegalDocumentEvent {
  const LegalDocumentEvent();
}

/// 시트를 닫는다(닫기 버튼, 또는 외부 브라우저로 넘긴 뒤).
final class CloseLegalDocument extends LegalDocumentEvent {
  const CloseLegalDocument();
}

/// 약관 문서 시트 상태(REQ-ONB-007~009, 011, TC-ONB-010~013).
/// - [start]: [LegalLinkPolicy.decide]로 판정. inApp이면 loading + url. external이면
///   [ExternalLinkLauncher.open]을 부르고 true면 [CloseLegalDocument], false면 cannotOpen.
///   rejected이면 launcher를 부르지 않고 cannotOpen.
/// - [onWebLoaded]: loading -> ready. [onWebError]: loading·ready -> loadFailed.
/// - [retry]: loadFailed -> loading, reloadCount + 1.
/// - [start]는 한 번만 동작한다(시트가 열릴 때 다시 불러도 안전).
/// - [onShown]: `screen_view`(문서별 terms_of_service / privacy_policy)를 인스턴스당 한 번만 보낸다.
class LegalDocumentViewModel extends ChangeNotifier {
  LegalDocumentViewModel({
    required this._document,
    String? url,
    required this._launcher,
    required this._analytics,
  }) : _url = url ?? _document.url;

  final LegalDocument _document;
  final String _url;
  final ExternalLinkLauncher _launcher;
  final AnalyticsTracker _analytics;
  final StreamController<LegalDocumentEvent> _events =
      StreamController<LegalDocumentEvent>.broadcast();

  LegalDocumentState _state = const LegalDocumentState(
    status: LegalDocumentStatus.loading,
  );
  bool _shown = false;
  bool _started = false;
  bool _disposed = false;

  LegalDocument get document => _document;
  LegalDocumentState get state => _state;
  Stream<LegalDocumentEvent> get events => _events.stream;

  void onShown() {
    if (_shown) return;
    _shown = true;
    _analytics.logEvent(AnalyticsEvent.screenView(_document.screenName));
  }

  Future<void> start() async {
    if (_started) return;
    _started = true;
    switch (LegalLinkPolicy.decide(_url)) {
      case LegalLinkTarget.inApp:
        _setState(
          LegalDocumentState(
            status: LegalDocumentStatus.loading,
            url: Uri.parse(_url.trim()),
          ),
        );
      case LegalLinkTarget.external:
        final opened = await _launcher.open(Uri.parse(_url.trim()));
        if (opened) {
          _emit(const CloseLegalDocument());
        } else {
          _setState(
            const LegalDocumentState(status: LegalDocumentStatus.cannotOpen),
          );
        }
      case LegalLinkTarget.rejected:
        _setState(
          const LegalDocumentState(status: LegalDocumentStatus.cannotOpen),
        );
    }
  }

  void onWebLoaded() {
    if (_state.status == LegalDocumentStatus.loading) {
      _replaceStatus(LegalDocumentStatus.ready);
    }
  }

  /// 로딩 중이든 로드된 뒤(문서 안 이동)든 실패하면 오류 화면으로 바꾼다.
  void onWebError() {
    if (_state.url == null || _state.status == LegalDocumentStatus.cannotOpen) {
      return;
    }
    _replaceStatus(LegalDocumentStatus.loadFailed);
  }

  void retry() {
    if (_state.status != LegalDocumentStatus.loadFailed) return;
    _setState(
      LegalDocumentState(
        status: LegalDocumentStatus.loading,
        url: _state.url,
        reloadCount: _state.reloadCount + 1,
      ),
    );
  }

  void onClosePressed() => _emit(const CloseLegalDocument());

  void _replaceStatus(LegalDocumentStatus status) => _setState(
    LegalDocumentState(
      status: status,
      url: _state.url,
      reloadCount: _state.reloadCount,
    ),
  );

  void _emit(LegalDocumentEvent event) {
    if (!_disposed) _events.add(event);
  }

  void _setState(LegalDocumentState next) {
    if (_disposed) return;
    _state = next;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _events.close();
    super.dispose();
  }
}
