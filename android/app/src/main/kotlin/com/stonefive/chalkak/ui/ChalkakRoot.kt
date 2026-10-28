package com.stonefive.chalkak.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import kr.chalkak.feature.auth.BootGate
import kr.chalkak.feature.auth.LoginStateHolder
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.SignupContext
import kr.chalkak.feature.onboarding.TermsStateHolder
import kotlinx.coroutines.CoroutineScope
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.copy.ProvideCopy

/**
 * The single root of the app. `testTagsAsResourceId` is set here only, so every descendant `testTag` is visible to
 * Maestro as a resource-id (testids.md section 1). Screens arrive in later PRs; this is a placeholder.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
fun ChalkakRoot(copy: Copy, modifier: Modifier = Modifier) {
    ProvideCopy(copy) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .semantics { testTagsAsResourceId = true },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = copy["app.name"],
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("splash.logo"),
            )
        }
    }
}

/**
 * Everything the app host needs, as factories so JVM tests can inject fakes (A2). The host never builds a holder itself.
 *
 * - [bootGate]: already started by the caller (Activity/AppContainer); the host only collects `BootGate.state`.
 * - [newNavigation]: called once per boot result: `Home(mode)` -> `(mode, TabRoot(Home))`, `Login` -> `(Guest or Member, Login)`.
 *   The host renders `NavigationController.state` from then on (Login/Terms/OnboardingSignature/OnboardingSignaturePreview/TabRoot).
 * - [signupContext]: filled by the host when login ends in `GoTerms(pending)`, discarded when terms go back.
 * - [mainContent]: the main (home) area; A2 ships [MainPlaceholder] (`home.root`), later PRs replace it.
 */
class RootDependencies(
    val bootGate: BootGate,
    val newNavigation: (mode: AccessMode, initial: Route) -> NavigationController,
    val newLoginHolder: (CoroutineScope) -> LoginStateHolder,
    val newTermsHolder: (CoroutineScope) -> TermsStateHolder,
    val signupContext: SignupContext,
    val legalDocumentOpener: LegalDocumentOpener,
    val mainContent: @Composable (mode: AccessMode) -> Unit = { MainPlaceholder() },
)

/** `home.root` placeholder until the home PR lands. STUB (A2 TDD step 1). */
@Composable
fun MainPlaceholder(modifier: Modifier = Modifier) {
}

/**
 * App host. Routing: `BootState.Splash` -> [com.stonefive.chalkak.ui.boot.SplashScreen]; `UpdateRequired` -> blocking
 * `UpdateGateDialog` over nothing else (no login, no main); `Login`/`Home` -> screens by `NavigationController.state.top`
 * (Login -> `LoginRoute`, Terms -> `TermsRoute`, TabRoot -> `deps.mainContent`). Login `GoHome` -> `onAuthenticated()`/guest main,
 * `GoTerms` -> `signupContext.begin` + `open(Route.Terms)`. STUB (A2 TDD step 1).
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun ChalkakRoot(copy: Copy, deps: RootDependencies, modifier: Modifier = Modifier) {
}
