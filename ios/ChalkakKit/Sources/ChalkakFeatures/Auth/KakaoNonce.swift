import Foundation
import ChalkakData

/// 보안 난수 공급자. 테스트는 고정·순차 바이트를 주입한다.
public protocol RandomBytesSource: Sendable {
    func randomBytes(count: Int) -> [UInt8]
}

/// SHA-256. Linux 호환을 위해 순수 Swift 구현을 `PureSwiftSHA256`에 둔다.
public protocol SHA256Hashing: Sendable {
    func sha256(_ bytes: [UInt8]) -> [UInt8]
}

/// `SystemRandomNumberGenerator` 기반 구현.
public struct SystemRandomBytes: RandomBytesSource {
    public init() {}
    public func randomBytes(count: Int) -> [UInt8] {
        var generator = SystemRandomNumberGenerator()
        return (0..<count).map { _ in UInt8.random(in: .min ... .max, using: &generator) }
    }
}

/// 순수 Swift SHA-256(FIPS 180-4). 빈 입력, "abc", 448비트 메시지, 64바이트 경계 입력이 표준 벡터와 같아야 한다.
public struct PureSwiftSHA256: SHA256Hashing {
    private static let initialState: [UInt32] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]

    private static let roundConstants: [UInt32] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]

    public init() {}

    public func sha256(_ bytes: [UInt8]) -> [UInt8] {
        var state = Self.initialState
        for block in Self.paddedBlocks(of: bytes) { Self.compress(block, into: &state) }
        return state.flatMap { word in (0..<4).map { UInt8(truncatingIfNeeded: word >> UInt32(24 - 8 * $0)) } }
    }

    /// 0x80, 0 채움, 64비트 big-endian 비트 길이를 붙여 64바이트 블록들로 나눈다.
    private static func paddedBlocks(of bytes: [UInt8]) -> [ArraySlice<UInt8>] {
        var message = bytes
        message.append(0x80)
        while message.count % 64 != 56 { message.append(0) }
        let bitLength = UInt64(bytes.count) &* 8
        message.append(contentsOf: (0..<8).map { UInt8(truncatingIfNeeded: bitLength >> UInt64(56 - 8 * $0)) })
        return stride(from: 0, to: message.count, by: 64).map { message[$0..<$0 + 64] }
    }

    private static func compress(_ block: ArraySlice<UInt8>, into state: inout [UInt32]) {
        var w = [UInt32](repeating: 0, count: 64)
        let start = block.startIndex
        for t in 0..<16 {
            let i = start + t * 4
            w[t] = UInt32(block[i]) << 24 | UInt32(block[i + 1]) << 16 | UInt32(block[i + 2]) << 8 | UInt32(block[i + 3])
        }
        for t in 16..<64 {
            let s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >> 3)
            let s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >> 10)
            w[t] = w[t - 16] &+ s0 &+ w[t - 7] &+ s1
        }
        var a = state[0], b = state[1], c = state[2], d = state[3]
        var e = state[4], f = state[5], g = state[6], h = state[7]
        for t in 0..<64 {
            let s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
            let choose = (e & f) ^ (~e & g)
            let temp1 = h &+ s1 &+ choose &+ roundConstants[t] &+ w[t]
            let s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
            let majority = (a & b) ^ (a & c) ^ (b & c)
            let temp2 = s0 &+ majority
            h = g; g = f; f = e; e = d &+ temp1
            d = c; c = b; b = a; a = temp1 &+ temp2
        }
        let next = [a, b, c, d, e, f, g, h]
        for i in 0..<8 { state[i] = state[i] &+ next[i] }
    }

    private static func rotr(_ x: UInt32, _ n: UInt32) -> UInt32 { x >> n | x << (32 - n) }
}

/// 카카오 로그인 한 번의 nonce 쌍. `raw`는 서버에, `hashed`는 SDK에만 쓴다.
public struct KakaoNonce: Sendable, Equatable, RedactedDescription {
    public let raw: String
    public let hashed: String
    public init(raw: String, hashed: String) {
        self.raw = raw
        self.hashed = hashed
    }
}

/// 버튼을 누를 때마다 새 nonce를 만든다: 32바이트 난수 → base64url(패딩 없음, 43자) = raw, UTF-8(raw)의 SHA-256 → 소문자 hex 64자 = hashed.
public struct KakaoNonceFactory: Sendable {
    public static let randomByteCount = 32

    private let random: any RandomBytesSource
    private let hasher: any SHA256Hashing

    public init(random: any RandomBytesSource = SystemRandomBytes(), hasher: any SHA256Hashing = PureSwiftSHA256()) {
        self.random = random
        self.hasher = hasher
    }

    public func make() -> KakaoNonce {
        let raw = Self.base64URL(random.randomBytes(count: Self.randomByteCount))
        let digest = hasher.sha256(Array(raw.utf8))
        return KakaoNonce(raw: raw, hashed: digest.map { Self.hexByte($0) }.joined())
    }

    private static func base64URL(_ bytes: [UInt8]) -> String {
        Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func hexByte(_ byte: UInt8) -> String {
        let digits = Array("0123456789abcdef")
        return String([digits[Int(byte >> 4)], digits[Int(byte & 0x0f)]])
    }
}
