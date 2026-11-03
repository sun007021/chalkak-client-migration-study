import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/settings/presentation/settings_signature_card.dart';
import 'package:chalkak/features/settings/presentation/settings_test_ids.dart';
import 'package:chalkak/features/signature/presentation/signature_card_view_model.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId, widgetTest;
import '../../../support/net_harness.dart' show sessionAt;
import '../../../support/onboarding_fakes.dart';

void main() {
  widgetTest('TC-SIGN-041 사인 이미지 URL 로드가 실패하면 플레이스홀더를 보이고 카드는 깨지지 않는다', (
    tester,
  ) async {
    final h = OnboardingHarness(session: sessionAt());
    h.onGetSignature(['signature/users-me-signature__get-success.json']);
    final vm = SignatureCardViewModel(
      repository: h.signatureRepository,
      isGuest: false,
    );
    addTearDown(vm.dispose);
    var changed = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SettingsSignatureCard(viewModel: vm, onChange: () => changed++),
        ),
      ),
    );
    unawaited(vm.load());
    // 위젯 테스트의 네트워크 이미지는 실패한다(errorBuilder 경로).
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    expect(vm.state.imageUrl, isNotNull);
    expect(tester.takeException(), isNull);
    expect(byId(SettingsTestIds.signatureCard), findsOneWidget);
    expect(byId(SettingsTestIds.signatureImage), findsOneWidget);
    expect(
      find.descendant(
        of: byId(SettingsTestIds.signatureImage),
        matching: find.byIcon(Icons.image_not_supported_outlined),
      ),
      findsOneWidget,
      reason: '실패한 이미지 자리에 플레이스홀더',
    );
    expect(find.text(Copy.signCardTitle), findsOneWidget);
    await tester.tap(byId(SettingsTestIds.signatureChangeButton));
    expect(changed, 1);
  });
}
