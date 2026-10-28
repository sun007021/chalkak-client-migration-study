/// 조정 눈금자 스케일(TC-EDIT-038). 단위(1.0)당 400dp, 50틱.
class RulerScale {
  const RulerScale({this.dpPerUnit = 400, this.ticks = 50, this.detentDp = 8});

  final double dpPerUnit;
  final int ticks;

  /// 기준값 근처에서 멈칫하는 범위(dp).
  final double detentDp;

  /// 값(-1~1)의 눈금자 위치(dp).
  double valueToOffset(double value) => throw UnimplementedError();

  /// 눈금자 위치(dp)의 값. [valueToOffset]과 왕복 오차가 없다.
  double offsetToValue(double offset) => throw UnimplementedError();

  /// 디텐트: [value]가 [detents](0과 자동 보정 몫) 중 하나의 [detentDp] 이내면 그 값으로 붙인다.
  double snap(double value, List<double> detents) => throw UnimplementedError();
}
