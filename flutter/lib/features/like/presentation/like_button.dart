import 'package:flutter/widgets.dart';

/// 하트 버튼과 좋아요 수. 전시 그리드·피드·홈 랭킹이 같이 쓴다.
///
/// - [buttonId]를 단 버튼은 enabled·selected(= [isLiked])를 접근성 속성으로 노출한다.
/// - [countId]를 단 별도 요소에 [likeCount]를 숫자 문자열 그대로 그린다.
/// - [enabled]가 false이면 눌러도 [onPressed]를 부르지 않는다.
class LikeButton extends StatelessWidget {
  const LikeButton({
    super.key,
    required this.buttonId,
    required this.countId,
    required this.isLiked,
    required this.likeCount,
    required this.onPressed,
    this.enabled = true,
  });

  final String buttonId;
  final String countId;
  final bool isLiked;
  final int likeCount;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
