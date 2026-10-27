import 'package:chalkak/features/onboarding/domain/legal_document.dart';
import 'package:chalkak/features/onboarding/domain/sign_up_context.dart';
import 'package:chalkak/features/onboarding/presentation/terms_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';
import '../../../support/onboarding_fakes.dart';

class _Rig {
  _Rig() {
    context.begin(kakaoCredentials);
    vm = TermsViewModel(context: context, analytics: analytics);
    vm.events.listen(events.add);
  }

  final SignUpContext context = SignUpContext();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final List<TermsEvent> events = [];
  late final TermsViewModel vm;
  TermsState get s => vm.state;

  Future<void> flush() => Future<void>.delayed(Duration.zero);
}

void main() {
  test('TC-ONB-002 처음에는 모두 꺼져 있고 다음은 비활성이다', () {
    final r = _Rig();
    expect(r.s.agreedService, isFalse);
    expect(r.s.agreedPrivacy, isFalse);
    expect(r.s.agreedAll, isFalse);
    expect(r.s.canProceed, isFalse);
  });

  test('TC-ONB-003 전체 동의를 켜면 두 필수 항목이 모두 선택된다', () {
    final r = _Rig()..vm.toggleAll();
    expect(r.s.agreedService && r.s.agreedPrivacy, isTrue);
    expect(r.s.agreedAll, isTrue);
    expect(r.s.canProceed, isTrue);
  });

  test('TC-ONB-004 전체 동의 상태에서 다시 탭하면 모두 해제된다', () {
    final r = _Rig()
      ..vm.toggleAll()
      ..vm.toggleAll();
    expect(r.s.agreedService || r.s.agreedPrivacy, isFalse);
    expect(r.s.canProceed, isFalse);
  });

  test('TC-ONB-005 필수 항목 하나만 선택하면 전체 동의는 해제이고 다음은 비활성이다', () {
    final r = _Rig()..vm.toggleService();
    expect(r.s.agreedAll, isFalse);
    expect(r.s.canProceed, isFalse);
    final p = _Rig()..vm.togglePrivacy();
    expect(p.s.agreedAll, isFalse);
    expect(p.s.canProceed, isFalse);
  });

  test('TC-ONB-005 하나만 선택된 상태에서 전체 동의를 탭하면 모두 선택된다', () {
    final r = _Rig()
      ..vm.toggleService()
      ..vm.toggleAll();
    expect(r.s.agreedAll, isTrue);
  });

  test('TC-ONB-006 두 항목을 개별로 선택하면 전체 동의가 자동 선택되고 다음이 활성이다', () {
    final r = _Rig()
      ..vm.toggleService()
      ..vm.togglePrivacy();
    expect(r.s.agreedAll, isTrue);
    expect(r.s.canProceed, isTrue);
  });

  test('TC-ONB-007 둘 다 선택 후 하나를 해제하면 전체 동의가 해제되고 다음이 비활성이다', () {
    final r = _Rig()
      ..vm.toggleAll()
      ..vm.togglePrivacy();
    expect(r.s.agreedAll, isFalse);
    expect(r.s.agreedService, isTrue);
    expect(r.s.canProceed, isFalse);
  });

  test('TC-ONB-015 두 항목 동의 후 다음을 누르면 사인 그리기로 이동한다', () async {
    final r = _Rig()..vm.toggleAll();
    r.vm.onNextPressed();
    await r.flush();
    expect(r.events.single, isA<NavigateToSignature>());
    expect(r.context.current, isNotNull);
  });

  test('TC-ONB-002 동의 전에는 다음을 눌러도 이동하지 않는다', () async {
    final r = _Rig()..vm.toggleService();
    r.vm.onNextPressed();
    await r.flush();
    expect(r.events, isEmpty);
  });

  test('TC-ONB-014 보기는 상태를 바꾸지 않고 문서 열기 이벤트를 낸다', () async {
    final r = _Rig()..vm.toggleAll();
    r.vm.openDocument(LegalDocument.privacy);
    await r.flush();
    expect(
      (r.events.single as OpenLegalDocument).document,
      LegalDocument.privacy,
    );
    expect(r.s.agreedAll, isTrue);
  });

  test('TC-ONB-017 뒤로 가면 선택과 idToken·rawNonce를 폐기하고 로그인으로 돌아간다', () async {
    final r = _Rig()..vm.toggleAll();
    r.vm.onBackPressed();
    await r.flush();
    expect(r.events.single, isA<ReturnToLogin>());
    expect(r.context.current, isNull);
    expect(r.s.agreedAll, isFalse);
  });

  test('TC-ONB-016 TC-ONB-006 새 ViewModel(앱 재시작·재진입)은 동의 상태가 초기화돼 있다', () {
    final first = _Rig()..vm.toggleAll();
    expect(first.s.canProceed, isTrue);
    expect(_Rig().s.canProceed, isFalse);
  });

  test('TC-ONB-049 화면이 보이면 screen_view(terms)를 한 번만 보낸다', () {
    final r = _Rig();
    r.vm.onShown();
    r.vm.onShown();
    expect(r.analytics.screenNames, ['terms']);
  });
}
