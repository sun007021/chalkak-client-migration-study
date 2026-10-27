package kr.chalkak.core.common

/** D-01: length = Unicode code points of the trimmed text; max [AppConstants.POST_TITLE_MAX]. Never grapheme/UTF-16. */
object PostTitle {
    private const val EMPTY_DISPLAY = "무제"

    fun length(raw: String): Int = raw.trim().let { it.codePointCount(0, it.length) }

    fun isValid(raw: String): Boolean = length(raw) <= AppConstants.POST_TITLE_MAX

    /**
     * Result of a keystroke or paste: [proposed] when it fits, otherwise the trimmed text cut to 10 code points
     * (so typing an 11th code point is a no-op and a paste keeps only the first 10).
     */
    fun limitInput(proposed: String): String {
        if (isValid(proposed)) return proposed
        val trimmed = proposed.trim()
        return trimmed.substring(0, trimmed.offsetByCodePoints(0, AppConstants.POST_TITLE_MAX))
    }

    /** Value to send to the server: trimmed text, or null when blank. */
    fun toRequestValue(raw: String): String? = raw.trim().ifEmpty { null }

    /** Display text: "무제" when absent/blank. */
    fun displayText(title: String?): String = title?.trim()?.ifEmpty { null } ?: EMPTY_DISPLAY
}
