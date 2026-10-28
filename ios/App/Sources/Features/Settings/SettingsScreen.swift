import SwiftUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

/// 설정 탭 루트. 섹션 구성·푸시 스위치 규칙·권한 분기는 `SettingsViewModel`이 맡고 여기서는 그리고 입력을 넘긴다.
struct SettingsScreen: View {
    let container: AppContainer
    let session: MainSession
    /// 스위치를 눌러도 값이 바뀌지 않은 경우(권한 거부 등) 화면의 스위치를 ViewModel 값으로 되돌리려고 바꾸는 값.
    @State private var toggleRefresh = 0

    private var viewModel: SettingsViewModel { session.settings }

    var body: some View {
        VStack(spacing: 0) {
            header
            if viewModel.showsLoginButton {
                guestContent
            } else {
                memberContent
            }
        }
        .background(ChalkakColor.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("settings.root")
        .task { await viewModel.screenAppeared() }
        .onDisappear { viewModel.screenDisappeared() }
        .onChange(of: viewModel.needsLogin) { _, needsLogin in
            guard needsLogin else { return }
            viewModel.consumeNeedsLogin()
            Task { await container.launch.handleReauthenticationRequired() }
        }
        .onChange(of: viewModel.signature.notice) { _, notice in
            if let notice { container.toast.show(notice.message) }
        }
        .onChange(of: viewModel.account.toast) { _, notice in
            if let notice { container.toast.show(notice.message) }
        }
        .onChange(of: viewModel.account.state) { _, state in
            switch state {
            case .finished, .needsLogin:
                // 로컬 정리가 끝났다(또는 탈퇴 401): 로그인 화면으로 보내고 상태를 되돌린다.
                container.launch.accountSessionEnded()
                viewModel.account.consumeResult()
            case .idle, .confirming, .processing:
                break
            }
        }
        .sheet(isPresented: documentBinding) {
            if let presentation = viewModel.presentedDocument {
                LegalDocumentSheet(container: container, presentation: presentation) { viewModel.documentDismissed() }
            }
        }
    }

    private var header: some View {
        HStack {
            Text(NavCopy.label(for: .settings))
                .font(ChalkakFont.headline)
                .foregroundStyle(ChalkakColor.textPrimary)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 55)
    }

    // MARK: 게스트

    private var guestContent: some View {
        VStack {
            Button { Task { await container.launch.loginFromGuest() } } label: {
                Text(SettingsCopy.guestLogin)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.onActionPrimary)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("settings.login-button")
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .padding(.top, ChalkakSpacing.xl)
            Spacer(minLength: 0)
        }
    }

    // MARK: 회원

    private var memberContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ChalkakSpacing.xl) {
                ForEach(viewModel.sections, id: \.self) { section in
                    sectionView(section)
                }
            }
            .padding(.horizontal, ChalkakSpacing.screenHorizontal)
            .padding(.top, ChalkakSpacing.sm)
            .padding(.bottom, ChalkakSpacing.xl)
        }
    }

    @ViewBuilder
    private func sectionView(_ section: SettingsSection) -> some View {
        switch section {
        case .app:
            sectionContainer(title: SettingsCopy.sectionApp) { signatureCard }
        case .push:
            sectionContainer(title: SettingsCopy.sectionPush) { pushSection }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("settings.push-section")
        case .account:
            sectionContainer(title: SettingsCopy.sectionAccount) {
                row(SettingsCopy.rowLogout, identifier: "settings.logout-row") { viewModel.account.logoutTapped() }
                divider
                row(SettingsCopy.rowWithdraw, identifier: "settings.withdraw-row") { viewModel.account.withdrawTapped() }
            }
        case .feedback:
            sectionContainer(title: SettingsCopy.sectionFeedback) {
                row(SettingsCopy.rowFeedback, identifier: "settings.feedback-row") { session.shell.openFeedback() }
            }
        case .info:
            sectionContainer(title: SettingsCopy.sectionInfo) {
                row(SettingsCopy.rowPrivacy, identifier: "settings.privacy-row") { Task { await viewModel.viewDocument(.privacy) } }
                divider
                row(SettingsCopy.rowTerms, identifier: "settings.terms-row") { Task { await viewModel.viewDocument(.service) } }
                divider
                versionRow
            }
        }
    }

    private func sectionContainer<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.sm) {
            Text(title)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textSecondary)
            VStack(spacing: 0) {
                content()
            }
            .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.card))
            .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.card).stroke(ChalkakColor.border, lineWidth: 1))
        }
    }

    private var divider: some View {
        Rectangle().fill(ChalkakColor.border).frame(height: 1).padding(.leading, ChalkakSpacing.lg)
    }

    private func row(_ title: String, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textPrimary)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(ChalkakColor.textSecondary)
            }
            .padding(.horizontal, ChalkakSpacing.lg)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }

    private var versionRow: some View {
        HStack {
            Text(SettingsCopy.rowVersion)
                .font(ChalkakFont.callout)
                .foregroundStyle(ChalkakColor.textPrimary)
            Spacer(minLength: 0)
            Text(viewModel.versionText)
                .font(ChalkakFont.callout)
                .foregroundStyle(ChalkakColor.textSecondary)
                .accessibilityIdentifier("settings.version-value")
        }
        .padding(.horizontal, ChalkakSpacing.lg)
        .frame(minHeight: 52)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("settings.version-row")
    }

    // MARK: 사인 카드

    private var signatureCard: some View {
        let signature = viewModel.signature
        return VStack(alignment: .leading, spacing: ChalkakSpacing.md) {
            HStack {
                Text(SignatureCopy.cardTitle)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textPrimary)
                Spacer(minLength: 0)
                Button { session.beginSignatureChange() } label: {
                    Text(SignatureCopy.cardChange)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .padding(.horizontal, ChalkakSpacing.lg)
                        .frame(minHeight: 36)
                        .background(ChalkakColor.actionPrimary, in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("settings.signature-change-button")
            }
            // 사인 PNG는 흰 선이라 어두운 배경 위에 그린다(미리보기와 같다).
            ZStack {
                ChalkakColor.actionPrimary
                if let url = signature.imageURL {
                    ChalkakRemoteImage(url: url, contentMode: .fit)
                        .accessibilityIdentifier("settings.signature-image")
                }
                if signature.isLoading, signature.imageURL == nil {
                    ProgressView()
                        .tint(ChalkakColor.onActionPrimary)
                        .accessibilityIdentifier("settings.signature-loading")
                }
            }
            .aspectRatio(SignaturePadMetrics.aspectRatio, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.small))
            // 이미지가 없고 재등록 상태도 아닌데 조회가 실패한 경우에만 인라인 오류와 다시 불러오기를 보인다.
            if signature.notice != nil, signature.imageURL == nil, !signature.needsRegistration, !signature.isLoading {
                HStack(spacing: ChalkakSpacing.md) {
                    Text(SignatureCopy.loadError)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.error)
                        .accessibilityIdentifier("settings.signature-error")
                    Spacer(minLength: 0)
                    Button { Task { await signature.screenAppeared() } } label: {
                        Text(NotificationCopy.retry)
                            .font(ChalkakFont.footnote)
                            .foregroundStyle(ChalkakColor.textPrimary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("settings.signature-retry-button")
                }
            }
        }
        .padding(ChalkakSpacing.lg)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("settings.signature-card")
    }

    // MARK: 푸시 알림

    @ViewBuilder
    private var pushSection: some View {
        VStack(spacing: 0) {
            pushToggle(.topic, identifier: "settings.push-topic-toggle")
            divider
            pushToggle(.moderation, identifier: "settings.push-moderation-toggle")
            divider
            pushToggle(.aiReview, identifier: "settings.push-ai-toggle")
        }
        .id(toggleRefresh)
        switch viewModel.pushState {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, ChalkakSpacing.sm)
                .accessibilityIdentifier("settings.push-loading")
        case .failed:
            HStack(spacing: ChalkakSpacing.md) {
                Text(SettingsCopy.pushLoadError)
                    .font(ChalkakFont.footnote)
                    .foregroundStyle(ChalkakColor.error)
                    .accessibilityIdentifier("settings.push-error")
                Spacer(minLength: 0)
                Button { Task { await viewModel.retryPushSettings() } } label: {
                    Text(NotificationCopy.retry)
                        .font(ChalkakFont.footnote)
                        .foregroundStyle(ChalkakColor.textPrimary)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("settings.push-retry-button")
            }
            .padding(ChalkakSpacing.lg)
        case .ready:
            EmptyView()
        }
    }

    private func pushToggle(_ kind: NotificationSettingKind, identifier: String) -> some View {
        Toggle(isOn: Binding(
            get: { viewModel.pushValue(kind) ?? false },
            set: { newValue in
                Task { @MainActor in
                    await viewModel.toggle(kind, to: newValue)
                    // 값이 바뀌지 않은 입력(권한 거부·무시)은 ViewModel 값으로 스위치를 되돌린다.
                    toggleRefresh += 1
                }
            }
        )) {
            Text(SettingsCopy.pushLabel(for: kind))
                .font(ChalkakFont.callout)
                .foregroundStyle(ChalkakColor.textPrimary)
        }
        .tint(ChalkakColor.actionPrimary)
        .disabled(!viewModel.isPushEnabled)
        .padding(.horizontal, ChalkakSpacing.lg)
        .frame(minHeight: 52)
        .accessibilityIdentifier(identifier)
    }

    private var documentBinding: Binding<Bool> {
        Binding(
            get: { viewModel.presentedDocument != nil },
            set: { presented in
                if !presented { viewModel.documentDismissed() }
            }
        )
    }
}

/// 로그아웃·회원탈퇴 확인 대화상자. 하단 바까지 덮으려고 메인 셸 전체 위에 겹쳐 그린다(`MainView`가 설정 ViewModel을 넘긴다).
struct SettingsAccountDialogs: View {
    let account: AccountSessionViewModel

    var body: some View {
        switch account.state {
        case .confirming(let action, let prompt):
            dialog(action: action, prompt: prompt, isBusy: false)
        case .processing(let action):
            // 처리 중에도 대화상자를 유지하되 확인 버튼은 비활성이다(REQ: 처리 중 비활성).
            dialog(action: action, prompt: prompt(for: action), isBusy: true)
        case .idle, .finished, .needsLogin:
            EmptyView()
        }
    }

    private func prompt(for action: AccountAction) -> ConfirmationPrompt {
        switch action {
        case .logout:
            ConfirmationPrompt(message: AuthCopy.logoutConfirmMessage, confirmTitle: AuthCopy.logoutConfirmOK, cancelTitle: AuthCopy.confirmCancel)
        case .withdraw:
            ConfirmationPrompt(message: AuthCopy.withdrawConfirmMessage, confirmTitle: AuthCopy.withdrawConfirmOK, cancelTitle: AuthCopy.confirmCancel)
        }
    }

    private func dialog(action: AccountAction, prompt: ConfirmationPrompt, isBusy: Bool) -> some View {
        let prefix = action == .logout ? "settings.logout" : "settings.withdraw"
        return ChalkakDialog(identifier: "\(prefix)-dialog", title: nil, message: prompt.message) {
            HStack(spacing: ChalkakSpacing.md) {
                Button { account.cancelConfirmation() } label: {
                    Text(prompt.cancelTitle)
                        .font(ChalkakFont.callout)
                        .foregroundStyle(ChalkakColor.textPrimary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(ChalkakColor.inputBackground, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                        .overlay(RoundedRectangle(cornerRadius: ChalkakRadius.button).stroke(ChalkakColor.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .accessibilityIdentifier("\(prefix)-cancel-button")
                Button {
                    Task {
                        switch action {
                        case .logout: await account.confirmLogout()
                        case .withdraw: await account.confirmWithdraw()
                        }
                    }
                } label: {
                    Text(prompt.confirmTitle)
                        .font(ChalkakFont.callout)
                        .foregroundStyle(ChalkakColor.onActionPrimary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                        .opacity(isBusy ? 0.3 : 1)
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .accessibilityIdentifier("\(prefix)-confirm-button")
            }
        }
    }
}
