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
/// - [onWebLoaded]: loading -> ready. [onWebError]: loading -> loadFailed.
/// - [retry]: loadFailed -> loading, reloadCount + 1.
/// - [onShown]: `screen_view`(문서별 terms_of_service / privacy_policy)를 인스턴스당 한 번만 보낸다.
class LegalDocumentViewModel extends ChangeNotifier {
  LegalDocumentViewModel({
    required LegalDocument document,
    String? url,
    required ExternalLinkLauncher launcher,
    required AnalyticsTracker analytics,
  });

  LegalDocument get document => throw UnimplementedError();
  LegalDocumentState get state => throw UnimplementedError();
  Stream<LegalDocumentEvent> get events => throw UnimplementedError();

  void onShown() => throw UnimplementedError();
  Future<void> start() => throw UnimplementedError();
  void onWebLoaded() => throw UnimplementedError();
  void onWebError() => throw UnimplementedError();
  void retry() => throw UnimplementedError();
  void onClosePressed() => throw UnimplementedError();
}
