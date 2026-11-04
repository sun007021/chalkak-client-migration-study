import SwiftUI

/// 화면 전체를 덮는 모달 대화상자. 시스템 alert는 식별자를 달 수 없어 직접 그린다.
/// `actions`가 하나뿐이면 그 버튼만으로 닫는다(닫기 제스처·바깥 탭 없음).
struct ChalkakDialog<Actions: View>: View {
    let identifier: String
    let title: String?
    let message: String
    let titleIdentifier: String?
    let messageIdentifier: String?
    let actions: () -> Actions

    init(
        identifier: String,
        title: String?,
        message: String,
        titleIdentifier: String? = nil,
        messageIdentifier: String? = nil,
        @ViewBuilder actions: @escaping () -> Actions
    ) {
        self.identifier = identifier
        self.title = title
        self.message = message
        self.titleIdentifier = titleIdentifier
        self.messageIdentifier = messageIdentifier
        self.actions = actions
    }

    var body: some View {
        ZStack {
            ChalkakColor.scrim.ignoresSafeArea()
            // 원본 ChalkakConfirmDialog(screens-c.md 1.2): 카드 라운드 16, 제목 title3, 본문 callout/textNeutral, 버튼 라운드 12
            VStack(spacing: ChalkakSpacing.md) {
                if let title {
                    Text(title)
                        .font(ChalkakFont.title3)
                        .foregroundStyle(ChalkakColor.textPrimary)
                        .accessibilityIdentifier(titleIdentifier ?? "\(identifier).title")
                }
                Text(message)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textNeutral)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier(messageIdentifier ?? "\(identifier).message")
                actions()
            }
            .padding(.horizontal, ChalkakSpacing.xl)
            .padding(.top, ChalkakSpacing.xl)
            .padding(.bottom, ChalkakSpacing.lg)
            .frame(maxWidth: 320)
            .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.large))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(identifier)
            .accessibilityAddTraits(.isModal)
        }
    }
}

struct ChalkakDialogButton: View {
    enum Style {
        case primary
        case secondary
        case destructive
    }

    let title: String
    let identifier: String
    var style: Style = .primary
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(ChalkakFont.callout)
                .foregroundStyle(foreground)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(background, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
                .contentShape(RoundedRectangle(cornerRadius: ChalkakRadius.button))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }

    private var background: Color {
        switch style {
        case .primary: ChalkakColor.actionPrimary
        case .secondary: ChalkakColor.actionSecondary
        case .destructive: ChalkakColor.destructive
        }
    }

    private var foreground: Color {
        switch style {
        case .primary, .destructive: ChalkakColor.onActionPrimary
        case .secondary: ChalkakColor.onActionSecondary
        }
    }
}
