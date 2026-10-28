package com.stonefive.chalkak.ui.settings

import androidx.compose.runtime.Composable
import kr.chalkak.feature.auth.AccountActions
import kr.chalkak.feature.onboarding.SignatureCardStateHolder
import kr.chalkak.feature.settings.PushSettingsStateHolder
import kr.chalkak.feature.settings.SettingsStateHolder

/**
 * The four holders that make up the settings tab. [SettingsStateHolder] fans out to the other three but keeps them private, while the
 * route needs their state and effects too (card image, switches, confirm dialog), so the app factory returns all of them together.
 * The holders are built once per settings visit scope (`MainDependencies.newSettingsHolders`) and share one coroutine scope.
 */
class SettingsHolders(
    val settings: SettingsStateHolder,
    val signatureCard: SignatureCardStateHolder,
    val push: PushSettingsStateHolder,
    val account: AccountActions,
)

/**
 * Web view slot of the legal document sheet (settings terms / privacy rows): composed afresh for every load attempt, reports its
 * result through the two callbacks. The default draws nothing, so JVM tests need no WebView.
 */
typealias LegalWebContent = @Composable (url: String, onLoaded: () -> Unit, onFailed: () -> Unit) -> Unit
