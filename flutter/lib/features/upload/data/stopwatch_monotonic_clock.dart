import '../domain/monotonic_clock.dart';

/// [Stopwatch] 기반 단조 시계. 기기 시각을 바꿔도 줄어들거나 뛰지 않는다.
class StopwatchMonotonicClock implements MonotonicClock {
  StopwatchMonotonicClock() : _watch = Stopwatch()..start();

  final Stopwatch _watch;

  @override
  Duration now() => _watch.elapsed;
}
