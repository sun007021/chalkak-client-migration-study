import Foundation

/// URL 경로 세그먼트·쿼리 이름/값 공통 인코딩. RFC 3986 비예약 문자만 그대로 두고 나머지(공백·`+`·`&`·`=`·비 ASCII 포함)는 UTF-8 바이트 단위로 `%XX`.
enum PercentEncoding {
    private static let unreserved = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~".utf8)
    private static let hex = Array("0123456789ABCDEF".utf8)

    static func encode(_ text: String) -> String {
        var out: [UInt8] = []
        for byte in text.utf8 {
            if unreserved.contains(byte) {
                out.append(byte)
            } else {
                out.append(UInt8(ascii: "%"))
                out.append(hex[Int(byte >> 4)])
                out.append(hex[Int(byte & 0x0F)])
            }
        }
        return String(decoding: out, as: UTF8.self)
    }
}
