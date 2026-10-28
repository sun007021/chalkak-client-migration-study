package com.stonefive.chalkak.ui.main

import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.ui.upload.UploadResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.feature.home.HomeEffect
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.NavOutcome
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.upload.UploadCopyKeys
import kr.chalkak.feature.upload.SuccessInfo
import kr.chalkak.feature.upload.UploadGateEffect
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.image.PickedPhoto

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
                if (effect is UploadGateEffect.Open) {
                    session.uploadTopicDate = effect.topicDate
                    session.uploadSerial++
                }
                // LoginRequired: the 401 also arrives as AuthEvent.GoToLogin, which ends the session (the controller then drops this result).
                nav.onUploadGateFinished(effect is UploadGateEffect.Open)
            }
            else -> Unit
        }
    }

    /** The upload holder reported a created post: the upload route is replaced by the success route (REQ-NAV-037). */
    fun onUploadSucceeded(info: SuccessInfo, photo: PickedPhoto?, edit: PhotoEdit) {
        session.uploadResult = UploadResult(info, photo, edit)
        nav.onUploadSubmitted(info.topicDate)
    }

    /** "확인했어요.": the display tab of the uploaded date; upload and success screens are gone (REQ-NAV-038). */
    fun onUploadSuccessConfirmed() {
        nav.onUploadSuccessConfirmed()
        session.uploadResult = null
    }

    fun onSystemBack() {
        if (nav.onSystemBack() == NavOutcome.ExitApp) exitApp()
    }

    fun onHomeEffect(effect: HomeEffect) {
        when (effect) {
            is HomeEffect.ShowToast -> showToast(copy[effect.copyKey])
            HomeEffect.OpenUpload -> onUploadClick()
            is HomeEffect.OpenFeed -> {
                val seed = effect.seed
                if (seed != null) session.feedSeeds[effect.postId] = seed.toSeed()
                open(Route.Feed(effect.postId, if (seed != null) FeedSource.Display else FeedSource.ById))
            }
            // REQ-HOME-031: the section's date, most popular first. The tab itself is selected like a bottom bar tap.
            is HomeEffect.OpenDisplay -> {
                session.displayEntry = DisplayEntry(session.displayEntry.seq + 1, effect.date, PostSort.POPULAR)
                onTabClick(Tab.Display)
            }
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

    /** Display list item tapped: the feed opens seeded with that item. */
    fun onDisplayOpenFeed(post: PostSummary) {
        session.feedSeeds[post.id] = post
        open(Route.Feed(post.id, FeedSource.Display))
    }

    /** The post was deleted: the feed on top is popped and the deletion toast shown (REQ-NAV-039/040). */
    fun onFeedDeleted(@Suppress("UNUSED_PARAMETER") postId: String, toastCopyKey: String) {
        val outcome = nav.onPostDeleted()
        showToast(copy[(outcome as? NavOutcome.Navigated)?.toastCopyKey ?: toastCopyKey])
    }

    /** The post is gone (404 on edit or like): the detail closes, the lists already dropped it through `PostChanges`. */
    fun onFeedClosed() {
        if (nav.top is Route.Feed) onSystemBack()
    }

    /**
     * A 401 that survived the refresh: the network layer also reports it as `AuthEvent.GoToLogin`, which `ChalkakRoot` turns into
     * `nav.onSessionEnded()` (new session key, signup context discarded). Doing it here as well would end the session twice.
     */
    fun onFeedLoginRequired() = Unit

    private fun open(route: Route) {
        val outcome = nav.open(route)
        if (outcome is NavOutcome.Blocked) showToast(copy[outcome.copyKey])
        if (outcome !is NavOutcome.Navigated && outcome !is NavOutcome.Replaced && route is Route.Feed) session.feedSeeds.remove(route.postId)
    }

    private fun HomePost.toSeed() = PostSummary(
        id = id,
        authorId = authorId,
        originalImageUrl = originalImageUrl,
        thumbnailImageUrl = thumbnailImageUrl,
        // Home cards carry no signature; the detail answer fills it in (the feed draws no signature for a blank url).
        signatureOriginalImageUrl = "",
        title = title,
        likeCount = likeCount,
        isLiked = isLiked,
        isMine = isMine,
    )
}
