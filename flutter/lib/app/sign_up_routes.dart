import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../core/constants/app_constants.dart';
import '../features/onboarding/domain/sign_up_submitter.dart';
import '../features/onboarding/presentation/legal_document_view_model.dart';
import '../features/onboarding/presentation/terms_screen.dart';
import '../features/onboarding/presentation/terms_view_model.dart';
import '../features/signature/domain/signature_mode.dart';
import '../features/signature/presentation/signature_draw_screen.dart';
import '../features/signature/presentation/signature_draw_view_model.dart';
import '../features/signature/presentation/signature_preview_screen.dart';
import '../features/signature/presentation/signature_preview_view_model.dart';
import 'app_dependencies.dart';
import 'app_routes.dart';
import 'view_model_host.dart';

/// 가입 3단계 라우트: 약관 -> 사인 그리기 -> 미리보기.
/// - 각 단계는 앞 단계 위에 쌓이고(`push`), 가입이 끝나면 메인으로 `go`해 모두 제거한다.
/// - 약관에서 뒤로 가면 로그인으로 `go`한다.
/// - 미리보기는 "다시 그리기"·서버가 사인을 거절한 경우 그리기로 돌아오고(그림을 지운 채),
///   만료·차단이면 로그인으로 `go`하며 안내 문구를 extra로 넘긴다.
GoRoute buildSignUpRoute(AppDependencies dependencies) {
  return GoRoute(
    path: AppRoutes.terms,
    builder: (context, state) => ViewModelHost<TermsViewModel>(
      create: () => TermsViewModel(
        context: dependencies.signUpContext,
        analytics: dependencies.analytics,
      ),
      builder: (context, viewModel) => TermsScreen(
        viewModel: viewModel,
        documentViewModelFactory: (document) => LegalDocumentViewModel(
          document: document,
          launcher: dependencies.externalLinkLauncher,
          analytics: dependencies.analytics,
        ),
        webViewBuilder: dependencies.legalWebViewBuilder,
        onEvent: (event) => switch (event) {
          NavigateToSignature() => unawaited(
            context.push<void>(AppRoutes.signUpSignature),
          ),
          ReturnToLogin() => context.go(AppRoutes.login),
          OpenLegalDocument() => null, // 화면이 시트를 직접 연다.
        },
      ),
    ),
    routes: [
      GoRoute(
        path: 'signature',
        builder: (context, state) => ViewModelHost<SignatureDrawViewModel>(
          create: () => SignatureDrawViewModel(
            mode: SignatureMode.onboarding,
            renderer: dependencies.signatureRenderer,
            analytics: dependencies.analytics,
            // 실제 크기는 화면이 레이아웃 뒤에 알려 준다.
            canvasWidth: AppConstants.signaturePngWidth.toDouble(),
            canvasHeight: AppConstants.signaturePngHeight.toDouble(),
          ),
          builder: (context, viewModel) => SignatureDrawScreen(
            viewModel: viewModel,
            onEvent: (event) => switch (event) {
              NavigateToPreview(:final png) => unawaited(
                _openPreview(context, viewModel, png),
              ),
              NavigateBackFromDrawing() => context.pop(),
            },
          ),
        ),
        routes: [
          GoRoute(
            path: 'preview',
            builder: (context, state) {
              final png = state.extra as Uint8List;
              return ViewModelHost<SignaturePreviewViewModel>(
                create: () => SignaturePreviewViewModel(
                  mode: SignatureMode.onboarding,
                  png: png,
                  submitter: SignUpSubmitter(
                    useCase: dependencies.signUpUseCase,
                    context: dependencies.signUpContext,
                  ),
                  analytics: dependencies.analytics,
                ),
                builder: (context, viewModel) => SignaturePreviewScreen(
                  viewModel: viewModel,
                  onEvent: (event) =>
                      _onPreviewEvent(context, dependencies, event),
                ),
              );
            },
          ),
        ],
      ),
    ],
  );
}

/// 미리보기를 열고, 돌아오면 그림을 지운 채 다시 확정할 수 있게 한다.
/// 결과가 문구면 서버가 사인을 거절한 것이므로 그리기 화면에 보여 준다.
Future<void> _openPreview(
  BuildContext context,
  SignatureDrawViewModel viewModel,
  Uint8List png,
) async {
  final message = await context.push<String>(
    AppRoutes.signUpPreview,
    extra: png,
  );
  if (!context.mounted) return; // 가입이 끝나 그리기 화면이 제거됐다.
  viewModel
    ..clear()
    ..reset();
  if (message != null) viewModel.showError(message);
}

void _onPreviewEvent(
  BuildContext context,
  AppDependencies dependencies,
  SignaturePreviewEvent event,
) {
  switch (event) {
    case PreviewRedraw():
      context.pop();
    case PreviewReturnToDrawing(:final message):
      context.pop(message);
    case PreviewSignUpCompleted():
      context.go(AppRoutes.main);
    case PreviewReturnToLogin(:final message):
      dependencies.signUpContext.discard();
      context.go(AppRoutes.login, extra: message);
    case PreviewChangeCompleted():
      // 사인 변경 흐름(SET PR)에서만 쓴다. 가입 모드에서는 나오지 않는다.
      break;
  }
}

/// 가입 흐름 화면은 `SignUpContext`가 비어 있으면(앱 재시작, 딥링크) 로그인으로 보낸다.
/// 미리보기는 PNG 없이 열 수 없어 그리기로 보낸다.
String? signUpRedirect(AppDependencies dependencies, GoRouterState state) {
  final location = state.matchedLocation;
  final inSignUp =
      location == AppRoutes.terms || location.startsWith('${AppRoutes.terms}/');
  if (!inSignUp) return null;
  if (dependencies.signUpContext.current == null) return AppRoutes.login;
  if (location == AppRoutes.signUpPreview && state.extra is! Uint8List) {
    return AppRoutes.signUpSignature;
  }
  return null;
}
