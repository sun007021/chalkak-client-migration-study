import 'package:chalkak/features/auth/domain/user_data_cleaner.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';

class _Throwing implements UserDataCleaner {
  @override
  Future<void> clearAll() async => throw StateError('cache');
}

void main() {
  test('TC-AUTH-041 모든 정리 대상을 순서대로 한 번씩 비운다', () async {
    final order = <int>[];
    final a = FakeUserDataCleaner()..onClear = () => order.add(1);
    final b = FakeUserDataCleaner()..onClear = () => order.add(2);
    await CompositeUserDataCleaner([a, b]).clearAll();
    expect(order, [1, 2]);
    expect((a.calls, b.calls), (1, 1));
  });

  test('TC-AUTH-041 하나가 실패해도 나머지는 계속 비운다', () async {
    final b = FakeUserDataCleaner();
    await CompositeUserDataCleaner([_Throwing(), b]).clearAll();
    expect(b.calls, 1);
  });
}
