import 'package:chalkak/features/signature/domain/signature_renderer.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/onboarding_fakes.dart';

void main() {
  test('TC-SIGN-014 정확히 1,048,576바이트는 허용한다', () {
    expect(SignatureImageGuard.isWithinLimit(fakePng(1048576)), isTrue);
  });

  test('TC-SIGN-015 1,048,577바이트는 허용하지 않는다', () {
    expect(SignatureImageGuard.isWithinLimit(fakePng(1048577)), isFalse);
  });

  test('TC-SIGN-014 1 MiB 바로 아래와 작은 PNG는 허용한다', () {
    expect(SignatureImageGuard.isWithinLimit(fakePng(1048575)), isTrue);
    expect(SignatureImageGuard.isWithinLimit(tinyPng), isTrue);
  });
}
