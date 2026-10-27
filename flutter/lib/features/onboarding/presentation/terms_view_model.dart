import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/analytics/analytics_tracker.dart';
import '../domain/legal_document.dart';
import '../domain/sign_up_context.dart';

class TermsState {
  const TermsState({this.agreedService = false, this.agreedPrivacy = false});

  final bool agreedService;
  final bool agreedPrivacy;

  /// 두 필수 항목이 모두 켜져 있을 때만 true("전체 동의" 표시, REQ-ONB-004).
  bool get agreedAll => throw UnimplementedError();

  /// 두 필수 항목에 모두 동의해야 "다음"이 활성이다(REQ-ONB-005).
  bool get canProceed => throw UnimplementedError();
}

sealed class TermsEvent {
  const TermsEvent();
}

/// "다음": 사인 그리기(가입 2단계)로 이동.
final class NavigateToSignature extends TermsEvent {
  const NavigateToSignature();
}

/// 뒤로 가기: 로그인 화면으로 돌아간다. 이미 컨텍스트와 선택은 폐기됐다.
final class ReturnToLogin extends TermsEvent {
  const ReturnToLogin();
}

/// "보기": 해당 문서 시트를 연다.
final class OpenLegalDocument extends TermsEvent {
  const OpenLegalDocument(this.document);
  final LegalDocument document;
}

/// 약관 동의 화면 상태(REQ-ONB-002~007, 010, TC-ONB-002~007, 015~017).
/// - 처음에는 모두 꺼짐. 동의 사실은 저장·전송하지 않고 이 객체 안에만 있다.
/// - [toggleAll]: 전체 동의가 아니면 두 항목을 모두 켜고, 이미 전체 동의면 모두 끈다.
/// - [toggleService]/[togglePrivacy]: 해당 항목만 토글(전체 동의 표시는 파생).
/// - [onNextPressed]: [TermsState.canProceed]일 때만 [NavigateToSignature]를 낸다.
/// - [onBackPressed]: 선택을 초기화하고 [SignUpContext.discard] 후 [ReturnToLogin].
/// - [openDocument]: 상태를 바꾸지 않고 [OpenLegalDocument]를 낸다(시트를 닫은 뒤에도 체크 유지, TC-ONB-014).
/// - [onShown]: `screen_view(terms)`를 인스턴스당 한 번만 보낸다.
class TermsViewModel extends ChangeNotifier {
  TermsViewModel({
    required SignUpContext context,
    required AnalyticsTracker analytics,
  });

  TermsState get state => throw UnimplementedError();
  Stream<TermsEvent> get events => throw UnimplementedError();

  void onShown() => throw UnimplementedError();
  void toggleAll() => throw UnimplementedError();
  void toggleService() => throw UnimplementedError();
  void togglePrivacy() => throw UnimplementedError();
  void openDocument(LegalDocument document) => throw UnimplementedError();
  void onNextPressed() => throw UnimplementedError();
  void onBackPressed() => throw UnimplementedError();
}
