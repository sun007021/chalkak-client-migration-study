import Foundation
import Testing
@testable import ChalkakFeatures

@Suite("AUTH 카카오 nonce")
struct NonceTests {
    private let urlSafe = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")

    @Test("TC-AUTH-002 시스템 난수로 100회 만들면 모두 다르고 43자 base64url(패딩 없음)이다")
    func rawNonceShapeAndUniqueness() {
        let factory = KakaoNonceFactory(random: SystemRandomBytes(), hasher: PureSwiftSHA256())
        let raws = (0..<100).map { _ in factory.make().raw }
        #expect(Set(raws).count == 100)
        for raw in raws {
            #expect(raw.count == 43)
            #expect(raw.allSatisfy { urlSafe.contains($0) })
        }
    }

    @Test("TC-AUTH-002 32바이트를 base64url(패딩 없음)로 인코딩한다")
    func rawNonceEncoding() {
        let allOnes = KakaoNonceFactory(random: FixedRandomBytes(byte: 0xFF), hasher: RecordingHasher())
        #expect(allOnes.make().raw == "__________________________________________8")
        let ramp = KakaoNonceFactory(random: SequenceRamp(), hasher: RecordingHasher())
        #expect(ramp.make().raw == "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8")
    }

    @Test("TC-AUTH-003 해시는 rawNonce의 UTF-8 바이트를 hasher에 넘기고 소문자 hex 64자로 만든다")
    func hashedNonceUsesRawUTF8() {
        let hasher = RecordingHasher()
        let nonce = KakaoNonceFactory(random: FixedRandomBytes(byte: 0xFF), hasher: hasher).make()
        #expect(hasher.recordedInputs == [Array(nonce.raw.utf8)])
        #expect(nonce.hashed == String(repeating: "ab", count: 32))
        #expect(nonce.hashed != nonce.raw)
    }

    @Test("TC-AUTH-003 알려진 입력의 SHA-256 소문자 hex가 표준 값과 같다", arguments: [
        ("", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
        ("abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
        ("한글nonce", "1fd856bfed42365ada3350f8dbfaf1b32da8bf7f5686fa21db9af389e47b4945"),
        ("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"),
    ])
    func sha256Vectors(input: String, expected: String) {
        #expect(hex(PureSwiftSHA256().sha256(Array(input.utf8))) == expected)
    }

    @Test("TC-AUTH-003 SHA-256 패딩 경계(55·56·64바이트)와 여러 블록 입력")
    func sha256Boundaries() {
        let hasher = PureSwiftSHA256()
        #expect(hex(hasher.sha256([UInt8](repeating: 0x61, count: 55))) == "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318")
        #expect(hex(hasher.sha256([UInt8](repeating: 0x61, count: 56))) == "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a")
        #expect(hex(hasher.sha256([UInt8](repeating: 0x61, count: 64))) == "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb")
        #expect(hex(hasher.sha256([UInt8](repeating: 0x61, count: 1000))) == "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3")
    }

    @Test("TC-AUTH-003 팩토리가 실제 해시로 만든 hashed는 sha256(raw) 소문자 hex 64자")
    func factoryWithRealHasher() {
        let nonce = KakaoNonceFactory(random: FixedRandomBytes(byte: 0xFF), hasher: PureSwiftSHA256()).make()
        #expect(nonce.raw == "__________________________________________8")
        #expect(nonce.hashed == "225f7e75329dd45aa354975d73987319309393af3a4c6733bc13601a4f1b8796")
        #expect(nonce.hashed.count == 64)
    }
}

private struct SequenceRamp: RandomBytesSource {
    func randomBytes(count: Int) -> [UInt8] { (0..<count).map { UInt8($0) } }
}

@Suite("AUTH 카카오 비밀값 문자열화 차단")
struct KakaoSecretRedactionTests {
    private func assertRedacted(_ value: Any, secrets: [String]) {
        for text in ["\(value)", String(describing: value), String(reflecting: value)] {
            for secret in secrets { #expect(!text.contains(secret)) }
            #expect(text.contains("<redacted>"))
        }
    }

    @Test("TC-AUTH-004 KakaoNonce는 raw·hashed 값이 문자열화에 새지 않는다")
    func nonceRedacted() {
        assertRedacted(KakaoNonce(raw: "SECRET-RAW", hashed: "SECRET-HASH"), secrets: ["SECRET-RAW", "SECRET-HASH"])
    }

    @Test("TC-AUTH-008 KakaoCredential은 idToken이 문자열화에 새지 않는다")
    func credentialRedacted() {
        assertRedacted(KakaoCredential(idToken: "SECRET-ID"), secrets: ["SECRET-ID"])
    }

    @Test("TC-AUTH-010 SignUpContext는 계속 값이 새지 않는다")
    func signUpContextRedacted() {
        assertRedacted(SignUpContext(idToken: "SECRET-ID", rawNonce: "SECRET-NONCE"), secrets: ["SECRET-ID", "SECRET-NONCE"])
    }
}
