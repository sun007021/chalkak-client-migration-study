package kr.chalkak.core.network

fun interface NetworkLogSink {
    fun log(line: String)
}

/** Strips secrets from anything that might be logged (REQ-NET-031, TC-NET-055). */
object LogRedactor {
    private const val MASK = "***"
    private val BEARER = Regex("(?i)(bearer\\s+)[A-Za-z0-9._~+/=-]+")
    private val JSON_SECRET = Regex("\"(accessToken|refreshToken|idToken|rawNonce|fcmToken|signupToken)\"(\\s*:\\s*)\"[^\"]*\"")
    private val URL_QUERY = Regex("(https?://[^\\s?\"']+)\\?[^\\s\"']*")

    /** Masks Bearer tokens, JSON values of accessToken/refreshToken/idToken/rawNonce/fcmToken/signupToken, and presigned URL query strings. */
    fun redact(text: String): String = text
        .replace(BEARER) { it.groupValues[1] + MASK }
        .replace(JSON_SECRET) { "\"${it.groupValues[1]}\"${it.groupValues[2]}\"$MASK\"" }
        .replace(URL_QUERY) { it.groupValues[1] }
}
