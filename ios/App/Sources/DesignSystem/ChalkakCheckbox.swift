import SwiftUI

/// 원본 ChalkakCheckbox: 22×22, 원본 색 에셋(template 아님), 애니메이션 없음.
struct ChalkakCheckbox: View {
    let isChecked: Bool

    var body: some View {
        Image(isChecked ? "ic_checkbox_selected" : "ic_checkbox_unselected")
            .renderingMode(.original)
            .frame(width: 22, height: 22)
            .accessibilityHidden(true)
    }
}
