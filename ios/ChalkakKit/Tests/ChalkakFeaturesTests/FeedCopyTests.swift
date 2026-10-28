import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakFeatures
import ChalkakTestSupport

@Suite("FeedCopy")
struct FeedCopyTests {
    @Test("shared/copy/ko.json과 문구가 같다(좋아요·게스트·공통·전시)")
    func matchesSharedCopy() throws {
        let pairs: [(String, String)] = [
            ("like.error.generic", FeedCopy.likeGeneric),
            ("like.error.banned", FeedCopy.likeBanned),
            ("guest.like", FeedCopy.guestLike),
            ("guest.feed", FeedCopy.guestFeed),
            ("common.error.network", FeedCopy.networkError),
            ("feed.edit.error.login", FeedCopy.loginRequired),
            ("display.error", FeedCopy.displayError),
            ("display.empty", FeedCopy.displayEmpty),
            ("display.date-missing", FeedCopy.dateMissing),
        ]
        for (key, text) in pairs { #expect(try SharedCopy.require(key) == text, "\(key)") }
    }

    @Test("shared/copy/ko.json과 문구가 같다(상세·수정·삭제)")
    func matchesSharedCopyFeed() throws {
        let pairs: [(String, String)] = [
            ("feed.edit.untitled", FeedCopy.untitled),
            ("feed.not-found", FeedCopy.postNotFound),
            ("feed.error.load", FeedCopy.postLoadError),
            ("feed.error.invalid", FeedCopy.postInvalid),
            ("feed.edit.error.state", FeedCopy.editStateError),
            ("feed.edit.error.banned", FeedCopy.editBanned),
            ("feed.edit.error.forbidden", FeedCopy.editForbidden),
            ("feed.edit.error.other", FeedCopy.editOtherError),
            ("feed.edit.title-too-long", FeedCopy.editTitleTooLong),
            ("feed.edit.success", FeedCopy.editSuccess),
            ("feed.delete.error.state", FeedCopy.deleteStateError),
            ("feed.delete.error.forbidden", FeedCopy.deleteForbidden),
            ("feed.delete.error.other", FeedCopy.deleteOtherError),
            ("feed.delete.success", FeedCopy.deleteSuccess),
        ]
        for (key, text) in pairs { #expect(try SharedCopy.require(key) == text, "\(key)") }
    }

    @Test("shared/copy/ko.json과 문구가 같다(전시 화면)")
    func matchesSharedCopyDisplayScreen() throws {
        let pairs: [(String, String)] = [
            ("display.header.desc-latest", DisplayCopy.descLatest),
            ("display.header.desc-archive", DisplayCopy.descArchive),
            ("display.sort.recent", DisplayCopy.sortRecent),
            ("display.sort.popular", DisplayCopy.sortPopular),
            ("display.sort.random", DisplayCopy.sortRandom),
            ("display.nav.previous", DisplayCopy.navPrevious),
            ("display.nav.next", DisplayCopy.navNext),
            ("display.picker.title", DisplayCopy.pickerTitle),
            ("display.retry", DisplayCopy.retry),
            ("common.confirm", DisplayCopy.pickerConfirm),
            ("common.close", AIReviewCopy.close),
        ]
        for (key, text) in pairs { #expect(try SharedCopy.require(key) == text, "\(key)") }
        #expect(DisplayCopy.sortLabel(.random) == "랜덤순")
        #expect(DisplayCopy.pickerYear(2026) == (try SharedCopy.require("display.picker.year")).replacingOccurrences(of: "{n}", with: "2026"))
        #expect(DisplayCopy.pickerMonth(9) == (try SharedCopy.require("display.picker.month")).replacingOccurrences(of: "{n}", with: "9"))
        #expect(DisplayCopy.pickerDay(17) == (try SharedCopy.require("display.picker.day")).replacingOccurrences(of: "{n}", with: "17"))
    }

    struct MessageCase: Sendable, CustomTestStringConvertible {
        let operation: FeedOperation
        let failure: FeedFailure
        let expected: String?
        var testDescription: String { "\(operation) \(failure)" }
    }

    static let messageCases: [MessageCase] = [
        .init(operation: .updateTitle, failure: .badRequest(message: "x"), expected: "수정할 수 없는 상태이거나 주제 참여 기간이 끝났어요"),
        .init(operation: .updateTitle, failure: .banned, expected: "이용이 제한되어 제목을 수정할 수 없어요."),
        .init(operation: .updateTitle, failure: .notFound, expected: "게시물을 찾을 수 없어요"),
        .init(operation: .updateTitle, failure: .unauthorized, expected: "로그인이 필요해요"),
        .init(operation: .updateTitle, failure: .network, expected: "네트워크 연결을 확인해 주세요."),
        .init(operation: .updateTitle, failure: .server(status: 500), expected: "게시물 제목을 수정하지 못했어요"),
        .init(operation: .deletePost, failure: .badRequest(message: nil), expected: "삭제할 수 없는 상태의 게시물이에요"),
        .init(operation: .deletePost, failure: .notOwner, expected: "본인이 작성한 게시물만 삭제할 수 있어요"),
        .init(operation: .deletePost, failure: .notFound, expected: "게시물을 찾을 수 없어요"),
        .init(operation: .deletePost, failure: .unauthorized, expected: "로그인이 필요해요"),
        .init(operation: .deletePost, failure: .network, expected: "네트워크 연결을 확인해 주세요."),
        .init(operation: .deletePost, failure: .server(status: 500), expected: "게시물을 삭제하지 못했어요"),
        .init(operation: .postDetail, failure: .notFound, expected: "게시물을 찾을 수 없어요"),
        .init(operation: .postDetail, failure: .network, expected: "네트워크 연결을 확인해 주세요."),
        .init(operation: .postDetail, failure: .invalidResponse, expected: "게시물 정보를 불러오지 못했어요"),
        .init(operation: .postDetail, failure: .server(status: 500), expected: "게시물을 불러오지 못했어요"),
        .init(operation: .postDetail, failure: .unauthorized, expected: nil),
        .init(operation: .like, failure: .banned, expected: "이용이 제한되어 좋아요를 누를 수 없어요."),
        .init(operation: .like, failure: .notFound, expected: "좋아요를 반영하지 못했어요"),
        .init(operation: .like, failure: .server(status: 500), expected: "좋아요를 반영하지 못했어요"),
        .init(operation: .unlike, failure: .network, expected: "좋아요를 반영하지 못했어요"),
        .init(operation: .like, failure: .invalidResponse, expected: "좋아요를 반영하지 못했어요"),
        .init(operation: .like, failure: .unauthorized, expected: nil),
        .init(operation: .listPosts, failure: .network, expected: "네트워크 연결을 확인해 주세요."),
        .init(operation: .listPosts, failure: .server(status: 500), expected: "전시를 불러오지 못했어요"),
        .init(operation: .topic, failure: .badRequest(message: nil), expected: "전시를 불러오지 못했어요"),
        .init(operation: .topic, failure: .notFound, expected: "해당 날짜의 전시가 없어요"),
        .init(operation: .listPosts, failure: .notFound, expected: "해당 날짜의 전시가 없어요"),
        .init(operation: .listPosts, failure: .badRequest(message: "x"), expected: "전시를 불러오지 못했어요"),
        .init(operation: .listPosts, failure: .unauthorized, expected: nil),
        .init(operation: .unlike, failure: .notFound, expected: "좋아요를 반영하지 못했어요"),
        .init(operation: .unlike, failure: .forbidden, expected: "좋아요를 반영하지 못했어요"),
        .init(operation: .updateTitle, failure: .titleTooLong, expected: "제목은 10자 이하여야 합니다."),
    ]

    @Test("TC-FEED-027 TC-FEED-029 TC-FEED-040 TC-FEED-042 호출·실패별 문구", arguments: messageCases)
    func messages(testCase: MessageCase) {
        #expect(FeedCopy.message(for: testCase.failure, operation: testCase.operation) == testCase.expected)
    }

    @Test("TC-FEED-013 제목이 nil·공백이면 '무제'")
    func displayTitle() {
        #expect(FeedCopy.displayTitle(nil) == "무제")
        #expect(FeedCopy.displayTitle("") == "무제")
        #expect(FeedCopy.displayTitle("   ") == "무제")
        #expect(FeedCopy.displayTitle("비 오는 날") == "비 오는 날")
    }

    @Test("TC-FEED-013 TC-DISP-041 날짜 라벨은 topicDate 문자열 기준 '{M}월 {d}일의 주제'")
    func dateLabel() {
        #expect(FeedCopy.topicDateLabel(KSTDate(year: 2026, month: 9, day: 7)!) == "9월 7일의 주제")
        #expect(FeedCopy.topicDateLabel(KSTDate(year: 2026, month: 10, day: 27)!) == "10월 27일의 주제")
    }

    @Test("TC-FEED-013 접근성 설명")
    func photoAccessibility() {
        #expect(FeedCopy.photoAccessibilityLabel(title: "은행잎") == "작품 이미지: 은행잎")
        #expect(FeedCopy.photoAccessibilityLabel(title: nil) == "무제 작품 이미지")
        #expect(FeedCopy.photoAccessibilityLabel(title: "  ") == "무제 작품 이미지")
    }
}
