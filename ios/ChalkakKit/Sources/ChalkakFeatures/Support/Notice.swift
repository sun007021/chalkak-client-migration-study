/// 화면에 잠깐 보이는 알림(오류 문구, 토스트). 같은 문구가 연달아 나와도 `id`가 달라 새 알림으로 보인다.
public struct Notice: Sendable, Equatable {
    public let id: Int
    public let message: String
    public init(id: Int, message: String) {
        self.id = id
        self.message = message
    }
}

/// `Notice`에 고유 id를 붙이는 발급기. ViewModel이 하나씩 들고 쓴다.
public struct NoticeSequence: Sendable {
    private var lastId = 0
    public init() {}
    public mutating func make(_ message: String) -> Notice {
        lastId += 1
        return Notice(id: lastId, message: message)
    }
}
