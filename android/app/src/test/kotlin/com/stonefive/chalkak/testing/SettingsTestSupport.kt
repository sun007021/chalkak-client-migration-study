package com.stonefive.chalkak.testing

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import com.stonefive.chalkak.platform.AndroidSignatureEncoder
import com.stonefive.chalkak.ui.settings.LegalWebContent
import com.stonefive.chalkak.ui.settings.SettingsHolders
import com.stonefive.chalkak.ui.signature.SignaturePadSpace
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.auth.AuthRepository
import kr.chalkak.core.data.auth.GuestFlagStore
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.data.onboarding.testing.FakeSignatureRepository
import kr.chalkak.core.data.onboarding.testing.FakeSignatureUploader
import kr.chalkak.core.data.settings.testing.FakeFeedbackRepository
import kr.chalkak.core.data.settings.testing.FakeNotificationSettingsRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.feature.auth.AccountActions
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.SignatureCardStateHolder
import kr.chalkak.feature.onboarding.SignatureChangeStateHolder
import kr.chalkak.feature.onboarding.SignatureMode
import kr.chalkak.feature.onboarding.SignaturePadStateHolder
import kr.chalkak.feature.settings.DeviceNotificationSettings
import kr.chalkak.feature.settings.FeedbackStateHolder
import kr.chalkak.feature.settings.NotificationPermission
import kr.chalkak.feature.settings.PushSettingsStateHolder
import kr.chalkak.feature.settings.SettingsStateHolder

/** Version string the fake settings holder shows (the app wires `BuildConfig.VERSION_NAME`). */
const val TEST_APP_VERSION = "9.8.7-test"

fun apiHttpFailure(status: Int, code: ErrorCode, message: String? = null) = ApiResult.Failure(ApiError.Http(status, code, message))

/** `logout()` and `withdraw()` only: counts the calls; a withdraw can be held on [withdrawGate] and answered from [withdrawResults]. */
class FakeAccountAuth : AuthRepository {
    var logoutCalls = 0
    var withdrawCalls = 0
    val withdrawResults = ArrayDeque<ApiResult<Unit>>()
    var withdrawGate: CompletableDeferred<Unit>? = null

    override suspend fun socialLogin(idToken: String, rawNonce: String): ApiResult<SocialLoginOutcome> = error("unused")

    override suspend fun logout() {
        logoutCalls++
    }

    override suspend fun withdraw(): ApiResult<Unit> {
        withdrawCalls++
        val result = withdrawResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
        withdrawGate?.await()
        return result
    }
}

class RecordingGuestFlags : GuestFlagStore {
    var clearCalls = 0
    override suspend fun markGuest() = Unit
    override suspend fun clearGuest() {
        clearCalls++
    }
}

/** Device notification permission stand-in: [permission] is what the switches see; the system prompt answers [requestAnswer]. */
class FakeDeviceNotifications(var permission: NotificationPermission = NotificationPermission.Granted) : DeviceNotificationSettings {
    var permissionChecks = 0
    var settingsOpened = 0
    var requestAnswer = NotificationPermission.Granted
    override fun permission(): NotificationPermission {
        permissionChecks++
        return permission
    }

    override suspend fun requestPermission(): NotificationPermission {
        permission = requestAnswer
        return requestAnswer
    }

    override fun openSystemSettings() {
        settingsOpened++
    }
}

enum class LegalWebMode { Loaded, Failed, Pending }

/**
 * Fakes behind the settings tab, the feedback screen and the change-signature flow (A9): fixture-like repositories with scripted
 * answers, and factories that build the real holders over them. `MainRig` hands these factories to `MainDependencies`.
 * Unscripted calls succeed (signature `thumbnail.png`, all switches on, 204, 201).
 */
class SettingsFakes {
    val signatures = FakeSignatureRepository()
    val signatureUploader = FakeSignatureUploader()
    val pushRepo = FakeNotificationSettingsRepository()
    val feedbackRepo = FakeFeedbackRepository()
    val auth = FakeAccountAuth()
    val guestFlags = RecordingGuestFlags()
    val device = FakeDeviceNotifications()
    val browser = FakeBrowser()
    val systemSettingsOpened = AtomicInteger()

    /** Every settings holder set / feedback holder / pad the app asked for, in order. */
    val holderSets = CopyOnWriteArrayList<SettingsHolders>()
    val feedbackHolders = CopyOnWriteArrayList<FeedbackStateHolder>()
    val pads = CopyOnWriteArrayList<SignaturePadStateHolder>()

    /** Web slot of the legal document sheet: records every url it was composed for and reports [legalWebMode]. */
    val legalWebUrls = CopyOnWriteArrayList<String>()
    @Volatile var legalWebMode = LegalWebMode.Loaded
    val legalWeb: LegalWebContent = { url, onLoaded, onFailed ->
        LaunchedEffect(Unit) {
            legalWebUrls += url
            when (legalWebMode) {
                LegalWebMode.Loaded -> onLoaded()
                LegalWebMode.Failed -> onFailed()
                LegalWebMode.Pending -> Unit
            }
        }
        Box(Modifier.testTag("test.legal-web"))
    }

    /** The settings holder set of one tab scope. [analytics] stands for the tracker the app gives the holders (the controller sends the real `screen_view`). */
    fun holders(scope: CoroutineScope, mode: HomeMode, analytics: AnalyticsTracker = NoAnalytics): SettingsHolders {
        val guest = mode == HomeMode.Guest
        val card = SignatureCardStateHolder(scope, signatures, isGuest = guest)
        val push = PushSettingsStateHolder(scope, pushRepo, device)
        val account = AccountActions(scope, auth, guestFlags)
        val settings = SettingsStateHolder(scope, mode, card, push, account, analytics, LegalDocumentOpener(browser), TEST_APP_VERSION)
        return SettingsHolders(settings, card, push, account).also { holderSets += it }
    }

    fun feedbackHolder(scope: CoroutineScope, analytics: AnalyticsTracker = NoAnalytics) =
        FeedbackStateHolder(scope, feedbackRepo, analytics).also { feedbackHolders += it }

    /** Change-mode drawing pad over the real PNG encoder (the preview screen decodes the bytes). */
    fun newPad(analytics: AnalyticsTracker = NoAnalytics) =
        SignaturePadStateHolder(SignatureMode.Change, SignaturePadSpace, AndroidSignatureEncoder(), analytics).also { pads += it }

    fun changeHolder(scope: CoroutineScope) = SignatureChangeStateHolder(scope, signatures, signatureUploader)
}

/**
 * The real settings holders over [SettingsFakes] on an eager scope (route and screen tests; the stateless screens take their state from
 * here instead of hand-building a `PushSettingsUiState`). [analytics] stands for the holders' own tracker: in the app it drops everything.
 */
class SettingsHarness(val mode: HomeMode = HomeMode.Member, val fakes: SettingsFakes = SettingsFakes()) {
    private val holderScope = HolderScope()
    val analytics = RecordingAnalytics()
    val holders = fakes.holders(holderScope.scope, mode, analytics)

    fun close() = holderScope.close()
}

/** Feedback holder over [SettingsFakes.feedbackRepo] on an eager scope. */
class FeedbackHarness(val fakes: SettingsFakes = SettingsFakes()) {
    private val holderScope = HolderScope()
    val analytics = RecordingAnalytics()
    val holder = fakes.feedbackHolder(holderScope.scope, analytics)
    fun close() = holderScope.close()
}
