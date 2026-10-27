/// 확인 대화상자 문구(메시지, 확인·취소 버튼 제목).
public struct ConfirmationPrompt: Sendable, Equatable {
    public let message: String
    public let confirmTitle: String
    public let cancelTitle: String
    public init(message: String, confirmTitle: String, cancelTitle: String) {
        self.message = message
        self.confirmTitle = confirmTitle
        self.cancelTitle = cancelTitle
    }
}
