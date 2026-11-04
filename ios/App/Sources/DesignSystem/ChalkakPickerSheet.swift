import SwiftUI
import UIKit

/// 가운데 제목, 오른쪽 "완료", 그 아래 휠로 이루어진 시트 내용(원본 ChalkakPickerSheet, screens-b.md).
/// 높이 340, 손잡이 표시, 라운드 sheet(28), 배경 surfaceElevated.
struct ChalkakPickerSheet<Wheels: View>: View {
    let title: String
    var confirmTitle = "완료"
    let onConfirm: () -> Void
    @ViewBuilder let wheels: () -> Wheels

    var body: some View {
        VStack(spacing: 0) {
            header
            wheels()
                .padding(.horizontal, ChalkakSpacing.lg)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(.top, 20)
        .background(ChalkakColor.surfaceElevated)
        .presentationDetents([.height(340)])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(ChalkakRadius.sheet)
        .presentationBackground(ChalkakColor.surfaceElevated)
    }

    private var header: some View {
        ZStack {
            Text(title)
                .font(ChalkakFont.headline)
                .foregroundStyle(ChalkakColor.textPrimary)
                .accessibilityAddTraits(.isHeader)
            HStack {
                Spacer(minLength: 0)
                Button(action: onConfirm) {
                    Text(confirmTitle)
                        .font(ChalkakFont.headline)
                        .foregroundStyle(ChalkakColor.textPrimary)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .frame(height: 52)
        .padding(.horizontal, ChalkakSpacing.lg)
    }
}

/// 휠 한 열. `titles[selectedIndex]`가 가운데 선택 띠에 놓인다.
struct ChalkakWheelColumn {
    let accessibilityLabel: String
    let titles: [String]
    let selectedIndex: Int
    let onSelect: (Int) -> Void
}

/// 여러 열을 한 `UIPickerView`에 넣은 시스템 휠(원본 ChalkakWheelPicker). 높이는 시스템 휠 고유 높이(216)다.
struct ChalkakWheelPicker: UIViewRepresentable {
    let columns: [ChalkakWheelColumn]

    func makeCoordinator() -> Coordinator {
        Coordinator(columns: columns)
    }

    func makeUIView(context: Context) -> UIPickerView {
        let picker = UIPickerView()
        picker.dataSource = context.coordinator
        picker.delegate = context.coordinator
        picker.setContentHuggingPriority(.defaultLow, for: .horizontal)
        picker.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        selectRows(in: picker)
        return picker
    }

    func updateUIView(_ picker: UIPickerView, context: Context) {
        let previousTitles = context.coordinator.columns.map(\.titles)
        context.coordinator.columns = columns
        for (component, column) in columns.enumerated()
        where previousTitles.indices.contains(component) == false || previousTitles[component] != column.titles {
            picker.reloadComponent(component)
        }
        selectRows(in: picker)
    }

    private func selectRows(in picker: UIPickerView) {
        for (component, column) in columns.enumerated()
        where column.titles.indices.contains(column.selectedIndex)
            && picker.selectedRow(inComponent: component) != column.selectedIndex {
            picker.selectRow(column.selectedIndex, inComponent: component, animated: false)
        }
    }

    final class Coordinator: NSObject, UIPickerViewDataSource, UIPickerViewDelegate, UIPickerViewAccessibilityDelegate {
        var columns: [ChalkakWheelColumn]

        init(columns: [ChalkakWheelColumn]) {
            self.columns = columns
        }

        func numberOfComponents(in pickerView: UIPickerView) -> Int {
            columns.count
        }

        func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
            columns[component].titles.count
        }

        func pickerView(_ pickerView: UIPickerView, titleForRow row: Int, forComponent component: Int) -> String? {
            columns[component].titles[row]
        }

        func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
            guard row != columns[component].selectedIndex else { return }
            columns[component].onSelect(row)
        }

        func pickerView(_ pickerView: UIPickerView, accessibilityLabelForComponent component: Int) -> String? {
            columns[component].accessibilityLabel
        }
    }
}
