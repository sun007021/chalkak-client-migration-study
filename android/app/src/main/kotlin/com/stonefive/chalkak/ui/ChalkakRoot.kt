package com.stonefive.chalkak.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.font.FontWeight
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.copy.ProvideCopy
import com.stonefive.chalkak.ui.boot.SplashScreen
import com.stonefive.chalkak.ui.boot.UpdateGateDialog
import com.stonefive.chalkak.ui.components.ToastLayer
import com.stonefive.chalkak.ui.login.LoginRoute
import com.stonefive.chalkak.ui.signature.SignatureScreen
import com.stonefive.chalkak.ui.signature.SignupPreviewRoute
import com.stonefive.chalkak.ui.terms.LegalWebView
import com.stonefive.chalkak.ui.terms.TermsRoute
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import com.stonefive.chalkak.viewmodel.rememberStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kr.chalkak.core.network.AuthEvent
import kr.chalkak.feature.auth.BootGate
import kr.chalkak.feature.auth.BootState
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.auth.LoginReason
import kr.chalkak.feature.auth.LoginStateHolder
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.NavOutcome
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.SignaturePadEffect
import kr.chalkak.feature.onboarding.SignaturePadStateHolder
import kr.chalkak.feature.onboarding.SignatureMode
import kr.chalkak.feature.onboarding.SignupContext
import kr.chalkak.feature.onboarding.SignupStateHolder
import kr.chalkak.feature.onboarding.TermsStateHolder

/** Placeholder root for previews: the splash wordmark under the theme. */
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

/** Holder factories for the signup flow behind the terms screen (drawing -> preview -> account). */
class SignupDependencies(
    val newPadHolder: () -> SignaturePadStateHolder,
    val newSignupHolder: (CoroutineScope) -> SignupStateHolder,
)

/**
 * Everything the app host needs, as factories so JVM tests can inject fakes (A2). The host never builds a holder itself.
 *
 * - [bootGate]: already started by the caller (Activity/AppContainer); the host only collects `BootGate.state`.
 * - [newNavigation]: called once per boot result: `Home(mode)` -> `(mode, TabRoot(Home))`, `Login` -> `(Guest or Member, Login)`.
 *   The host renders `NavigationController.state` from then on (Login/Terms/OnboardingSignature/OnboardingSignaturePreview/TabRoot).
 * - [signupContext]: filled by the host when login ends in `GoTerms(pending)`, discarded when terms go back.
 * - [mainContent]: the main (home) area; A2 ships [MainPlaceholder] (`home.root`), later PRs replace it.
 * - [signup]: the drawing/preview holders; null leaves the signature routes unreachable (tests that stop at the terms screen).
 * - [authEvents]: `AuthEvent.GoToLogin` (a 401 that survived the refresh) ends the session on the navigation controller too.
 * - [onExitApp]: system back on a root screen.
 */
class RootDependencies(
    val bootGate: BootGate,
    val newNavigation: (mode: AccessMode, initial: Route) -> NavigationController,
    val newLoginHolder: (CoroutineScope) -> LoginStateHolder,
    val newTermsHolder: (CoroutineScope) -> TermsStateHolder,
    val signupContext: SignupContext,
    val legalDocumentOpener: LegalDocumentOpener,
    val mainContent: @Composable (mode: AccessMode) -> Unit = { MainPlaceholder() },
    val signup: SignupDependencies? = null,
    val authEvents: Flow<AuthEvent> = emptyFlow(),
    val onExitApp: () -> Unit = {},
)

/** `home.root` placeholder until the home PR lands. */
@Composable
fun MainPlaceholder(modifier: Modifier = Modifier) {
    val copy = LocalCopy.current
    Box(modifier = modifier.fillMaxSize().testTag("home.root"), contentAlignment = Alignment.Center) {
        Text(text = copy["app.name"], style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    }
}

/**
 * App host. Routing: `BootState.Splash` -> [SplashScreen]; `UpdateRequired` -> blocking [UpdateGateDialog] over nothing else
 * (no login, no main); `Login`/`Home` -> screens by `NavigationController.state.top` (Login -> `LoginRoute`, Terms -> `TermsRoute`,
 * signature routes, TabRoot -> `deps.mainContent`). Login `GoHome` -> `onAuthenticated()`/guest main, `GoTerms` ->
 * `signupContext.begin` + `open(Route.Terms)`. `testTagsAsResourceId` is set here only (testids.md section 1).
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
fun ChalkakRoot(copy: Copy, deps: RootDependencies, modifier: Modifier = Modifier) {
    ProvideCopy(copy) {
        val session = rememberStateHolder { RootSession() }
        val boot by deps.bootGate.state.collectAsState()
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(ChalkakTheme.colors.background)
                .semantics { testTagsAsResourceId = true },
        ) {
            when (val current = boot) {
                BootState.Splash -> SplashScreen()
                BootState.UpdateRequired -> UpdateGateDialog(onUpdateClick = deps.bootGate::onUpdateClicked)
                is BootState.Login, is BootState.Home -> RoutedScreens(current, deps, session)
            }
            ToastLayer(toast = session.toast, onExpired = session::expireToast)
        }
    }
}

@Composable
private fun RoutedScreens(boot: BootState, deps: RootDependencies, session: RootSession) {
    val version = session.navigationVersion
    val nav = remember(boot, version) {
        session.navigationFor(boot) {
            when (boot) {
                is BootState.Home -> deps.newNavigation(boot.mode.toAccessMode(), Route.TabRoot(Tab.Home))
                is BootState.Login -> deps.newNavigation(
                    if (boot.reason == LoginReason.Reauthentication) AccessMode.Member else AccessMode.Guest,
                    Route.Login,
                )
                else -> error("not a routed boot state: $boot")
            }
        }
    }
    val navState by nav.state.collectAsState()

    LaunchedEffect(nav) {
        deps.authEvents.collect { event ->
            if (event == AuthEvent.GoToLogin && nav.top != Route.Login) nav.onSessionEnded()
        }
    }
    BackHandler { if (nav.onSystemBack() == NavOutcome.ExitApp) deps.onExitApp() }

    when (navState.top) {
        Route.Login -> LoginScreenHost(nav, deps, session)
        Route.Terms -> TermsScreenHost(nav, deps, session)
        Route.OnboardingSignature -> SignatureScreenHost(nav, deps, session)
        Route.OnboardingSignaturePreview -> SignaturePreviewHost(nav, deps, session)
        else -> deps.mainContent(navState.accessMode)
    }
}

@Composable
private fun LoginScreenHost(nav: NavigationController, deps: RootDependencies, session: RootSession) {
    val holder = rememberStateHolder { scope -> deps.newLoginHolder(scope) }
    LoginRoute(
        holder = holder,
        onGoHome = { mode ->
            when (mode) {
                HomeMode.Member -> nav.onAuthenticated()
                HomeMode.Guest -> session.replaceNavigation(deps.newNavigation(AccessMode.Guest, Route.TabRoot(Tab.Home)))
            }
        },
        onGoTerms = { pending ->
            session.beginSignupAttempt()
            deps.signupContext.begin(pending.idToken, pending.rawNonce)
            nav.open(Route.Terms)
        },
    )
}

@Composable
private fun TermsScreenHost(nav: NavigationController, deps: RootDependencies, session: RootSession) {
    val holder = rememberStateHolder("terms-${session.signupAttempt}") { scope -> deps.newTermsHolder(scope) }
    TermsRoute(
        holder = holder,
        opener = deps.legalDocumentOpener,
        onGoSignature = { if (deps.signup != null) nav.open(Route.OnboardingSignature) },
        onBackToLogin = { nav.onSystemBack() },
        legalWeb = { url, onLoaded, onFailed -> LegalWebView(url, onLoaded, onFailed, Modifier.fillMaxSize()) },
    )
}

@Composable
private fun SignatureScreenHost(nav: NavigationController, deps: RootDependencies, session: RootSession) {
    val signup = deps.signup ?: return
    val pad = rememberStateHolder("pad-${session.signupAttempt}") { _ -> signup.newPadHolder() }
    val state by pad.state.collectAsState()
    LaunchedEffect(pad) {
        pad.effects.collect { effect ->
            if (effect is SignaturePadEffect.ShowPreview) {
                session.signaturePng = effect.png
                nav.open(Route.OnboardingSignaturePreview)
            }
        }
    }
    SignatureScreen(
        mode = SignatureMode.Signup,
        state = state,
        onUndo = pad::onUndo,
        onClear = pad::onClear,
        onConfirm = pad::onConfirm,
        onBack = { nav.onSystemBack() },
        onBeginStroke = pad::beginStroke,
        onExtendStroke = pad::extendStroke,
        onEndStroke = pad::endStroke,
    )
}

@Composable
private fun SignaturePreviewHost(nav: NavigationController, deps: RootDependencies, session: RootSession) {
    val signup = deps.signup ?: return
    val copy = LocalCopy.current
    val pad = rememberStateHolder("pad-${session.signupAttempt}") { _ -> signup.newPadHolder() }
    val holder = rememberStateHolder("signup-${session.signupAttempt}") { scope -> signup.newSignupHolder(scope) }
    val png = session.signaturePng ?: return
    val backToDrawing = {
        pad.onRedraw()
        nav.onSystemBack()
        Unit
    }
    BackHandler(onBack = backToDrawing)
    SignupPreviewRoute(
        holder = holder,
        png = png,
        onGoHome = { nav.onAuthenticated() },
        onBackToLogin = { copyKey ->
            nav.onSessionEnded()
            session.showToast(copy[copyKey])
        },
        onBackToDrawing = backToDrawing,
        onRedraw = backToDrawing,
    )
}

private fun HomeMode.toAccessMode(): AccessMode = when (this) {
    HomeMode.Member -> AccessMode.Member
    HomeMode.Guest -> AccessMode.Guest
}
