import 'dart:io';

import 'package:chalkak/core/constants/app_constants.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TC-TIME-029 lib/에서 시스템 시계를 직접 부르지 않는다', () {
    // 허용 목록: 없음. 시각은 package:clock의 clock.now()만 쓴다.
    final pattern = RegExp(r'DateTime\.now\(\)|DateTime\.timestamp\(\)');
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      final lines = f.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].trimLeft().startsWith('//')) continue;
        if (pattern.hasMatch(lines[i])) offenders.add('${f.path}:${i + 1}');
      }
    }
    expect(offenders, isEmpty);
  });

  test('TC-TIME-030 상수 시간들은 가상 시간 전진만으로 끝난다', () {
    final sw = Stopwatch()..start();
    fakeAsync((async) {
      final done = <String>[];
      final waits = {
        'splash': AppConstants.splashPreloadMax,
        'toast': AppConstants.toastDuration,
        'poll': AppConstants.aiReviewPollInterval,
        'window': AppConstants.aiReviewPollWindow,
        'signup': AppConstants.signupPendingRetryInterval,
        'upload': AppConstants.uploadUrlSafetyMargin,
      };
      waits.forEach((name, d) {
        Future<void>.delayed(d).then((_) => done.add(name));
      });
      async.elapse(AppConstants.aiReviewPollWindow);
      expect(done.toSet(), waits.keys.toSet());
    });
    expect(sw.elapsed, lessThan(const Duration(seconds: 1)));
  });
}
