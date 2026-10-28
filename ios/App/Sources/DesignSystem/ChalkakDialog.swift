import SwiftUI

/// 화면 전체를 덮는 모달 대화상자. 시스템 alert는 식별자를 달 수 없어 직접 그린다.
/// `actions`가 하나뿐이면 그 버튼만으로 닫는다(닫기 제스처·바깥 탭 없음).
struct ChalkakDialog<Actions: View>: View {
    let identifier: String
    let title: String
    let message: String
    let titleIdentifier: String?
    let messageIdentifier: String?
    let actions: () -> Actions

    init(
        identifier: String,
        title: String,
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
            VStack(spacing: ChalkakSpacing.lg) {
                Text(title)
                    .font(ChalkakFont.headline)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .accessibilityIdentifier(titleIdentifier ?? "\(identifier).title")
                Text(message)
                    .font(ChalkakFont.callout)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier(messageIdentifier ?? "\(identifier).message")
                actions()
            }
            .padding(ChalkakSpacing.xl)
            .frame(maxWidth: 320)
            .background(ChalkakColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ChalkakRadius.dialog))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier(identifier)
            .accessibilityAddTraits(.isModal)
        }
    }
}

struct ChalkakDialogButton: View {
    let title: String
    let identifier: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(ChalkakFont.callout)
                .foregroundStyle(ChalkakColor.onActionPrimary)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.button))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }
}
