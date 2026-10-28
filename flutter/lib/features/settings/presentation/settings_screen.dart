import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/copy/ko.g.dart';
import '../../../core/ui/test_id.dart';
import '../../onboarding/domain/legal_document.dart';
import '../../onboarding/presentation/legal_document_sheet.dart';
import '../../onboarding/presentation/legal_document_view_model.dart';
import '../domain/notification_settings.dart';
import 'push_settings_view_model.dart';
import 'settings_signature_card.dart';
import 'settings_test_ids.dart';
import 'settings_view_model.dart';

/// 설정 탭 화면. testids는 [SettingsTestIds], 상태는 [SettingsViewModel], [PushSettingsViewModel],
/// [SignatureCardViewModel]이 정한다. 이 위젯은 그리기만 한다.
///
/// 회원(`settings.root` 안, 위에서 아래로, REQ-SET-001): 앱 설정(`Copy.settingsSectionApp`) 사인 카드 ->
/// 푸시 알림(`settings.push-section`, `Copy.settingsSectionPush`) 스위치 3개 -> 계정(`settingsSectionAccount`)
/// 로그아웃·회원탈퇴 행 -> 피드백(`settingsSectionFeedback`) 피드백 보내기 행 -> 정보 및 약관
/// (`settingsSectionInfo`) 개인정보처리방침·이용약관·버전정보 행(`settings.version-value`에 버전 문자열).
/// 게스트: `settings.login-button`("로그인") 하나만. 사인·푸시·계정·피드백·약관 행은 트리에 없다(REQ-SET-002).
///
/// 푸시 스위치(`settings.push-topic-toggle` 등): 라벨은 `Copy.settingsPush*`, checked 상태를 노출하고
/// loading/loadFailed에서는 enabled=false, 저장 중인 항목도 다른 항목의 입력을 막지 않는다. loading이면
/// `settings.push-loading`, loadFailed이면 `settings.push-error`(`Copy.settingsPushLoadError`)와
/// `settings.push-retry-button`이 보인다. OS 권한 상태 행은 없다(TC-SET-039).
///
/// 확인 대화상자: `settings.logout-dialog`(`Copy.authLogoutConfirmMessage`)·`settings.withdraw-dialog`
/// (`authWithdrawConfirmMessage`)와 확인(`*-confirm-button`, 문구 `authLogoutConfirmOk`/`authWithdrawConfirmOk`)·
/// 취소(`*-cancel-button`, `Copy.authConfirmCancel`) 버튼. 두 대화상자는 문구와 강조 방식이 다르다(TC-SET-041).
/// 탈퇴 처리 중에는 확인 버튼이 비활성이다.
///
/// 이벤트: [OpenFeedback] -> [onOpenFeedback], [OpenLegalDocument] -> [LegalDocumentSheet.show]
/// ([documentViewModelFactory]로 만든 ViewModel), [OpenChangeSignature] -> [onChangeSignature]를 기다린 뒤
/// 결과로 `onSignatureChangeFinished(succeeded:)`. 사인 조회 실패 토스트는 [onToast]로 넘긴다.
/// 시작 시 `onTabShown`을 한 번 부른다(탭이 다시 보일 때는 호출한 쪽이 `onTabShown`을 부른다).
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.viewModel,
    required this.documentViewModelFactory,
    required this.webViewBuilder,
    required this.onOpenFeedback,
    required this.onChangeSignature,
    required this.onToast,
  });

  final SettingsViewModel viewModel;
  final LegalDocumentViewModel Function(LegalDocument document)
  documentViewModelFactory;
  final LegalWebViewBuilder webViewBuilder;

  /// 피드백 화면을 열고 닫힐 때까지 기다린다.
  final Future<void> Function() onOpenFeedback;

  /// 사인 변경 흐름을 열고 변경이 성공했으면 true를 돌려준다.
  final Future<bool> Function() onChangeSignature;

  final void Function(String message) onToast;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  StreamSubscription<SettingsEvent>? _events;
  int? _lastToastId;

  /// 같은 이동이 끝나기 전의 반복 입력(연타)은 무시한다.
  bool _openingFeedback = false;
  bool _openingSignature = false;
  bool _openingDocument = false;

  @override
  void initState() {
    super.initState();
    final viewModel = widget.viewModel;
    _lastToastId = viewModel.signature.state.toast?.id;
    _events = viewModel.events.listen(_onEvent);
    viewModel.signature.addListener(_forwardSignatureToast);
    // 첫 프레임 뒤에 시작해 빌드 중에 ViewModel이 알림을 내보내지 않게 한다.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(viewModel.onTabShown());
    });
  }

  @override
  void dispose() {
    widget.viewModel.signature.removeListener(_forwardSignatureToast);
    unawaited(_events?.cancel());
    super.dispose();
  }

  /// 사인 조회 실패 토스트는 카드가 아니라 화면이 보인다(같은 문구가 연달아도 id가 달라 다시 보인다).
  void _forwardSignatureToast() {
    final toast = widget.viewModel.signature.state.toast;
    if (!mounted || toast == null || toast.id == _lastToastId) return;
    _lastToastId = toast.id;
    widget.onToast(toast.text);
  }

  void _onEvent(SettingsEvent event) {
    if (!mounted) return;
    switch (event) {
      case OpenFeedback():
        unawaited(
          _guarded(
            () => _openingFeedback,
            (v) => _openingFeedback = v,
            widget.onOpenFeedback,
          ),
        );
      case OpenLegalDocument(:final document):
        unawaited(_openDocument(document));
      case OpenChangeSignature():
        unawaited(_changeSignature());
    }
  }

  Future<void> _guarded(
    bool Function() busy,
    void Function(bool) setBusy,
    Future<void> Function() action,
  ) async {
    if (busy()) return;
    setBusy(true);
    try {
      await action();
    } on Object {
      // 이동한 화면이 자기 오류를 알린다. 여기서는 연타 방지 표시만 푼다.
    } finally {
      setBusy(false);
    }
  }

  Future<void> _openDocument(LegalDocument document) async {
    if (_openingDocument) return;
    _openingDocument = true;
    try {
      await LegalDocumentSheet.show(
        context,
        viewModel: widget.documentViewModelFactory(document),
        webViewBuilder: widget.webViewBuilder,
      );
    } finally {
      _openingDocument = false;
    }
  }

  Future<void> _changeSignature() async {
    if (_openingSignature) return;
    _openingSignature = true;
    var changed = false;
    try {
      changed = await widget.onChangeSignature();
    } on Object {
      changed = false;
    } finally {
      _openingSignature = false;
    }
    // 화면이 사라졌어도 사인 카드는 다음 진입 때 다시 조회하므로 여기서는 이어 가지 않는다.
    if (!mounted) return;
    await widget.viewModel.onSignatureChangeFinished(succeeded: changed);
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = widget.viewModel;
    return TestId(
      SettingsTestIds.root,
      child: ListenableBuilder(
        listenable: viewModel,
        builder: (context, _) {
          final state = viewModel.state;
          return state.isGuest ? _guestBody(context) : _memberBody(state);
        },
      ),
    );
  }

  Widget _guestBody(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: TestId.button(
        SettingsTestIds.loginButton,
        child: FilledButton(
          onPressed: () => unawaited(widget.viewModel.onLoginPressed()),
          child: const Text(Copy.settingsGuestLogin),
        ),
      ),
    ),
  );

  Widget _memberBody(SettingsState state) {
    final viewModel = widget.viewModel;
    return Stack(
      children: [
        ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            const _SectionTitle(Copy.settingsSectionApp),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SettingsSignatureCard(
                viewModel: viewModel.signature,
                onChange: viewModel.onChangeSignaturePressed,
              ),
            ),
            const _SectionTitle(Copy.settingsSectionPush),
            _PushSection(viewModel: viewModel.push),
            const _SectionTitle(Copy.settingsSectionAccount),
            _Row(
              id: SettingsTestIds.logoutRow,
              label: Copy.settingsRowLogout,
              onTap: viewModel.onLogoutRowPressed,
            ),
            _Row(
              id: SettingsTestIds.withdrawRow,
              label: Copy.settingsRowWithdraw,
              onTap: viewModel.onWithdrawRowPressed,
            ),
            const _SectionTitle(Copy.settingsSectionFeedback),
            _Row(
              id: SettingsTestIds.feedbackRow,
              label: Copy.settingsRowFeedback,
              onTap: viewModel.onFeedbackPressed,
            ),
            const _SectionTitle(Copy.settingsSectionInfo),
            _Row(
              id: SettingsTestIds.privacyRow,
              label: Copy.settingsRowPrivacy,
              onTap: viewModel.onPrivacyPressed,
            ),
            _Row(
              id: SettingsTestIds.termsRow,
              label: Copy.settingsRowTerms,
              onTap: viewModel.onTermsPressed,
            ),
            TestId(
              SettingsTestIds.versionRow,
              child: ListTile(
                title: const Text(Copy.settingsRowVersion),
                trailing: TestId(
                  SettingsTestIds.versionValue,
                  child: Text(state.appVersion),
                ),
              ),
            ),
          ],
        ),
        if (state.dialog case final dialog?)
          _DialogOpener(
            key: ValueKey(dialog),
            viewModel: viewModel,
            kind: dialog,
          ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);

  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
    child: Text(
      title,
      style: Theme.of(context).textTheme.titleSmall
          ?.copyWith(color: Theme.of(context).colorScheme.primary),
    ),
  );
}

class _Row extends StatelessWidget {
  const _Row({required this.id, required this.label, required this.onTap});

  final String id;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => TestId.button(
    id,
    child: ListTile(
      title: Text(label),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    ),
  );
}

/// 푸시 수신 설정 스위치 세 개. OS 권한 상태 행은 없다(TC-SET-039).
class _PushSection extends StatelessWidget {
  const _PushSection({required this.viewModel});

  final PushSettingsViewModel viewModel;

  @override
  Widget build(BuildContext context) {
    return TestId(
      SettingsTestIds.pushSection,
      child: ListenableBuilder(
        listenable: viewModel,
        builder: (context, _) {
          final state = viewModel.state;
          final ready = state.status == PushSettingsStatus.ready;
          return Column(
            children: [
              if (state.status == PushSettingsStatus.loading ||
                  state.status == PushSettingsStatus.idle)
                const TestId(
                  SettingsTestIds.pushLoading,
                  child: LinearProgressIndicator(),
                ),
              if (state.status == PushSettingsStatus.loadFailed)
                _loadError(context),
              _toggle(
                state,
                ready: ready,
                id: SettingsTestIds.pushTopicToggle,
                label: Copy.settingsPushTopic,
                setting: PushSetting.topic,
              ),
              _toggle(
                state,
                ready: ready,
                id: SettingsTestIds.pushModerationToggle,
                label: Copy.settingsPushModeration,
                setting: PushSetting.moderation,
              ),
              _toggle(
                state,
                ready: ready,
                id: SettingsTestIds.pushAiToggle,
                label: Copy.settingsPushAiReview,
                setting: PushSetting.aiReview,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _loadError(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Expanded(
            child: TestId(
              SettingsTestIds.pushError,
              child: Text(
                Copy.settingsPushLoadError,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ),
          ),
          TestId.button(
            SettingsTestIds.pushRetryButton,
            child: TextButton(
              onPressed: () => unawaited(viewModel.retry()),
              child: const Text(Copy.commonRetry),
            ),
          ),
        ],
      ),
    );
  }

  /// 값이 없으면(불러오는 중, 조회 실패) 지어낸 값 대신 꺼진 비활성 스위치를 보인다.
  /// 저장 중인 항목도 다른 항목의 입력은 막지 않고, 같은 항목의 두 번째 입력은 ViewModel이 무시한다.
  Widget _toggle(
    PushSettingsState state, {
    required bool ready,
    required String id,
    required String label,
    required PushSetting setting,
  }) {
    final value = state.values?.valueOf(setting) ?? false;
    void toggle() => unawaited(viewModel.toggle(setting, !value));
    // 스위치는 시각 요소로만 두고, 행 하나가 checked·enabled를 노출한다(testids.md §2).
    return MergeSemantics(
      key: Key(id),
      child: Semantics(
        identifier: id,
        checked: value,
        enabled: ready,
        child: ListTile(
          enabled: ready,
          title: Text(label),
          onTap: ready ? toggle : null,
          trailing: ExcludeSemantics(
            child: IgnorePointer(
              child: Switch(value: value, onChanged: ready ? (_) {} : null),
            ),
          ),
        ),
      ),
    );
  }
}

/// [SettingsState.dialog]가 열려 있는 동안 확인 대화상자를 띄워 두는 보이지 않는 위젯.
/// 대화상자는 상태가 닫히면 스스로 닫히고, 사용자가 닫으면(뒤로 가기) 취소로 처리한다.
class _DialogOpener extends StatefulWidget {
  const _DialogOpener({super.key, required this.viewModel, required this.kind});

  final SettingsViewModel viewModel;
  final SettingsDialog kind;

  @override
  State<_DialogOpener> createState() => _DialogOpenerState();
}

class _DialogOpenerState extends State<_DialogOpener> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_open());
    });
  }

  Future<void> _open() async {
    final viewModel = widget.viewModel;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _ConfirmDialog(viewModel: viewModel, kind: widget.kind),
    );
    // 사용자가 닫았는데 상태가 아직 열려 있으면 취소로 본다(처리 중에는 닫히지 않는다).
    if (viewModel.state.dialog == widget.kind) viewModel.onDialogCancelled();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class _ConfirmDialog extends StatelessWidget {
  const _ConfirmDialog({required this.viewModel, required this.kind});

  final SettingsViewModel viewModel;
  final SettingsDialog kind;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: viewModel,
      builder: (context, _) {
        final state = viewModel.state;
        // 처리가 끝나 상태가 닫혔으면 스스로 닫는다.
        if (state.dialog != kind) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (context.mounted) Navigator.of(context).maybePop();
          });
        }
        final isWithdraw = kind == SettingsDialog.withdraw;
        final colors = Theme.of(context).colorScheme;
        return PopScope(
          canPop: !state.accountBusy,
          child: TestId(
            isWithdraw
                ? SettingsTestIds.withdrawDialog
                : SettingsTestIds.logoutDialog,
            child: AlertDialog(
              content: Text(
                isWithdraw
                    ? Copy.authWithdrawConfirmMessage
                    : Copy.authLogoutConfirmMessage,
              ),
              actions: [
                TestId.button(
                  isWithdraw
                      ? SettingsTestIds.withdrawCancelButton
                      : SettingsTestIds.logoutCancelButton,
                  child: TextButton(
                    onPressed: state.accountBusy
                        ? null
                        : viewModel.onDialogCancelled,
                    child: const Text(Copy.authConfirmCancel),
                  ),
                ),
                TestId.button(
                  isWithdraw
                      ? SettingsTestIds.withdrawConfirmButton
                      : SettingsTestIds.logoutConfirmButton,
                  child: isWithdraw
                      ? FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor: colors.error,
                            foregroundColor: colors.onError,
                          ),
                          onPressed: state.accountBusy
                              ? null
                              : () =>
                                    unawaited(viewModel.onWithdrawConfirmed()),
                          child: const Text(Copy.authWithdrawConfirmOk),
                        )
                      : TextButton(
                          onPressed: state.accountBusy
                              ? null
                              : () => unawaited(viewModel.onLogoutConfirmed()),
                          child: const Text(Copy.authLogoutConfirmOk),
                        ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
