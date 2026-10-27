import 'package:chalkak/features/onboarding/domain/legal_document.dart';
import 'package:chalkak/features/onboarding/presentation/legal_document_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';
import '../../../support/onboarding_fakes.dart';

class _Rig {
  _Rig({String? url, LegalDocument doc = LegalDocument.service}) {
    vm = LegalDocumentViewModel(
      document: doc,
      url: url,
      launcher: launcher,
      analytics: analytics,
    );
    vm.events.listen(events.add);
  }

  final FakeExternalLinkLauncher launcher = FakeExternalLinkLauncher();
  final FakeAnalyticsTracker analytics = FakeAnalyticsTracker();
  final List<LegalDocumentEvent> events = [];
  late final LegalDocumentViewModel vm;
  LegalDocumentState get s => vm.state;
  Future<void> flush() => Future<void>.delayed(Duration.zero);
}

void main() {
  test('TC-ONB-010 허용 URL은 앱 안 웹뷰로 열고 loading으로 시작한다', () async {
    final r = _Rig();
    await r.vm.start();
    expect(r.s.status, LegalDocumentStatus.loading);
    expect(r.s.url.toString(), LegalDocument.service.url);
    expect(r.launcher.opened, isEmpty);
  });

  test(
    'TC-ONB-012 로드 완료면 ready, 실패면 loadFailed, 다시 시도하면 loading과 reloadCount+1',
    () async {
      final r = _Rig();
      await r.vm.start();
      r.vm.onWebLoaded();
      expect(r.s.status, LegalDocumentStatus.ready);
      final f = _Rig();
      await f.vm.start();
      f.vm.onWebError();
      expect(f.s.status, LegalDocumentStatus.loadFailed);
      f.vm.retry();
      expect(f.s.status, LegalDocumentStatus.loading);
      expect(f.s.reloadCount, 1);
    },
  );

  test('TC-ONB-011 허용되지 않은 http/https URL은 외부 브라우저로 넘기고 시트를 닫는다', () async {
    final r = _Rig(url: 'https://example.com/terms');
    await r.vm.start();
    await r.flush();
    expect(r.launcher.opened.single.toString(), 'https://example.com/terms');
    expect(r.events.single, isA<CloseLegalDocument>());
  });

  test('TC-ONB-013 외부 브라우저로 열 수 없으면 cannotOpen이다', () async {
    final r = _Rig(url: 'https://example.com/terms');
    r.launcher.result = false;
    await r.vm.start();
    expect(r.s.status, LegalDocumentStatus.cannotOpen);
    expect(r.events, isEmpty);
  });

  test(
    'TC-ONB-011 TC-ONB-013 거부되는 URL은 launcher를 부르지 않고 cannotOpen이다',
    () async {
      for (final url in [
        '',
        'javascript:alert(1)',
        'https://u:p@notion.so/x',
      ]) {
        final r = _Rig(url: url);
        await r.vm.start();
        expect(r.s.status, LegalDocumentStatus.cannotOpen, reason: url);
        expect(r.launcher.opened, isEmpty, reason: url);
      }
    },
  );

  test('TC-ONB-014 닫기 버튼은 닫기 이벤트를 낸다', () async {
    final r = _Rig();
    await r.vm.start();
    r.vm.onClosePressed();
    await r.flush();
    expect(r.events.single, isA<CloseLegalDocument>());
  });

  test('REQ-ONB-011 문서별 screen_view를 한 번만 보낸다', () {
    final s = _Rig()..vm.onShown();
    s.vm.onShown();
    expect(s.analytics.screenNames, ['terms_of_service']);
    final p = _Rig(doc: LegalDocument.privacy)..vm.onShown();
    expect(p.analytics.screenNames, ['privacy_policy']);
  });
}
