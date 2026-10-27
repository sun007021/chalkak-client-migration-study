import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/app_scope.dart';
import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';
import '../../../core/ui/test_ids.dart';
import 'login_view_model.dart';

/// 로그인 화면. testids: `login.root`, `login.tagline`, `login.kakao-button`
/// (진행 중 enabled=false), `login.guest-button`, `login.loading`(진행 중에만 존재),
/// `login.error-dialog`(+ `login.error-dialog-confirm-button`, 오류가 있을 때만 존재).
/// 화면이 보일 때 `screen_view(login)`을 한 번 보낸다(AppScope의 analytics).
/// [viewModel.events]를 구독해 [onEvent]로 넘긴다. Apple·Google 버튼은 없다.
class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.viewModel,
    required this.onEvent,
  });

  final LoginViewModel viewModel;
  final void Function(LoginEvent event) onEvent;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  static const _kakaoYellow = Color(0xFFFEE500);
  static const _kakaoLabel = Color(0xD9000000);

  StreamSubscription<LoginEvent>? _events;
  int? _shownErrorId;
  bool _viewTracked = false;

  @override
  void initState() {
    super.initState();
    _events = widget.viewModel.events.listen(widget.onEvent);
    widget.viewModel.addListener(_showErrorIfNeeded);
    // 화면이 뜨기 전에 이미 있는 안내(가입에서 돌아온 문구)는 첫 프레임 뒤에 보여 준다.
    WidgetsBinding.instance.addPostFrameCallback((_) => _showErrorIfNeeded());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_viewTracked) return;
    _viewTracked = true;
    AppScope.of(context).analytics
        .logEvent(AnalyticsEvent.screenView(ScreenNames.login));
  }

  @override
  void dispose() {
    widget.viewModel.removeListener(_showErrorIfNeeded);
    _events?.cancel();
    super.dispose();
  }

  void _showErrorIfNeeded() {
    final error = widget.viewModel.state.error;
    if (!mounted || error == null || error.id == _shownErrorId) return;
    _shownErrorId = error.id;
    unawaited(
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _ErrorDialog(message: error.message),
      ).then((_) {
        // 확인 버튼이든 시스템 뒤로가기든 닫히면 오류를 소비한다.
        if (widget.viewModel.state.error?.id == error.id) {
          widget.viewModel.dismissError();
        }
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (context, _) {
        final submitting = widget.viewModel.state.isSubmitting;
        return TestId(
          TestIds.loginRoot,
          child: Scaffold(
            body: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: Center(
                        child: TestId(
                          TestIds.loginTagline,
                          child: Text(
                            Copy.authLoginTagline,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                        ),
                      ),
                    ),
                    SizedBox(
                      height: 32,
                      child: submitting
                          ? const Center(
                              child: TestId(
                                TestIds.loginLoading,
                                child: SizedBox.square(
                                  dimension: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.5,
                                  ),
                                ),
                              ),
                            )
                          : null,
                    ),
                    TestId.button(
                      TestIds.loginKakaoButton,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: _kakaoYellow,
                          foregroundColor: _kakaoLabel,
                          minimumSize: const Size.fromHeight(52),
                        ),
                        onPressed: submitting
                            ? null
                            : widget.viewModel.onKakaoPressed,
                        child: const Text(Copy.authLoginKakao),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TestId.button(
                      TestIds.loginGuestButton,
                      child: TextButton(
                        style: TextButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                        ),
                        onPressed: submitting
                            ? null
                            : widget.viewModel.onGuestPressed,
                        child: const Text(Copy.authLoginGuest),
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ErrorDialog extends StatelessWidget {
  const _ErrorDialog({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return TestId(
      TestIds.loginErrorDialog,
      child: AlertDialog(
        title: const Text(Copy.authLoginErrorTitle),
        content: Text(message),
        actions: [
          TestId.button(
            TestIds.loginErrorDialogConfirmButton,
            child: TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text(Copy.commonConfirm),
            ),
          ),
        ],
      ),
    );
  }
}
