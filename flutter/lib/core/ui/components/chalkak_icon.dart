import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// `assets/icons/<name>.svg`(= shared/design/icons)를 그린다. 이모지·텍스트 기호로 아이콘을
/// 대신하지 않는다(docs/design/README.md §3).
/// [color]를 주면 단색 템플릿처럼 칠하고, 주지 않으면 SVG 원색을 그대로 쓴다(체크박스·하단 작성 버튼 등).
class ChalkakIcon extends StatelessWidget {
  const ChalkakIcon(
    this.name, {
    super.key,
    this.size = 24,
    this.color,
    this.semanticLabel,
  });

  final String name;
  final double size;
  final Color? color;
  final String? semanticLabel;

  /// 아이콘 파일 이름(확장자 제외). 오타를 컴파일에 가깝게 잡으려고 자주 쓰는 것을 상수로 둔다.
  static const arrowBack = 'ic_arrow_back';
  static const bell = 'ic_bell';
  static const checkboxSelected = 'ic_checkbox_selected';
  static const checkboxUnselected = 'ic_checkbox_unselected';
  static const chevronDown = 'ic_chevron_down';
  static const chevronRight = 'ic_chevron_right';
  static const chevronUp = 'ic_chevron_up';
  static const close = 'ic_close';
  static const delete = 'ic_delete';
  static const displayArrowLeft = 'ic_display_arrow_left';
  static const displayArrowRight = 'ic_display_arrow_right';
  static const edit = 'ic_edit';
  static const heart = 'ic_heart';
  static const heartFilled = 'ic_heart_filled';
  static const notification = 'ic_notification';
  static const logOut = 'ic_log_out';
  static const photoCamera = 'ic_photo_camera';
  static const photoLibrary = 'ic_photo_library';
  static const bottomWrite = 'ic_bottom_write';

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset(
      'assets/icons/$name.svg',
      width: size,
      height: size,
      semanticsLabel: semanticLabel,
      excludeFromSemantics: semanticLabel == null,
      colorFilter: color == null
          ? null
          : ColorFilter.mode(color!, BlendMode.srcIn),
    );
  }
}
