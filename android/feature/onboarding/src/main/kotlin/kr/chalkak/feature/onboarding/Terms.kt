package kr.chalkak.feature.onboarding

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.analytics.AnalyticsTracker
import java.net.URI
import java.net.URISyntaxException

enum class TermsKind { Service, Privacy }

/** Consent is memory-only (D-25): a fresh holder always starts with everything off. */
data class TermsUiState(val agreeService: Boolean = false, val agreePrivacy: Boolean = false) {
    /** True exactly when both required items are on (REQ-ONB-004). */
    val agreeAll: Boolean get() = agreeService && agreePrivacy
    /** True only when both required items are on (REQ-ONB-005). */
    val nextEnabled: Boolean get() = agreeAll
}

sealed interface TermsEffect {
    /** "다음" with both items on. */
    data object GoSignature : TermsEffect
    /** Back from the terms screen: context discarded, login screen shown. */
    data object BackToLogin : TermsEffect
    /** "보기": the UI opens [url] (in-app web view or external, see [LegalDocuments.classify]). */
    data class OpenDocument(val kind: TermsKind, val url: String) : TermsEffect
}

class TermsStateHolder(
    private val context: SignupContext,
    private val analytics: AnalyticsTracker,
) {
    private val _state = MutableStateFlow(TermsUiState())
    val state: StateFlow<TermsUiState> = _state.asStateFlow()

    private val _effects = Channel<TermsEffect>(Channel.BUFFERED)
    val effects: Flow<TermsEffect> = _effects.receiveAsFlow()

    /** `screen_view(terms)`. */
    fun onScreenShown() = analytics.screenView("terms")

    /** `screen_view(terms_of_service)` / `screen_view(privacy_policy)` when the document is shown. */
    fun onDocumentShown(kind: TermsKind) = analytics.screenView(
        when (kind) {
            TermsKind.Service -> "terms_of_service"
            TermsKind.Privacy -> "privacy_policy"
        },
    )

    /** All on -> all off; otherwise all on (REQ-ONB-003). */
    fun onAgreeAllToggled() = _state.update {
        val agree = !it.agreeAll
        it.copy(agreeService = agree, agreePrivacy = agree)
    }

    fun onServiceToggled() = _state.update { it.copy(agreeService = !it.agreeService) }

    fun onPrivacyToggled() = _state.update { it.copy(agreePrivacy = !it.agreePrivacy) }

    /** Emits [TermsEffect.OpenDocument] with the shared TERMS_URLS value; does not change the checkboxes. */
    fun onViewClicked(kind: TermsKind) {
        _effects.trySend(TermsEffect.OpenDocument(kind, LegalDocuments.url(kind)))
    }

    /** Ignored unless [TermsUiState.nextEnabled]. */
    fun onNextClicked() {
        if (_state.value.nextEnabled) _effects.trySend(TermsEffect.GoSignature)
    }

    /** Discards the [SignupContext] (idToken/rawNonce) and the checkbox state, emits [TermsEffect.BackToLogin]. */
    fun onBack() {
        context.discard()
        _state.value = TermsUiState()
        _effects.trySend(TermsEffect.BackToLogin)
    }
}

enum class DocumentTarget { InApp, External, Rejected }

/** REQ-ONB-007/008, TC-ONB-009..011. */
object LegalDocuments {
    /** The shared constant URL (AppConstants.TERMS_URLS), identical for signup and settings. */
    fun url(kind: TermsKind): String {
        val key = when (kind) {
            TermsKind.Service -> "service"
            TermsKind.Privacy -> "privacy"
        }
        return AppConstants.TERMS_URLS.getValue(key)
    }

    /**
     * In-app only for `https` with host == or a subdomain of notion.com / notion.so / notion.site and no userinfo.
     * Other http(s) URLs -> External. Blank, unparsable or non-web schemes (javascript:, file:, ...) -> Rejected.
     */
    fun classify(url: String?): DocumentTarget {
        val uri = parse(url) ?: return DocumentTarget.Rejected
        val scheme = uri.scheme?.lowercase()
        val host = uri.host?.lowercase()
        if (host.isNullOrEmpty() || (scheme != "https" && scheme != "http")) return DocumentTarget.Rejected
        val inApp = scheme == "https" && uri.userInfo == null && isAllowedHost(host)
        return if (inApp) DocumentTarget.InApp else DocumentTarget.External
    }

    private fun parse(url: String?): URI? {
        if (url.isNullOrBlank()) return null
        return try {
            URI(url.trim())
        } catch (e: URISyntaxException) {
            null
        }
    }

    private fun isAllowedHost(host: String): Boolean =
        AppConstants.TERMS_ALLOWED_HOSTS.any { host == it || host.endsWith(".$it") }
}

sealed interface DocumentOpenResult {
    data class InApp(val url: String) : DocumentOpenResult
    data object OpenedExternally : DocumentOpenResult
    /** Shows `onb.terms.doc.cannot-open`. */
    data class CannotOpen(val copyKey: String) : DocumentOpenResult
}

class LegalDocumentOpener(private val browser: ExternalBrowser) {
    /** InApp -> InApp(url); External -> browser.open (false or throw -> CannotOpen); Rejected -> CannotOpen. */
    fun open(url: String?): DocumentOpenResult = when (LegalDocuments.classify(url)) {
        DocumentTarget.InApp -> DocumentOpenResult.InApp(url.orEmpty().trim())
        DocumentTarget.External -> openExternally(url.orEmpty().trim())
        DocumentTarget.Rejected -> cannotOpen()
    }

    private fun openExternally(url: String): DocumentOpenResult {
        val opened = try {
            browser.open(url)
        } catch (e: Exception) {
            false
        }
        return if (opened) DocumentOpenResult.OpenedExternally else cannotOpen()
    }

    private fun cannotOpen() = DocumentOpenResult.CannotOpen(OnbCopyKeys.TERMS_DOC_CANNOT_OPEN)
}
