package kr.chalkak.feature.navigation

sealed interface ExternalUrlAction {
    /** Hand the URL to the Kakao SDK login callback; no screen change by itself. */
    data object KakaoLoginCallback : ExternalUrlAction

    /** Do nothing: no screen opens, the app only comes to the foreground (REQ-NAV-034). */
    data object Ignore : ExternalUrlAction
}

/** The app has no deep links or universal links; the only external scheme is the Kakao login callback (REQ-NAV-034, TC-NAV-045). */
object ExternalUrlRouter {
    /**
     * `kakao<appKey>://oauth...` -> [ExternalUrlAction.KakaoLoginCallback] (the Kakao SDK redirect `kakao{NATIVE_APP_KEY}://oauth`: scheme `kakao` plus a non-empty key, host `oauth`,
     * scheme case-insensitive). Everything else (`chalkak://...`, https links, garbage, empty) -> [ExternalUrlAction.Ignore]. Never throws.
     */
    fun route(url: String): ExternalUrlAction =
        if (KAKAO_CALLBACK.matches(url)) ExternalUrlAction.KakaoLoginCallback else ExternalUrlAction.Ignore

    private val KAKAO_CALLBACK = Regex("""^kakao[a-z0-9]+://oauth([/?#].*)?$""", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
}
