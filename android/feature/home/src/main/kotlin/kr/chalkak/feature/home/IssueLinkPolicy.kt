package kr.chalkak.feature.home

import kr.chalkak.core.data.home.httpsUrlOrNull
import java.net.URI
import java.net.URISyntaxException

/** One navigation the banner web view is about to perform. */
data class LinkNavigation(
    val url: String,
    /** Document currently shown (null before the first load). Used to detect same-document anchors. */
    val currentUrl: String? = null,
    /** The very first load of the banner's `webViewUrl`. */
    val isInitialLoad: Boolean = false,
    /** A real user tap (not a redirect / script navigation). */
    val isUserTap: Boolean = false,
    val isMainFrame: Boolean = true,
    /** `target=_blank` / window.open. */
    val opensNewWindow: Boolean = false,
)

sealed interface LinkDecision {
    data object AllowInApp : LinkDecision
    data object OpenExternal : LinkDecision
    data object Block : LinkDecision
}

/** Pure link policy shared by all platforms (TC-BANR-017..022). */
object IssueLinkPolicy {
    fun decide(navigation: LinkNavigation): LinkDecision = when {
        navigation.isInitialLoad -> if (httpsUrlOrNull(navigation.url) != null) LinkDecision.AllowInApp else LinkDecision.Block
        !navigation.isMainFrame -> LinkDecision.AllowInApp
        !navigation.isUserTap -> LinkDecision.Block
        else -> decideTap(navigation)
    }

    private fun decideTap(navigation: LinkNavigation): LinkDecision {
        val target = hostedWebUri(navigation.url) ?: return LinkDecision.Block
        return if (!navigation.opensNewWindow && isAnchorInCurrentDocument(target, navigation.currentUrl)) {
            LinkDecision.AllowInApp
        } else {
            LinkDecision.OpenExternal
        }
    }

    /** A fragment-only change of the document that is already shown. */
    private fun isAnchorInCurrentDocument(target: URI, currentUrl: String?): Boolean {
        val current = currentUrl?.let(::hostedWebUri) ?: return false
        return target.rawFragment != null && withoutFragment(target) == withoutFragment(current)
    }

    private fun withoutFragment(uri: URI): String = uri.toString().substringBefore('#')

    /** http(s) address with a host, or null (other schemes, host-less and unparsable addresses). */
    private fun hostedWebUri(url: String): URI? {
        val uri = try {
            URI(url)
        } catch (_: URISyntaxException) {
            return null
        }
        val webScheme = uri.scheme.equals("https", ignoreCase = true) || uri.scheme.equals("http", ignoreCase = true)
        return uri.takeIf { webScheme && !it.host.isNullOrBlank() }
    }
}

/** Result of asking the system to open a URL in an external browser. */
enum class BrowserOpenResult { Opened, NoBrowser, Failed }

fun interface ExternalBrowser {
    fun open(url: String): BrowserOpenResult
}

/** Opens [LinkDecision.OpenExternal] links; on failure yields the toast copy key (TC-BANR-023). */
class ExternalLinkOpener(private val browser: ExternalBrowser) {
    /** Null when the browser opened; otherwise `banner.no-browser` or `banner.open-failed`. Never throws. */
    fun open(url: String): String? {
        val result = try {
            browser.open(url)
        } catch (e: Exception) {
            // The platform adapter must not crash the screen; report it like a failed launch.
            BrowserOpenResult.Failed
        }
        return when (result) {
            BrowserOpenResult.Opened -> null
            BrowserOpenResult.NoBrowser -> HomeCopyKeys.BANNER_NO_BROWSER
            BrowserOpenResult.Failed -> HomeCopyKeys.BANNER_OPEN_FAILED
        }
    }
}
