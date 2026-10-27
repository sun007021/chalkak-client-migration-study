/// 캔버스 좌표계의 점. 단위는 논리 픽셀이다.
class SignaturePoint {
  const SignaturePoint(this.x, this.y);

  final double x;
  final double y;

  @override
  bool operator ==(Object other) =>
      other is SignaturePoint && other.x == x && other.y == y;

  @override
  int get hashCode => Object.hash(x, y);
}

/// 손가락을 대고 뗄 때까지의 점들. 점이 없으면 빈 획이다.
class SignatureStroke {
  const SignatureStroke(this.points);

  final List<SignaturePoint> points;

  bool get isEmpty => points.isEmpty;
}

/// 그리는 중인 사인의 불변 값 객체. 모든 변경 메서드는 새 객체를 돌려준다.
/// 좌표는 [width] x [height] 캔버스 안으로 보정된다(TC-SIGN-005).
class SignatureDrawing {
  const SignatureDrawing({
    required this.width,
    required this.height,
    this.strokes = const [],
  });

  final double width;
  final double height;
  final List<SignatureStroke> strokes;

  /// 점이 하나라도 있는 획이 있으면 true(점 하나도 사인이다, TC-SIGN-002~004).
  bool get hasSignature => throw UnimplementedError();

  /// 새 획을 시작한다. 좌표는 캔버스 안으로 보정한다.
  SignatureDrawing startStroke(double x, double y) =>
      throw UnimplementedError();

  /// 마지막 획에 점을 잇는다. 획이 없으면 새 획을 시작한다.
  SignatureDrawing addPoint(double x, double y) => throw UnimplementedError();

  /// 마지막 획 하나를 지운다. 획이 없으면 같은 값.
  SignatureDrawing undo() => throw UnimplementedError();

  /// 모든 획을 지운다.
  SignatureDrawing clear() => throw UnimplementedError();

  /// 캔버스 크기만 바꾼 사인(화면 회전·레이아웃 변경). 이미 그린 점은 그대로 둔다.
  SignatureDrawing withCanvas(double width, double height) =>
      throw UnimplementedError();

  /// 같은 캔버스 크기의 빈 사인.
  SignatureDrawing get empty => throw UnimplementedError();
}
