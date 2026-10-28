import Foundation
import ChalkakCore

/// 게시물 제목 규칙(D-01): 앞뒤 공백을 제거한 뒤 unicode scalar(code point) 수가 10 이하. 공백만이면 제목 없음(nil).
public enum PostTitle {
    /// 앞뒤 공백(유니코드 공백·줄바꿈, NBSP·U+3000 포함)을 제거한 값. 비면 nil.
    public static func normalized(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// 제거 후 code point 수.
    public static func length(of raw: String) -> Int {
        normalized(raw)?.unicodeScalars.count ?? 0
    }

    /// 전송해도 되는 길이인가(제거 후 ≤ `AppConstants.postTitleMax`).
    public static func isValid(_ raw: String) -> Bool {
        length(of: raw) <= AppConstants.postTitleMax
    }

    /// 입력 필드용: 제거 후 길이가 10을 넘지 않는 가장 긴 앞부분을 돌려준다(타이핑은 막고 붙여넣기는 10 code point까지만 받는다).
    /// 이미 규칙을 지키면 입력을 그대로(공백 포함) 돌려준다. grapheme가 아니라 code point로 센다.
    public static func clampedInput(_ raw: String) -> String {
        if isValid(raw) { return raw }
        var kept = String.UnicodeScalarView()
        var contentCount = 0
        for scalar in raw.unicodeScalars {
            let isSpace = CharacterSet.whitespacesAndNewlines.contains(scalar)
            if contentCount == 0 && isSpace {
                kept.append(scalar)   // 앞쪽 공백은 세지 않는다
            } else if contentCount < AppConstants.postTitleMax {
                kept.append(scalar)
                contentCount += 1
            } else if isSpace {
                kept.append(scalar)   // 10개를 채운 뒤의 공백은 뒤쪽 공백으로 제거된다
            } else {
                break
            }
        }
        return String(kept)
    }
}
