/// 단조 시계. 업로드 URL 만료 판정에만 쓴다. 기기 벽시계를 바꿔도 영향이 없다(TC-UPL-051).
abstract interface class MonotonicClock {
  /// 임의 기준점 이후 지난 시간. 줄어들지 않는다.
  Duration now();
}
