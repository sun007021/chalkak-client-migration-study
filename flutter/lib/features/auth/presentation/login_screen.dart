import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/app_scope.dart';
import '../../../core/analytics/analytics_constants.dart';
import '../../../core/analytics/analytics_tracker.dart';
import '../../../core/copy/ko.g.dart';
import '../../../core/design/chalkak_tokens.dart';
import '../../../core/ui/components/chalkak_dialog.dart';
import '../../../core/ui/components/chalkak_states.dart';
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

  /// 로그인 헤더 높이 비율(LoginScreen.swift: 화면의 0.53).
  static const _headerFraction = 0.53;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return ListenableBuilder(
      listenable: widget.viewModel,
      builder: (context, _) {
        final submitting = widget.viewModel.state.isSubmitting;
        return TestId(
          TestIds.loginRoot,
          child: Scaffold(
            backgroundColor: tokens.colors.background,
            body: LayoutBuilder(
              builder: (context, constraints) {
                final headerHeight = constraints.maxHeight * _headerFraction;
                return SingleChildScrollView(
                  physics: const ClampingScrollPhysics(),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: constraints.maxHeight,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(
                          height: headerHeight,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              // 배경 사진은 20% 농도로 깔고 위에 타이틀을 얹는다.
                              Opacity(
                                opacity: 0.2,
                                child: Image.asset(
                                  'assets/images/img_login_background.jpg',
                                  fit: BoxFit.cover,
                                  excludeFromSemantics: true,
                                ),
                              ),
                              Padding(
                                padding: EdgeInsets.fromLTRB(
                                  20,
                                  MediaQuery.paddingOf(context).top + 135,
                                  20,
                                  0,
                                ),
                                child: Align(
                                  alignment: Alignment.topLeft,
                                  child: TestId(
                                    TestIds.loginTagline,
                                    child: Text(
                                      Copy.authLoginTagline,
                                      style: tokens.text.display.copyWith(
                                        color: tokens.colors.textPrimary,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: EdgeInsets.fromLTRB(
                            tokens.spacing.screenHorizontal,
                            60,
                            tokens.spacing.screenHorizontal,
                            56,
                          ),
                          child: Column(
                            children: [
                              TestId.button(
                                TestIds.loginKakaoButton,
                                child: _SocialButton(
                                  label: Copy.authLoginKakao,
                                  submitting: submitting,
                                  onPressed: submitting
                                      ? null
                                      : widget.viewModel.onKakaoPressed,
                                ),
                              ),
                              TestId.button(
                                TestIds.loginGuestButton,
                                child: _GuestLink(
                                  onPressed: submitting
                                      ? null
                                      : widget.viewModel.onGuestPressed,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        );
      },
    );
  }
}

/// 소셜 로그인 버튼(screens-a §4.2): 높이 56, inputBackground, 테두리 1 border, 라운드 button(12),
/// 로고 20 + 12 + callout. 눌림은 opacity 0.7, 진행 중이면 로고 자리에 작은 로딩을 보인다.
class _SocialButton extends StatefulWidget {
  const _SocialButton({
    required this.label,
    required this.submitting,
    required this.onPressed,
  });

  final String label;
  final bool submitting;
  final VoidCallback? onPressed;

  @override
  State<_SocialButton> createState() => _SocialButtonState();
}

class _SocialButtonState extends State<_SocialButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final enabled = widget.onPressed != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: widget.label,
      excludeSemantics: true,
      onTap: widget.onPressed,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onPressed,
        onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        child: Opacity(
          opacity: _pressed ? 0.7 : 1,
          child: Container(
            height: 56,
            decoration: BoxDecoration(
              color: tokens.colors.inputBackground,
              borderRadius: tokens.radius.buttonShape,
              border: Border.all(color: tokens.colors.border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (widget.submitting)
                  const TestId(
                    TestIds.loginLoading,
                    child: ChalkakSpinner(size: 20),
                  )
                else
                  Image.asset(
                    'assets/images/img_kakao_logo.png',
                    width: 20,
                    height: 20,
                    excludeFromSemantics: true,
                  ),
                SizedBox(width: tokens.spacing.md),
                Text(
                  widget.label,
                  style: tokens.text.callout.copyWith(
                    color: enabled
                        ? tokens.colors.textPrimary
                        : tokens.colors.textMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "로그인 없이 사진 둘러보기": subheadline textSecondary 밑줄, 최소 높이 44, 위 24.
class _GuestLink extends StatelessWidget {
  const _GuestLink({required this.onPressed});

  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return Padding(
      padding: EdgeInsets.only(top: tokens.spacing.xl),
      child: Semantics(
        button: true,
        enabled: onPressed != null,
        label: Copy.authLoginGuest,
        excludeSemantics: true,
        onTap: onPressed,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onPressed,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44, minWidth: 44),
            child: Center(
              child: Text(
                Copy.authLoginGuest,
                style: tokens.text.subheadline.copyWith(
                  color: onPressed == null
                      ? tokens.colors.textMuted
                      : tokens.colors.textSecondary,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ),
        ),
      ),
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
      child: ChalkakDialog(
        title: Copy.authLoginErrorTitle,
        message: message,
        actions: [
          TestId.button(
            TestIds.loginErrorDialogConfirmButton,
            child: ChalkakDialogButton(
              label: Copy.commonConfirm,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
        ],
      ),
    );
  }
}
