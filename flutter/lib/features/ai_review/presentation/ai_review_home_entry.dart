import 'package:flutter/widgets.dart';

import '../../../core/time/kst_date.dart';
import '../domain/ai_review_session.dart';
import '../domain/ai_review_target.dart';
import 'ai_review_home_card.dart';

/// 홈이 오늘 승인된 내 사진을 알 때 그리는 AI 카드. 앱에 하나인 홈 세션의 대상을 이 게시물로 정하고
/// ([AiReviewSession.setTarget]은 프레임 뒤에 부른다) 카드를 그린다. [visible]은 홈 탭이 선택돼 있는지다.
class AiReviewHomeEntry extends StatefulWidget {
  const AiReviewHomeEntry({
    super.key,
    required this.session,
    required this.postId,
    required this.topicDate,
    required this.visible,
  });

  final AiReviewSession session;
  final String postId;
  final KstDate topicDate;
  final bool visible;

  @override
  State<AiReviewHomeEntry> createState() => _AiReviewHomeEntryState();
}

class _AiReviewHomeEntryState extends State<AiReviewHomeEntry> {
  @override
  void initState() {
    super.initState();
    _syncAfterFrame();
  }

  @override
  void didUpdateWidget(AiReviewHomeEntry oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.postId != widget.postId ||
        oldWidget.topicDate != widget.topicDate ||
        oldWidget.session != widget.session) {
      _syncAfterFrame();
    }
  }

  void _syncAfterFrame() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      widget.session.setTarget(
        AiReviewTarget.forPost(
          postId: widget.postId,
          isMine: true,
          topicDate: widget.topicDate,
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) =>
      AiReviewHomeCard(session: widget.session, visible: widget.visible);
}
