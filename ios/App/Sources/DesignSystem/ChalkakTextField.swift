// 원본: DesignSystem/Components/Input/ChalkakTextField.swift (screens-a.md 1.6)
import SwiftUI

/// 텍스트 길이를 어떤 단위로 세고 제한할지 정한다.
///
/// 서버 검증 기준과 UI 제한·카운터를 맞추기 위한 값이다. 기본값은 사용자가 눈으로 세는
/// 글자 수(grapheme)이며, 서버가 다른 단위로 검증하는 화면은 그 단위를 골라 맞춘다.
enum ChalkakTextLengthMetric {
    /// 사람이 인식하는 글자(grapheme cluster) 수. `String.count` 기준.
    case characters
    /// Unicode scalar(=code point) 수. 서버가 code point로 길이를 검증할 때 사용한다.
    case unicodeScalars
}

struct ChalkakTextField: View {
    @FocusState private var isFocused: Bool
    @State private var inputText: String?

    @Binding var text: String
    let label: String
    var placeholder = ""
    var isEnabled = true
    var isReadOnly = false
    var lineLimit: ClosedRange<Int> = 1...5
    var textFont: Font? = nil
    var maximumCharacterCount: Int?
    var lengthMetric: ChalkakTextLengthMetric = .characters
    var showsCharacterCount = true
    /// 화면이 길이를 직접 세는 경우(예: ViewModel 규칙) 안쪽 카운터 자리에 이 문구를 그린다.
    var counterText: String?
    var counterIdentifier: String?
    var height: CGFloat?
    var onFocusChange: ((Bool) -> Void)? = nil

    var body: some View {
        TextField(
            label,
            text: inputBinding,
            prompt: Text(placeholder)
                .foregroundStyle(ChalkakColor.textInactive),
            axis: lineLimit.upperBound == 1 ? .horizontal : .vertical
        )
        .labelsHidden()
        .lineLimit(lineLimit)
        .focused($isFocused)
        .disabled(!isEnabled)
        .allowsHitTesting(!isReadOnly)
        .font(textFont ?? ChalkakFont.body)
        .foregroundStyle(isEnabled ? ChalkakColor.textPrimary : ChalkakColor.textMuted)
        .tint(ChalkakColor.inputCursor)
        .padding(
            .bottom,
            (showsCharacterCount && maximumCharacterCount != nil) || counterText != nil
                ? ChalkakSpacing.xl
                : ChalkakSpacing.none
        )
        .padding(ChalkakSpacing.lg)
        .frame(height: height, alignment: .topLeading)
        .background(
            ChalkakColor.inputBackground,
            in: RoundedRectangle(cornerRadius: ChalkakRadius.input)
        )
        .overlay {
            RoundedRectangle(cornerRadius: ChalkakRadius.input)
                .stroke(
                    isFocused ? ChalkakColor.actionPrimary : ChalkakColor.border,
                    lineWidth: 1
                )
        }
        .overlay(alignment: .bottomTrailing) {
            if let counterText {
                Text(counterText)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textInactive)
                    .padding(ChalkakSpacing.lg)
                    .accessibilityIdentifier(counterIdentifier ?? "")
            } else if showsCharacterCount, let maximumCharacterCount {
                Text("\(currentLength) / \(maximumCharacterCount)")
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textInactive)
                    .padding(ChalkakSpacing.lg)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityLabel(label)
        .accessibilityValue(accessibilityValue)
        .onAppear(perform: synchronizeInputText)
        .onChange(of: inputText) { _, newValue in
            guard let newValue else { return }
            let normalizedValue = normalizedText(newValue)
            if inputText != normalizedValue {
                inputText = normalizedValue
            }
            if text != normalizedValue {
                text = normalizedValue
            }
        }
        .onChange(of: text) { _, newValue in
            let normalizedValue = normalizedText(newValue)
            if inputText != normalizedValue {
                inputText = normalizedValue
            }
            if text != normalizedValue {
                text = normalizedValue
            }
        }
        .onChange(of: isFocused) { _, isFocused in
            onFocusChange?(isFocused)
        }
    }

    private var inputBinding: Binding<String> {
        Binding(
            get: { normalizedText(inputText ?? text) },
            set: { inputText = $0 }
        )
    }

    private var displayedText: String {
        normalizedText(inputText ?? text)
    }

    private var currentLength: Int {
        displayedText.length(using: lengthMetric)
    }

    private var accessibilityValue: String {
        guard let maximumCharacterCount else { return displayedText }
        return "\(displayedText), \(maximumCharacterCount)자 중 \(currentLength)자 입력"
    }

    private func normalizedText(_ value: String) -> String {
        guard let maximumCharacterCount else { return value }
        return value.limited(to: maximumCharacterCount, using: lengthMetric)
    }

    private func synchronizeInputText() {
        let normalizedValue = normalizedText(text)
        if inputText != normalizedValue {
            inputText = normalizedValue
        }
        if text != normalizedValue {
            text = normalizedValue
        }
    }
}

extension String {
    /// 주어진 기준으로 이 문자열의 길이를 센다.
    func length(using metric: ChalkakTextLengthMetric) -> Int {
        switch metric {
        case .characters:
            return count
        case .unicodeScalars:
            return unicodeScalars.count
        }
    }

    /// 주어진 기준으로 최대 길이를 넘지 않도록 앞에서부터 잘라 반환한다.
    func limited(to maximumCount: Int, using metric: ChalkakTextLengthMetric) -> String {
        let maximum = max(0, maximumCount)
        switch metric {
        case .characters:
            return String(prefix(maximum))
        case .unicodeScalars:
            guard unicodeScalars.count > maximum else { return self }
            return String(String.UnicodeScalarView(unicodeScalars.prefix(maximum)))
        }
    }
}


extension View {
    /// 입력 칸 바깥 모양만 입힌다(바탕 inputBackground, 라운드 input 14, 테두리 포커스 actionPrimary/평소 border, 커서 inputCursor).
    func chalkakInputChrome(isFocused: Bool) -> some View {
        self
            .tint(ChalkakColor.inputCursor)
            .padding(ChalkakSpacing.lg)
            .background(ChalkakColor.inputBackground, in: RoundedRectangle(cornerRadius: ChalkakRadius.input))
            .overlay {
                RoundedRectangle(cornerRadius: ChalkakRadius.input)
                    .stroke(isFocused ? ChalkakColor.actionPrimary : ChalkakColor.border, lineWidth: 1)
            }
    }
}
