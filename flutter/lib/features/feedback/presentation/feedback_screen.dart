import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';
import 'feedback_test_ids.dart';

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
  final TextEditingController _controller = TextEditingController();
  StreamSubscription<FeedbackEvent>? _events;

  @override
  void initState() {
    super.initState();
    _events = widget.viewModel.events.listen((event) {
      switch (event) {
        case CloseFeedback():
          widget.onClose();
      }
    });
    widget.viewModel.onShown();
  }

  @override
  void dispose() {
    unawaited(_events?.cancel());
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = widget.viewModel;
    return TestId(
      FeedbackTestIds.root,
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          leading: TestId.button(
            FeedbackTestIds.closeButton,
            child: IconButton(
              icon: const Icon(Icons.close),
              tooltip: Copy.commonClose,
              onPressed: widget.onClose,
            ),
          ),
          title: const Text(Copy.fdbkTitle),
        ),
        body: SafeArea(
          child: ListenableBuilder(
            listenable: viewModel,
            builder: (context, _) => _body(context, viewModel.state),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, FeedbackState state) {
    final theme = Theme.of(context);
    final overLimit = state.count > AppConstants.feedbackMax;
    final errorStyle = theme.textTheme.bodySmall?.copyWith(
      color: theme.colorScheme.error,
    );
    // 키보드가 올라오면 Scaffold가 본문 높이를 줄이므로 스크롤로 입력창과 버튼을 보인다.
    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TestId(
            FeedbackTestIds.guideText,
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: Copy.fdbkIntroTitle,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const TextSpan(text: '\n\n'),
                  TextSpan(
                    text: Copy.fdbkIntroBody,
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          TestId(
            FeedbackTestIds.input,
            child: TextField(
              controller: _controller,
              readOnly: state.sending,
              minLines: 6,
              maxLines: 10,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              decoration: const InputDecoration(
                labelText: Copy.fdbkFieldLabel,
                hintText: Copy.fdbkFieldPlaceholder,
                floatingLabelBehavior: FloatingLabelBehavior.always,
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
              onChanged: widget.viewModel.onTextChanged,
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: TestId(
              FeedbackTestIds.counter,
              child: Text(
                '${state.count}/${AppConstants.feedbackMax}',
                style: overLimit ? errorStyle : theme.textTheme.bodySmall,
              ),
            ),
          ),
          if (state.validationMessage case final message?)
            TestId(
              FeedbackTestIds.validationMessage,
              child: Text(message, style: errorStyle),
            ),
          if (state.errorMessage case final message?)
            TestId(
              FeedbackTestIds.errorMessage,
              child: Text(message, style: errorStyle),
            ),
          const SizedBox(height: 16),
          TestId.button(
            FeedbackTestIds.submitButton,
            child: FilledButton(
              onPressed: state.canSend
                  ? () => unawaited(widget.viewModel.send())
                  : null,
              child: Text(state.sending ? Copy.fdbkSending : Copy.fdbkSend),
            ),
          ),
        ],
      ),
    );
  }
}
