import SwiftUI
import ChalkakData
import ChalkakFeatures

/// 열려 있는 시트를 `.sheet(item:)`으로 그리기 위한 식별자 래퍼(시트 종류가 바뀌면 새로 띄운다).
private struct AISheetItem: Identifiable {
    let id: String
    let sheet: AIReviewViewModel.Sheet

    init?(_ sheet: AIReviewViewModel.Sheet?) {
        guard let sheet else { return nil }
        self.sheet = sheet
        switch sheet {
        case .start(let isRetry): id = isRetry ? "start-retry" : "start"
        case .result: id = "result"
        case .failed: id = "failed"
        }
    }
}

extension View {
    /// AI 피드백 시작/재요청·결과·실패 시트를 `viewModel.sheet`에 맞춰 띄운다. 닫으면 `dismissSheet()`.
    func aiReviewSheets(_ viewModel: AIReviewViewModel) -> some View {
        sheet(
            item: Binding<AISheetItem?>(
                get: { AISheetItem(viewModel.sheet) },
                set: { if $0 == nil { viewModel.dismissSheet() } }
            )
        ) { item in
            AIReviewSheetContent(viewModel: viewModel, sheet: item.sheet)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .chalkakSheetPresentationStyle()
        }
    }
}

private struct AIReviewSheetContent: View {
    let viewModel: AIReviewViewModel
    let sheet: AIReviewViewModel.Sheet

    var body: some View {
        switch sheet {
        case .start(let isRetry):
            AIStartSheet(viewModel: viewModel, isRetry: isRetry)
        case .result(let result):
            AIResultSheet(viewModel: viewModel, result: result)
        case .failed(let reason):
            AIFailedSheet(viewModel: viewModel, reason: reason)
        }
    }
}

private struct AISheetCloseButton: View {
    let identifier: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(AIReviewCopy.close)
                .font(ChalkakFont.callout)
                .foregroundStyle(ChalkakColor.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }
}

// MARK: 시작 · 재요청 시트

private struct AIStartSheet: View {
    let viewModel: AIReviewViewModel
    let isRetry: Bool

    /// 안내 줄 앞 아이콘(screens-b.md 7.2): clock / iphone / bell.
    private static let icons = ["clock", "iphone", "bell"]

    var body: some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
            Text(isRetry ? AIReviewCopy.startTitleRetry : AIReviewCopy.startTitle)
                .font(ChalkakFont.title3)
                .foregroundStyle(ChalkakColor.textPrimary)
                .padding(.top, ChalkakSpacing.sm)
            VStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
                ForEach(Array(AIReviewCopy.startLines.enumerated()), id: \.element) { index, line in
                    HStack(spacing: ChalkakSpacing.md) {
                        Image(systemName: Self.icons[min(index, Self.icons.count - 1)])
                            .font(.system(size: 17))
                            .foregroundStyle(ChalkakColor.iconSecondary)
                            .frame(width: 36, height: 36)
                            .background(ChalkakColor.surfaceElevated, in: Circle())
                            .accessibilityHidden(true)
                        Text(line)
                            .font(ChalkakFont.subheadlineSemibold)
                            .foregroundStyle(ChalkakColor.textPrimary)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                }
            }
            .padding(ChalkakSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ChalkakColor.background, in: RoundedRectangle(cornerRadius: ChalkakRadius.large))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("ai-start-sheet.description")
            Spacer(minLength: ChalkakSpacing.md)
            ChalkakButton(
                title: AIReviewCopy.startConfirm,
                action: { Task { await viewModel.confirmStart() } },
                isEnabled: viewModel.phase != .requesting,
                fillsWidth: true
            )
            .accessibilityIdentifier("ai-start-sheet.start-button")
            AISheetCloseButton(identifier: "ai-start-sheet.close-button") { viewModel.dismissSheet() }
        }
        .padding(.horizontal, ChalkakSpacing.xl)
        .padding(.top, ChalkakSpacing.xl)
        .padding(.bottom, ChalkakSpacing.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ChalkakSheetSurface.contentBackground.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ai-start-sheet.root")
    }
}

// MARK: 결과 시트

private struct AIResultSheet: View {
    let viewModel: AIReviewViewModel
    let result: AIReviewResult
    @State private var showsCriteriaDialog = false

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: ChalkakSpacing.xl) {
                        scoreHeader
                        criteriaList
                        if result.distinctivePerspective {
                            Text(AIReviewCopy.perspectiveBadge)
                                .font(ChalkakFont.captionSemibold)
                                .foregroundStyle(ChalkakColor.onActionPrimary)
                                .padding(.horizontal, ChalkakSpacing.sm)
                                .padding(.vertical, ChalkakSpacing.xs)
                                .background(ChalkakColor.actionPrimary, in: RoundedRectangle(cornerRadius: ChalkakRadius.small))
                                .accessibilityIdentifier("ai-result-sheet.distinctive-badge")
                        }
                        Text(result.feedback.summary)
                            .font(ChalkakFont.title3)
                            .foregroundStyle(ChalkakColor.textPrimary)
                            .accessibilityIdentifier("ai-result-sheet.feedback-summary")
                        section(AIReviewCopy.strengthTitle, text: result.feedback.strength, identifier: "ai-result-sheet.feedback-strength")
                        section(AIReviewCopy.weaknessTitle, text: result.feedback.weakness, identifier: "ai-result-sheet.feedback-weakness")
                        section(AIReviewCopy.suggestionTitle, text: result.feedback.suggestion, identifier: "ai-result-sheet.feedback-suggestion")
                    }
                    .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                    .padding(.top, ChalkakSpacing.xl)
                    .padding(.bottom, ChalkakSpacing.lg)
                }
                AISheetCloseButton(identifier: "ai-result-sheet.close-button") { viewModel.dismissSheet() }
                    .padding(.horizontal, ChalkakSpacing.screenHorizontal)
                    .padding(.bottom, ChalkakSpacing.sm)
            }
            if showsCriteriaDialog {
                ChalkakDialog(
                    identifier: "ai-result-sheet.criteria-dialog",
                    title: AIReviewCopy.criteriaDialogTitle,
                    message: result.criteria.map(\.label).joined(separator: "\n")
                ) {
                    ChalkakDialogButton(title: AIReviewCopy.failedConfirm, identifier: "ai-result-sheet.criteria-dialog-confirm-button") {
                        showsCriteriaDialog = false
                    }
                }
            }
        }
        .background(ChalkakSheetSurface.contentBackground.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ai-result-sheet.root")
    }

    /// 점수 링(84, 선 8, 트랙 calendarCell, 진행 actionPrimary, 12시 시작) + 숫자 title1. screens-b.md 7.3
    private var scoreHeader: some View {
        HStack(spacing: ChalkakSpacing.lg) {
            ZStack {
                Circle().stroke(ChalkakColor.calendarCell, lineWidth: 8)
                Circle()
                    .trim(from: 0, to: CGFloat(min(max(result.overallScore, 0), 10) / 10))
                    .stroke(ChalkakColor.actionPrimary, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text(AIReviewCopy.scoreText(result.overallScore))
                    .font(ChalkakFont.title1)
                    .foregroundStyle(ChalkakColor.textPrimary)
                    .accessibilityLabel(AIReviewCopy.scoreAccessibility(result.overallScore))
                    .accessibilityIdentifier("ai-result-sheet.overall-score")
            }
            .frame(width: 84, height: 84)
            Text("/ 10")
                .font(ChalkakFont.callout)
                .foregroundStyle(ChalkakColor.textSecondary)
                .accessibilityHidden(true)
            Spacer(minLength: 0)
            Button { showsCriteriaDialog = true } label: {
                Image(systemName: "questionmark.circle")
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(ChalkakColor.iconPrimary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(AIReviewCopy.criteriaDialogTitle)
            .accessibilityIdentifier("ai-result-sheet.criteria-info-button")
        }
    }

    private var criteriaList: some View {
        VStack(spacing: ChalkakSpacing.md) {
            ForEach(result.criteria, id: \.key) { criterion in
                VStack(spacing: ChalkakSpacing.xs) {
                    HStack {
                        Text(criterion.label)
                            .font(ChalkakFont.subheadline)
                            .foregroundStyle(ChalkakColor.textPrimary)
                        Spacer(minLength: 0)
                        Text(AIReviewCopy.scoreText(criterion.score))
                            .font(ChalkakFont.subheadline)
                            .foregroundStyle(ChalkakColor.textSecondary)
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(ChalkakColor.calendarCell)
                            Capsule()
                                .fill(ChalkakColor.actionPrimary)
                                .frame(width: geo.size.width * CGFloat(min(max(criterion.score, 0), 10) / 10))
                        }
                    }
                    .frame(height: 6)
                    .accessibilityHidden(true)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("ai-result-sheet.criteria-item-\(criterion.key)")
            }
        }
    }

    private func section(_ title: String, text: String, identifier: String) -> some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.xs) {
            Text(title)
                .font(ChalkakFont.footnoteSemibold)
                .foregroundStyle(ChalkakColor.textPrimary)
            Text(text)
                .font(ChalkakFont.subheadline)
                .foregroundStyle(ChalkakColor.textSecondary)
                .lineSpacing(ChalkakSpacing.xs)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(identifier)
        }
    }
}

// MARK: 실패 시트

private struct AIFailedSheet: View {
    let viewModel: AIReviewViewModel
    let reason: String?

    var body: some View {
        VStack(spacing: ChalkakSpacing.lg) {
            Text(AIReviewCopy.failedTitle)
                .font(ChalkakFont.title3)
                .foregroundStyle(ChalkakColor.textPrimary)
                .multilineTextAlignment(.center)
                .padding(.top, ChalkakSpacing.xl)
            if let reason {
                Text(reason)
                    .font(ChalkakFont.subheadline)
                    .foregroundStyle(ChalkakColor.textSecondary)
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("ai-failed-sheet.message")
            }
            Spacer(minLength: ChalkakSpacing.md)
            ChalkakDialogButton(title: AIReviewCopy.failedConfirm, identifier: "ai-failed-sheet.confirm-button") {
                viewModel.dismissSheet()
            }
        }
        .padding(.horizontal, ChalkakSpacing.xl)
        .padding(.bottom, ChalkakSpacing.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ChalkakSheetSurface.contentBackground.ignoresSafeArea())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ai-failed-sheet.root")
    }
}
