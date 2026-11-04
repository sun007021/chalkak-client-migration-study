import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/components/chalkak_button.dart';
import '../../../core/ui/components/chalkak_nav_button.dart';
import '../../../core/ui/components/chalkak_text_field.dart';
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
    final tokens = context.tokens;
    return TestId(
      FeedbackTestIds.root,
      child: Scaffold(
        backgroundColor: tokens.colors.background,
        body: SafeArea(
          child: ListenableBuilder(
            listenable: viewModel,
            builder: (context, _) => Column(
              children: [
                // 상단 바(FeedbackTopBar): 닫기 + 가운데 제목 headline, 오른쪽 균형 빈칸.
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 10, 12, 8),
                  child: Row(
                    children: [
                      TestId.button(
                        FeedbackTestIds.closeButton,
                        child: ChalkakNavButton.close(
                          onPressed: widget.onClose,
                        ),
                      ),
                      Expanded(
                        child: Text(
                          Copy.fdbkTitle,
                          textAlign: TextAlign.center,
                          style: tokens.text.headline.copyWith(
                            color: tokens.colors.textPrimary,
                          ),
                        ),
                      ),
                      const SizedBox(width: ChalkakNavButton.size),
                    ],
                  ),
                ),
                Expanded(child: _body(context, viewModel.state)),
                // 보내기 버튼은 아래에 고정한다(좌우 screenHorizontal, 위 sm, 아래 lg).
                Padding(
                  padding: EdgeInsets.fromLTRB(
                    tokens.spacing.screenHorizontal,
                    tokens.spacing.sm,
                    tokens.spacing.screenHorizontal,
                    tokens.spacing.lg,
                  ),
                  child: TestId.button(
                    FeedbackTestIds.submitButton,
                    child: ChalkakButton(
                      label: viewModel.state.sending
                          ? Copy.fdbkSending
                          : Copy.fdbkSend,
                      onPressed: viewModel.state.canSend
                          ? () => unawaited(viewModel.send())
                          : null,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, FeedbackState state) {
    final tokens = context.tokens;
    final overLimit = state.count > AppConstants.feedbackMax;
    final errorStyle = tokens.text.footnote.copyWith(
      color: tokens.colors.error,
    );
    // 키보드가 올라오면 Scaffold가 본문 높이를 줄이므로 스크롤로 입력창을 보인다.
    return SingleChildScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: EdgeInsets.fromLTRB(
        tokens.spacing.screenHorizontal,
        tokens.spacing.xl,
        tokens.spacing.screenHorizontal,
        tokens.spacing.lg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TestId(
            FeedbackTestIds.guideText,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  Copy.fdbkIntroTitle,
                  style: tokens.text.title2.copyWith(
                    color: tokens.colors.textPrimary,
                  ),
                ),
                SizedBox(height: tokens.spacing.md),
                Text(
                  Copy.fdbkIntroBody,
                  style: tokens.text.subheadline.copyWith(
                    color: tokens.colors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          Text(
            Copy.fdbkFieldLabel,
            style: tokens.text.subheadline.copyWith(
              color: tokens.colors.textPrimary,
            ),
          ),
          SizedBox(height: tokens.spacing.sm),
          TestId(
            FeedbackTestIds.input,
            child: ChalkakTextField(
              controller: _controller,
              readOnly: state.sending,
              minLines: 8,
              maxLines: 14,
              minHeight: 240,
              style: tokens.text.subheadline,
              hintText: Copy.fdbkFieldPlaceholder,
              semanticLabel: Copy.fdbkFieldLabel,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              onChanged: widget.viewModel.onTextChanged,
              counter: TestId(
                FeedbackTestIds.counter,
                child: Text(
                  '${state.count} / ${AppConstants.feedbackMax}',
                  style: overLimit
                      ? tokens.text.subheadline.copyWith(
                          color: tokens.colors.error,
                        )
                      : null,
                ),
              ),
            ),
          ),
          if (state.validationMessage case final message?)
            Padding(
              padding: EdgeInsets.only(top: tokens.spacing.sm),
              child: TestId(
                FeedbackTestIds.validationMessage,
                child: Text(message, style: errorStyle),
              ),
            ),
          if (state.errorMessage case final message?)
            Padding(
              padding: EdgeInsets.only(top: tokens.spacing.sm),
              child: TestId(
                FeedbackTestIds.errorMessage,
                child: Text(message, style: errorStyle),
              ),
            ),
        ],
      ),
    );
  }
}
