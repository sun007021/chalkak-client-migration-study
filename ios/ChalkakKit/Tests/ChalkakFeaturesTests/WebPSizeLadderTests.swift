import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("UPL WebP 품질·크기 사다리", .timeLimit(.minutes(1)))
struct WebPSizeLadderTests {
    private let maxBytes: Int64 = 5_242_880
    private let start = PixelSize(width: 2000, height: 1200)

    /// `quality <= okQuality`인 시도만 maxBytes 이하가 되는 압축기.
    private func compressor(okQuality: Int) -> FakeCompressor {
        let limit = Int(maxBytes)
        return FakeCompressor { attempt in attempt.quality <= okQuality ? limit : limit + 1 }
    }

    @Test("TC-UPL-037 90에서 maxBytes 이하면 90 한 번만 시도하고 끝낸다")
    func firstQualityFits() async throws {
        let fake = compressor(okQuality: 90)
        let result = try await WebPSizeLadder.encode(startingAt: start, maxBytes: maxBytes, using: fake)
        #expect(await fake.attempts.map(\.quality) == [90])
        #expect(result.quality == 90)
        #expect(result.size == start)
        #expect(result.data.count == Int(maxBytes))
    }

    @Test("TC-UPL-037 품질 사다리는 90 → 80 → 60 → 40 순서이고 처음 maxBytes 이하가 되는 품질에서 멈춘다", arguments: [
        (80, [90, 80]), (60, [90, 80, 60]), (40, [90, 80, 60, 40]),
    ])
    func ladderOrder(okQuality: Int, expected: [Int]) async throws {
        let fake = compressor(okQuality: okQuality)
        let result = try await WebPSizeLadder.encode(startingAt: start, maxBytes: maxBytes, using: fake)
        #expect(await fake.attempts.map(\.quality) == expected)
        #expect(await fake.attempts.allSatisfy { $0.size == start })
        #expect(result.quality == okQuality)
    }


    @Test("TC-UPL-038 모든 품질에서 초과하면 0.85배씩 3번 줄여 총 4라운드(16회) 시도하고 SizeLimitExceeded로 실패한다")
    func allRoundsExhausted() async {
        let fake = FakeCompressor { _ in Int(5_242_880) + 1 }
        await #expect(throws: WebPEncodingError.sizeLimitExceeded) {
            try await WebPSizeLadder.encode(startingAt: start, maxBytes: maxBytes, using: fake)
        }
        let attempts = await fake.attempts
        #expect(attempts.count == 16)
        let sizes = [PixelSize(width: 2000, height: 1200), PixelSize(width: 1700, height: 1020), PixelSize(width: 1445, height: 867), PixelSize(width: 1228, height: 737)]
        let expected = sizes.flatMap { size in [90, 80, 60, 40].map { FakeCompressor.Attempt(quality: $0, size: size) } }
        #expect(attempts == expected)
    }

    @Test("TC-UPL-038 중간 라운드에서 성공하면 즉시 끝내고 그 라운드의 크기·품질을 돌려준다")
    func succeedsInMiddleRound() async throws {
        // 라운드 2(1445×867)부터 품질 60 이하가 통과한다.
        let limit = Int(maxBytes)
        let fake = FakeCompressor { attempt in attempt.size.width <= 1445 && attempt.quality <= 60 ? limit : limit + 1 }
        let result = try await WebPSizeLadder.encode(startingAt: start, maxBytes: maxBytes, using: fake)
        #expect(result.size == PixelSize(width: 1445, height: 867))
        #expect(result.quality == 60)
        #expect(await fake.attempts.count == 4 + 4 + 3)
    }

    @Test("TC-UPL-038 라운드 크기는 처음 크기 × 0.85^n을 각 변 반올림한 값이다")
    func roundSizes() {
        #expect(WebPSizeLadder.size(PixelSize(width: 1000, height: 800), round: 0) == PixelSize(width: 1000, height: 800))
        #expect(WebPSizeLadder.size(PixelSize(width: 1000, height: 800), round: 1) == PixelSize(width: 850, height: 680))
        #expect(WebPSizeLadder.size(start, round: 2) == PixelSize(width: 1445, height: 867))
        #expect(WebPSizeLadder.size(start, round: 3) == PixelSize(width: 1228, height: 737))
        #expect(AppConstants.webpDownscaleFactor == 0.85)
        #expect(AppConstants.webpMaxDownscaleAttempts == 3)
    }

    @Test("TC-UPL-039 정확히 maxBytes면 성공(이하 허용)이고 maxBytes+1이면 그 품질은 실패로 보고 다음 단계로 간다")
    func boundaryBytes() async throws {
        let limit = Int(maxBytes)
        let exact = FakeCompressor { _ in limit }
        let ok = try await WebPSizeLadder.encode(startingAt: start, maxBytes: maxBytes, using: exact)
        #expect(ok.quality == 90)
        #expect(await exact.attempts.count == 1)

        let over = FakeCompressor { attempt in attempt.quality == 90 ? limit + 1 : limit }
        let next = try await WebPSizeLadder.encode(startingAt: start, maxBytes: maxBytes, using: over)
        #expect(next.quality == 80)
        #expect(await over.attempts.map(\.quality) == [90, 80])
    }

    @Test("TC-UPL-039 maxBytes는 인자로 받은 정책 값을 쓴다(작은 maxBytes면 더 낮은 품질까지 내려간다)")
    func usesGivenMaxBytes() async throws {
        let fake = FakeCompressor { attempt in attempt.quality == 90 ? 2_000_000 : (attempt.quality == 80 ? 900_000 : 100_000) }
        let result = try await WebPSizeLadder.encode(startingAt: start, maxBytes: 1_000_000, using: fake)
        #expect(result.quality == 80)
    }

    @Test("TC-UPL-046 인코딩 중 취소하면 결과를 돌려주지 않고 사다리의 후속 압축을 부르지 않는다")
    func cancellationStopsLadder() async {
        let hold = Hold()
        let fake = FakeCompressor { _ in Int(5_242_880) + 1 }
        await fake.setHold(hold)
        let task = Task { try await WebPSizeLadder.encode(startingAt: start, maxBytes: maxBytes, using: fake) }
        #expect(await EventWait.signal(fake.entered, before: task))
        task.cancel()
        let result = await task.result
        if case .success = result { Issue.record("취소되면 결과가 없어야 한다") }
        if case let .failure(error) = result { #expect(error is CancellationError) }
        #expect(await fake.attempts.count == 1)
    }
}

@Suite("UPL 업로드 입력 크기", .timeLimit(.minutes(1)))
struct PostImageSizingTests {
    @Test("TC-UPL-034 긴 변이 4096 이하가 될 때까지 2배씩 줄인다", arguments: [
        (PixelSize(width: 8000, height: 6000), PixelSize(width: 4000, height: 3000), 2),
        (PixelSize(width: 4608, height: 3456), PixelSize(width: 2304, height: 1728), 2),
        (PixelSize(width: 4097, height: 3000), PixelSize(width: 2049, height: 1500), 2),
        (PixelSize(width: 4096, height: 3072), PixelSize(width: 4096, height: 3072), 1),
        (PixelSize(width: 20000, height: 10000), PixelSize(width: 2500, height: 1250), 8),
        (PixelSize(width: 3000, height: 8000), PixelSize(width: 1500, height: 4000), 2),
    ])
    func sampling(source: PixelSize, expected: PixelSize, factor: Int) {
        #expect(PostImageSizing.downsampleFactor(for: source) == factor)
        #expect(PostImageSizing.sampledSize(for: source) == expected)
    }

    @Test("TC-UPL-034 작은 사진은 확대하지 않는다(배율 1)")
    func neverUpscale() {
        let small = PixelSize(width: 1600, height: 1200)
        #expect(PostImageSizing.downsampleFactor(for: small) == 1)
        #expect(PostImageSizing.sampledSize(for: small) == small)
        #expect(AppConstants.postImageMaxLongEdge == 4096)
    }
}

@Suite("UPL WebP 사다리 취소 경계", .timeLimit(.minutes(1)))
struct WebPSizeLadderCancellationTests {
    @Test("TC-UPL-046 취소를 무시하고 돌아온 마지막 압축이 maxBytes 이하여도 취소됐으면 결과를 돌려주지 않는다")
    func cancelledJustBeforeReturn() async {
        let hold = Hold(ignoringCancellation: true)
        let fake = FakeCompressor { _ in 10 }
        await fake.setHold(hold)
        let task = Task { try await WebPSizeLadder.encode(startingAt: PixelSize(width: 100, height: 100), maxBytes: 5_242_880, using: fake) }
        #expect(await EventWait.signal(fake.entered, before: task))
        task.cancel()
        await hold.open()
        let result = await task.result
        if case .success = result { Issue.record("취소되면 결과가 없어야 한다") }
        if case let .failure(error) = result { #expect(error is CancellationError) }
    }
}
