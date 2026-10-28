package com.stonefive.chalkak.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.stonefive.chalkak.ui.components.ToastUi
import kr.chalkak.feature.auth.BootState
import kr.chalkak.feature.navigation.NavigationController

/**
 * What the app host keeps across configuration changes (held by `rememberStateHolder`, so it lives in a ViewModel): the current
 * [NavigationController] and the boot result it was built from, the signup attempt counter that keys the signup holders, the PNG
 * between the drawing and the preview screen, and the toast on screen.
 */
class RootSession {
    private var navigationKey: BootState? = null
    private var navigation: NavigationController? = null

    /** Bumped when [replaceNavigation] swaps the controller, so the host recomposes with the new one. */
    var navigationVersion by mutableIntStateOf(0)
        private set

    /**
     * Identifies the main area's holders (home, ...). A new login starts a new value, so an account never sees the previous account's
     * holders; boot straight into the main area keeps the initial value.
     */
    var mainEpoch by mutableIntStateOf(0)
        private set

    /** New value per login attempt that ends in the terms screen: fresh terms, pad and signup holders (consent is memory-only, D-25). */
    var signupAttempt by mutableIntStateOf(0)
        private set

    /** PNG of the confirmed drawing, for the preview screen. Memory only. */
    var signaturePng: ByteArray? = null

    var toast by mutableStateOf<ToastUi?>(null)
        private set
    private var toastCounter = 0L

    /** The controller for [boot]; built by [create] (and started: initial `screen_view`) only when the boot result changed. */
    fun navigationFor(boot: BootState, create: () -> NavigationController): NavigationController {
        navigation?.takeIf { navigationKey == boot }?.let { return it }
        return create().also {
            navigationKey = boot
            navigation = it
            it.start()
        }
    }

    /** Guest "둘러보기" from the login screen: a new controller in another [kr.chalkak.feature.navigation.AccessMode]. */
    fun replaceNavigation(next: NavigationController) {
        navigation = next
        next.start()
        navigationVersion++
    }

    /** The login screen is on: whatever main area follows belongs to a new session. */
    fun newMainSession() {
        mainEpoch++
    }

    fun beginSignupAttempt() {
        signupAttempt++
        signaturePng = null
    }

    /** Signup ended (account created, or back to login): the drawing PNG must not outlive it. */
    fun endSignupFlow() {
        signaturePng = null
    }

    fun showToast(text: String) {
        toast = ToastUi(++toastCounter, text)
    }

    fun expireToast(id: Long) {
        if (toast?.id == id) toast = null
    }
}
