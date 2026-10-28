package kr.chalkak.feature.upload

import kr.chalkak.core.data.home.ModerationStatus

/** Object-particle choice for "‘{주제}’을/를 기록했어요." (REQ-UPL-060). */
object KoreanParticle {
    /** "을" when the last non-blank character is a Hangul syllable with a final consonant, else "를" (no final, not Hangul, or empty). Trailing whitespace is ignored. */
    fun objectParticle(word: String): String {
        val last = word.trimEnd().lastOrNull() ?: return NO_FINAL
        val index = last - HANGUL_FIRST
        return if (index in 0 until HANGUL_COUNT && index % FINALS_PER_SYLLABLE != 0) WITH_FINAL else NO_FINAL
    }

    private const val NO_FINAL = "를"
    private const val WITH_FINAL = "을"
    private const val HANGUL_FIRST = '가'
    private const val HANGUL_COUNT = 11172
    private const val FINALS_PER_SYLLABLE = 28
}

object UploadSuccessText {
    /** `‘{topic}’을 기록했어요.` / `‘{topic}’를 기록했어요.` (the topic is used as given inside the quotes). */
    fun title(topicTitle: String): String = "‘$topicTitle’${KoreanParticle.objectParticle(topicTitle)} 기록했어요."

    /** PENDING -> `upload.success.pending`; anything else (VALIDATING) -> `upload.success.validating` (REQ-UPL-061). */
    fun statusCopyKey(status: ModerationStatus): String =
        if (status == ModerationStatus.PENDING) UploadCopyKeys.SUCCESS_PENDING else UploadCopyKeys.SUCCESS_VALIDATING
}
