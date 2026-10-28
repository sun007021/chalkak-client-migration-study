package com.stonefive.chalkak.ui.main

import com.stonefive.chalkak.copy.Copy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kr.chalkak.feature.home.HomeEffect
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.NavOutcome
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.upload.UploadCopyKeys
import kr.chalkak.feature.upload.UploadGateEffect

/**
 * Executes what the main area's inputs ask for and what the [NavigationController] answers: toasts for blocked guest actions, the
 * upload entry gate, scroll-to-top requests, home effects and system back. The composables only forward events here.
 *
 * Analytics are never sent from here: the controller owns `screen_view` / `bottom_navigation_selected` (D-22).
 */
class MainCoordinator(
    private val nav: NavigationController,
    private val deps: MainDependencies,
    private val session: MainSession,
    private val copy: Copy,
    private val showToast: (String) -> Unit,
    private val exitApp: () -> Unit,
) {
    /** Bottom bar tab tap. Re-selecting home scrolls home to the top (TC-NAV-009) although the controller answers Ignored for it. */
    fun onTabClick(tab: Tab) {
        val wasOnHome = nav.top == Route.TabRoot(Tab.Home)
        when (val outcome = nav.onTabSelected(tab)) {
            is NavOutcome.Blocked -> showToast(copy[outcome.copyKey])
            is NavOutcome.ScrollToTop -> if (outcome.tab == Tab.Display) session.displayScroll.request()
            NavOutcome.Ignored -> if (tab == Tab.Home && wasOnHome) session.homeScroll.request()
            else -> Unit
        }
    }

    /** Upload button / hero upload: at most one `deps.uploadGate.enter()` runs at a time (the controller ignores taps meanwhile). */
    fun onUploadClick() {
        when (val outcome = nav.onUploadButton()) {
            is NavOutcome.Blocked -> showToast(copy[outcome.copyKey])
            NavOutcome.StartUploadGate -> session.scope.launch {
                val effect = try {
                    deps.uploadGate.enter()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    UploadGateEffect.Toast(0, UploadCopyKeys.GATE_CHECK_FAILED)
                }
                if (effect is UploadGateEffect.Toast) showToast(copy[effect.copyKey])
                // LoginRequired: the 401 also arrives as AuthEvent.GoToLogin, which ends the session (the controller then drops this result).
                nav.onUploadGateFinished(effect is UploadGateEffect.Open)
            }
            else -> Unit
        }
    }

    fun onSystemBack() {
        if (nav.onSystemBack() == NavOutcome.ExitApp) exitApp()
    }

    fun onHomeEffect(effect: HomeEffect) {
        when (effect) {
            is HomeEffect.ShowToast -> showToast(copy[effect.copyKey])
            HomeEffect.OpenUpload -> onUploadClick()
            is HomeEffect.OpenFeed -> open(Route.Feed(effect.postId, if (effect.seed != null) FeedSource.Display else FeedSource.ById))
            is HomeEffect.OpenDisplay -> onTabClick(Tab.Display)
            is HomeEffect.OpenRecord -> onTabClick(Tab.Record)
            HomeEffect.OpenNotifications -> open(Route.Notifications)
            is HomeEffect.OpenIssue -> {
                session.issueBanner = effect.banner
                open(Route.BannerWeb)
            }
        }
    }

    /** "이번 주 기록 보러가기": the record tab. */
    fun onWeekMore() = onTabClick(Tab.Record)

    private fun open(route: Route) {
        val outcome = nav.open(route)
        if (outcome is NavOutcome.Blocked) showToast(copy[outcome.copyKey])
    }
}
