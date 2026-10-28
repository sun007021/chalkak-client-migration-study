import SwiftUI
import ChalkakCore
import ChalkakData
import ChalkakFeatures

/// 이번 주 기록(일~토 7칸).
struct HomeWeekSection: View {
    let viewModel: HomeViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: ChalkakSpacing.lg) {
            HomeSectionHeader(title: HomeCopy.weeklyTitle, suffix: countLabel, suffixIdentifier: "home.week-count") {
                Button { viewModel.weekMoreTapped() } label: {
                    Text(HomeCopy.weeklyMore)
                        .font(ChalkakFont.subheadline)
                        .foregroundStyle(ChalkakColor.textSecondary)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("home.week-more-link")
            }
            switch viewModel.week {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, minHeight: 64)
            case .failed(let message):
                HomeSectionError(
                    message: message, messageIdentifier: "home.week-error", retryIdentifier: "home.week-retry-button",
                    onRetry: { Task { await viewModel.retry(.week) } }
                )
            case .ready(let record):
                HStack(spacing: ChalkakSpacing.sm) {
                    ForEach(record.days, id: \.date) { day in
                        cell(day)
                    }
                }
                .accessibilityElement(children: .contain)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.week-section")
    }

    private var countLabel: String? {
        if case .ready(let record) = viewModel.week { record.countLabel } else { nil }
    }

    private func cell(_ day: WeekDay) -> some View {
        ZStack {
            ChalkakColor.calendarCell
            if let post = day.post {
                GeometryReader { proxy in
                    ChalkakRemoteImage(url: post.thumbnailImageURL)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .clipped()
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("home.week-photo-\(day.date.string)")
                if post.status == .pending {
                    VStack {
                        Spacer(minLength: 0)
                        Text(HomeCopy.weeklyPending)
                            .font(ChalkakFont.caption)
                            .foregroundStyle(ChalkakColor.textOnImage)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 2)
                            .background(ChalkakColor.scrim)
                    }
                }
            } else {
                Text(day.weekdayLabel)
                    .font(ChalkakFont.caption)
                    .foregroundStyle(ChalkakColor.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: ChalkakRadius.small))
        .contentShape(Rectangle())
        .onTapGesture { viewModel.weekDayTapped(day.date) }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.week-day-\(day.date.string)")
    }
}
