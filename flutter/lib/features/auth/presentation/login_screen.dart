import 'package:flutter/material.dart';

import 'login_view_model.dart';

/// 로그인 화면. testids: `login.root`, `login.tagline`, `login.kakao-button`
/// (진행 중 enabled=false), `login.guest-button`, `login.loading`(진행 중에만 존재),
/// `login.error-dialog`(+ `login.error-dialog-confirm-button`, 오류가 있을 때만 존재).
/// 화면이 보일 때 `screen_view(login)`을 한 번 보낸다(AppScope의 analytics).
/// [viewModel.events]를 구독해 [onEvent]로 넘긴다. Apple·Google 버튼은 없다.
class LoginScreen extends StatelessWidget {
  const LoginScreen({
    super.key,
    required this.viewModel,
    required this.onEvent,
  });

  final LoginViewModel viewModel;
  final void Function(LoginEvent event) onEvent;

  @override
  Widget build(BuildContext context) => throw UnimplementedError();
}
