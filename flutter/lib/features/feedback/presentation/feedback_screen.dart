import 'package:flutter/material.dart';

import 'feedback_view_model.dart';

/// 피드백 화면(REQ-FDBK-002, 003, 006). testids: `feedback.root`, `feedback.close-button`(누르면 [onClose]),
/// `feedback.guide-text`(`Copy.fdbkIntroTitle` + `fdbkIntroBody`), `feedback.input`(여러 줄 입력,
/// 플레이스홀더 `Copy.fdbkFieldPlaceholder`, 라벨 `fdbkFieldLabel`), `feedback.counter`("현재 수/1000" 형태,
/// 현재 수는 trim 후 code point 수), `feedback.submit-button`(`Copy.fdbkSend`, 활성 여부는 `state.canSend`,
/// 전송 중에는 `Copy.fdbkSending` + 비활성), `feedback.validation-message`·`feedback.error-message`
/// (해당 문구가 있을 때만 트리에 존재).
/// 시작 시 `onShown`을 부르고 [CloseFeedback] 이벤트를 받으면 [onClose]를 부른다. 키보드가 올라와도
/// 입력창과 보내기 버튼이 가려지지 않게 스크롤한다. 입력은 `viewModel.onTextChanged`로 넘긴다.
class FeedbackScreen extends StatefulWidget {
  const FeedbackScreen({
    super.key,
    required this.viewModel,
    required this.onClose,
  });

  final FeedbackViewModel viewModel;
  final VoidCallback onClose;

  @override
  State<FeedbackScreen> createState() => _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
