import SwiftUI
import UIKit
import ChalkakCore
import ChalkakData
import ChalkakFeatures

/// 기록 달력을 PNG 한 장으로 그린다(REQ-REC-037). 썸네일은 내려받아 그리고, 받지 못한 칸은 빈 칸으로 둔다.
struct CalendarImageRenderer: CalendarImageRendering {
    func renderPNG(of snapshot: RecordCalendarSnapshot) async throws -> Data {
        var urls: [KSTDate: URL] = [:]
        for post in snapshot.posts {
            if let url = post.thumbnailImageURL { urls[post.topicDate] = url }
        }
        let thumbnails = await Self.download(urls)
        try Task.checkCancellation()
        let month = snapshot.month
        let png = await MainActor.run { () -> Data? in
            let content = CalendarImageContent(month: month, thumbnails: thumbnails)
            let renderer = ImageRenderer(content: content)
            renderer.scale = 3
            return renderer.uiImage?.pngData()
        }
        guard let png else { throw CalendarImageRenderError.failed }
        return png
    }

    private static func download(_ urls: [KSTDate: URL]) async -> [KSTDate: Data] {
        await withTaskGroup(of: (KSTDate, Data?).self) { group in
            for (date, url) in urls {
                group.addTask {
                    let data = try? await URLSession.shared.data(from: url).0
                    return (date, data)
                }
            }
            var result: [KSTDate: Data] = [:]
            for await (date, data) in group {
                if let data { result[date] = data }
            }
            return result
        }
    }
}

enum CalendarImageRenderError: Error {
    case failed
}

/// 저장 이미지의 모양: 연월 제목, 요일 머리글, 날짜 격자(사진이 있는 날은 썸네일).
private struct CalendarImageContent: View {
    let month: YearMonth
    let thumbnails: [KSTDate: Data]

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        let layout = RecordMonthLayout(month: month)
        VStack(spacing: 16) {
            Text("\(month.year)년 \(month.month)월")
                .font(ChalkakFont.headlineBold)
                .foregroundStyle(ChalkakColor.textPrimary)
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(Array(RecordCopy.weekdayLabels.enumerated()), id: \.offset) { _, label in
                    Text(label)
                        .font(ChalkakFont.caption)
                        .foregroundStyle(ChalkakColor.textSecondary)
                }
                ForEach(Array(layout.cells.enumerated()), id: \.offset) { _, date in
                    cell(date)
                }
            }
        }
        .padding(20)
        .frame(width: 360)
        .background(ChalkakColor.background)
    }

    @ViewBuilder
    private func cell(_ date: KSTDate?) -> some View {
        if let date {
            ZStack {
                RoundedRectangle(cornerRadius: 6).fill(ChalkakColor.calendarCell)
                if let data = thumbnails[date], let image = UIImage(data: data) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                }
                Text("\(date.day)")
                    .font(ChalkakFont.caption)
                    .foregroundStyle(thumbnails[date] == nil ? ChalkakColor.textPrimary : ChalkakColor.textOnImage)
            }
            .aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 6))
        } else {
            Color.clear.aspectRatio(1, contentMode: .fit)
        }
    }
}
