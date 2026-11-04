import SwiftUI

/// 정렬 선택기(원본 ChalkakSortSelector, screens-b.md): subheadline, 선택은 textPrimary + 1pt 밑줄, 비선택은 textInactive, 터치 높이 44.
struct ChalkakSortSelector<Option: Hashable>: View {
    let options: [Option]
    let selectedOption: Option
    let label: (Option) -> String
    let onSelect: (Option) -> Void

    var body: some View {
        HStack(spacing: ChalkakSpacing.lg) {
            ForEach(options, id: \.self) { option in
                sortButton(for: option)
            }
        }
    }

    private func sortButton(for option: Option) -> some View {
        let isSelected = option == selectedOption
        return Button {
            onSelect(option)
        } label: {
            Text(label(option))
                .font(ChalkakFont.subheadline)
                .foregroundStyle(isSelected ? ChalkakColor.textPrimary : ChalkakColor.textInactive)
                .padding(.bottom, ChalkakSpacing.xs)
                .overlay(alignment: .bottom) {
                    if isSelected {
                        Rectangle()
                            .fill(ChalkakColor.textPrimary)
                            .frame(height: 1)
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(isSelected ? "선택됨" : "")
    }
}
