import SwiftUI
import ChalkakFeatures

/// 하단 탭 바(홈·전시·업로드 버튼·기록·설정). 선택 상태와 동작은 MainShellViewModel이 정한다.
struct ChalkakBottomBar: View {
    let selectedTab: MainTab
    let onSelect: (MainTab) -> Void
    let onUpload: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.home)
            tabButton(.display)
            uploadButton
            tabButton(.record)
            tabButton(.settings)
        }
        // 원본 Flat 바(screens-a.md 3.3): 패딩 top 15 / bottom 12, 배경 surfaceElevated
        .padding(.top, 15)
        .padding(.bottom, 12)
        .background(ChalkakColor.surfaceElevated.ignoresSafeArea(edges: .bottom))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("bottom-bar.root")
    }

    private func tabButton(_ tab: MainTab) -> some View {
        let isSelected = tab == selectedTab
        return Button { onSelect(tab) } label: {
            VStack(spacing: 7) {
                Image(iconName(for: tab, isSelected: isSelected))
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 23, height: 23)
                Text(NavCopy.label(for: tab))
                    .font(isSelected ? ChalkakFont.footnoteBold : ChalkakFont.footnote)
            }
            .foregroundStyle(isSelected ? ChalkakColor.actionPrimary : ChalkakColor.bottomBar)
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
        .accessibilityIdentifier("bottom-bar.tab-\(tab.rawValue)")
    }

    private var uploadButton: some View {
        Button(action: onUpload) {
            Image("ic_bottom_write")
                .renderingMode(.original)
                .resizable()
                .scaledToFit()
                .frame(width: 40, height: 40)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(NavCopy.uploadAccessibilityLabel)
        .accessibilityIdentifier("bottom-bar.upload-button")
    }

    private func iconName(for tab: MainTab, isSelected: Bool) -> String {
        let base: String
        switch tab {
        case .home: base = "ic_bottom_home"
        case .display: base = "ic_bottom_display"
        case .record: base = "ic_bottom_record"
        case .settings: base = "ic_bottom_setting"
        }
        return isSelected ? "\(base)_selected" : base
    }
}
