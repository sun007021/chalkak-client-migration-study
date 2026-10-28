package com.stonefive.chalkak.di

import android.content.Context
import com.stonefive.chalkak.BuildConfig
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.data.KeystoreRecordStorage
import com.stonefive.chalkak.data.KeystoreSecretCipher
import com.stonefive.chalkak.data.SecretCipher
import com.stonefive.chalkak.platform.PlatformAdapters
import com.stonefive.chalkak.ui.RootDependencies
import com.stonefive.chalkak.ui.SignupDependencies
import com.stonefive.chalkak.ui.signature.SignaturePadSpace
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kr.chalkak.core.common.Clock
import kr.chalkak.core.common.SystemClock
import kr.chalkak.core.data.auth.SecureNonceGenerator
import kr.chalkak.core.data.onboarding.DefaultSignupRepository
import kr.chalkak.core.data.onboarding.PresignedSignatureUploader
import kr.chalkak.core.data.onboarding.SignatureUploader
import kr.chalkak.core.data.onboarding.SignupRepository
import kr.chalkak.feature.auth.AuthEventRelay
import kr.chalkak.feature.auth.BootGate
import kr.chalkak.feature.auth.LoginStateHolder
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.SignatureMode
import kr.chalkak.feature.onboarding.SignaturePadStateHolder
import kr.chalkak.feature.onboarding.SignupContext
import kr.chalkak.feature.onboarding.SignupStateHolder
import kr.chalkak.feature.onboarding.TermsStateHolder
import java.util.concurrent.atomic.AtomicBoolean
import kr.chalkak.core.data.auth.AuthRepository
import kr.chalkak.core.data.auth.DefaultAuthRepository
import kr.chalkak.core.data.auth.GuestFlagStore
import kr.chalkak.core.data.auth.PersistentSessionStore
import kr.chalkak.core.data.auth.SecureRecordStorage
import kr.chalkak.core.data.auth.UserDataResetter
import kr.chalkak.core.data.home.BannerRepository
import kr.chalkak.core.data.home.DefaultBannerRepository
import kr.chalkak.core.data.home.DefaultHomeRepository
import kr.chalkak.core.data.home.HomeRepository
import android.util.Log
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import coil3.ImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import com.stonefive.chalkak.ui.components.CoilPhotoImage
import com.stonefive.chalkak.ui.components.CoilRemoteImage
import com.stonefive.chalkak.ui.issue.IssueWebView
import com.stonefive.chalkak.ui.main.MainDependencies
import com.stonefive.chalkak.ui.main.UploadEntryGate
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.aireview.AiReviewRepository
import kr.chalkak.core.data.aireview.DefaultAiReviewRepository
import kr.chalkak.feature.aireview.AiReviewStateHolder
import kr.chalkak.core.data.post.CurrentUser
import kr.chalkak.core.common.SystemMonotonicClock
import kr.chalkak.core.data.post.DefaultPostRepository
import kr.chalkak.core.data.upload.DefaultPostCreationRepository
import kr.chalkak.core.data.upload.PostCreationRepository
import kr.chalkak.core.data.upload.PostCreations
import kr.chalkak.core.data.upload.PostImageUploader
import kr.chalkak.core.data.upload.PresignedPostImageUploader
import kr.chalkak.feature.upload.PhotoUploadStateHolder
import kr.chalkak.feature.upload.image.PostImageEncoder
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostRepository
import kr.chalkak.core.network.guardedApiCall
import kr.chalkak.feature.upload.UploadGateEffect
import kr.chalkak.feature.upload.mapUploadGateResult
import kr.chalkak.feature.home.ExternalLinkOpener
import kr.chalkak.feature.home.HomeStateHolder
import kr.chalkak.feature.home.LikeControllerToggler
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.StoredSession
import kr.chalkak.feature.display.DisplayStateHolder
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.display.FeedStateHolder
import kotlinx.coroutines.launch
import java.time.LocalDate
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.network.ApiBaseUrl
import kr.chalkak.core.network.ApiBaseUrlResult
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.AuthEvent
import kr.chalkak.core.network.AuthEventSink
import kr.chalkak.core.network.HttpRefreshApi
import kr.chalkak.core.network.OkHttpFactory
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.TokenRefresher
import okhttp3.OkHttpClient
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Manual dependency graph (no Hilt). Everything platform specific is created here and handed to pure-Kotlin code
 * through the interfaces of `:core:*`. Repositories are added as their screens land; the rule is one `by lazy` each.
 *
 * Tests build it with [create]'s parameters replaced (`AppContainer(...)`), for example a fake [SecureRecordStorage].
 */
class AppContainer(
    val copy: Copy,
    val apiBaseUrlRaw: String,
    val clock: Clock,
    secureStorage: SecureRecordStorage,
    val applicationScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val okHttpBase: OkHttpClient = OkHttpClient(),
    /** Platform ports (Kakao, Play update, browser, PNG encoder, analytics, push). Default: inert stand-ins for JVM tests. */
    val platform: PlatformAdapters = PlatformAdapters.headless(),
    /** Remote photos (home, later display/feed). Null = images are not drawn (JVM tests that never show a screen). */
    val imageLoader: ImageLoader? = null,
) {
    /** `API_BASE_URL` is validated once (REQ-NET-001/002). An invalid value is a build configuration error: fail at start. */
    val apiBaseUrl: ApiBaseUrl = when (val parsed = ApiBaseUrl.parse(apiBaseUrlRaw)) {
        is ApiBaseUrlResult.Valid -> parsed.baseUrl
        is ApiBaseUrlResult.Invalid -> error("Invalid API_BASE_URL '$apiBaseUrlRaw': ${parsed.reason}")
    }

    private val persistentSessionStore = PersistentSessionStore(secureStorage)

    /** The stored session, remembering the user id of the last read/write so [currentUser] can answer without suspending. */
    private val trackedSessionStore = UserTrackingSessionStore(persistentSessionStore)
    val sessionStore: SessionStore get() = trackedSessionStore
    val guestFlagStore: GuestFlagStore get() = persistentSessionStore

    // A SharedFlow, not a Channel: BootGate and the navigation shell both collect, and every collector must see every event
    // (a Channel hands each event to one collector only). BootGate subscribes in start() before any API call can fail.
    private val authEventRelay = AuthEventRelay()

    /** `AuthEvent.GoToLogin` etc.; hot, no replay. Collected by [bootGate] and by the navigation shell. */
    val authEventFlow: Flow<AuthEvent> get() = authEventRelay.events

    /** Where the network layer reports auth events; tests use it to emit one. */
    internal val authEventSink: AuthEventSink get() = authEventRelay

    /** Screens register what must be dropped on account change (caches, unread state, ...). Run in registration order. */
    private val resetters = CopyOnWriteArrayList<UserDataResetter>()
    fun registerUserDataResetter(resetter: UserDataResetter) {
        resetters.addIfAbsent(resetter)
    }

    /** Every registered resetter runs even if an earlier one throws (stale data of the previous account must not survive); the first failure is rethrown. */
    val userDataResetter: UserDataResetter = UserDataResetter {
        var failure: Exception? = null
        for (resetter in resetters) {
            try {
                resetter.resetAll()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (failure == null) failure = e else failure.addSuppressed(e)
            }
        }
        failure?.let { throw it }
    }

    private val apiOkHttp: OkHttpClient by lazy { OkHttpFactory.apiClient(base = okHttpBase) }
    private val authFreeOkHttp: OkHttpClient by lazy { OkHttpFactory.apiClient(base = okHttpBase) }

    val apiClient: ApiClient by lazy {
        val sink = authEventSink
        val refresher = TokenRefresher(sessionStore, HttpRefreshApi(apiBaseUrl, authFreeOkHttp), clock, applicationScope, sink)
        ApiClient(apiBaseUrl, apiOkHttp, sessionStore, refresher, clock, sink)
    }

    private val uploadOkHttp: OkHttpClient by lazy { OkHttpFactory.uploadClient(base = okHttpBase) }
    val signupRepository: SignupRepository by lazy { DefaultSignupRepository(apiClient, sessionStore, userDataResetter, clock) }
    val signatureUploader: SignatureUploader by lazy { PresignedSignatureUploader(apiClient, uploadOkHttp) }

    /** Memory-only idToken/rawNonce of the login attempt that ends in the signup flow (D-25). */
    val signupContext = SignupContext()

    val authRepository: AuthRepository by lazy { DefaultAuthRepository(apiClient, sessionStore, userDataResetter, clock) }
    val homeRepository: HomeRepository by lazy { DefaultHomeRepository(apiClient) }
    val bannerRepository: BannerRepository by lazy { DefaultBannerRepository(apiClient) }
    val postRepository: PostRepository by lazy { DefaultPostRepository(apiClient) }
    val postCreationRepository: PostCreationRepository by lazy { DefaultPostCreationRepository(apiClient) }
    val postImageUploader: PostImageUploader by lazy { PresignedPostImageUploader(apiClient, uploadOkHttp) }

    /** "A post was created" announcements for home, record and the exhibition (REQ-UPL-063). Nothing stored, nothing to reset. */
    val postCreations = PostCreations()
    val aiReviewRepository: AiReviewRepository by lazy { DefaultAiReviewRepository(apiClient) }

    /** Removals and title edits every list must honour; cleared on account change together with [likeController]. */
    val postChanges = PostChanges()

    /** The navigation controller of the running session; the like controller asks it whether the user is signed in (guests never send). */
    @Volatile
    private var activeNavigation: NavigationController? = null

    /** One like state per post for home, display and feed (D-04). */
    val likeController: LikeController by lazy {
        LikeController(applicationScope, postRepository, { activeNavigation?.accessMode == AccessMode.Member }, postChanges)
    }

    init {
        // Account switch (logout, another login): the previous account's like states and removed-post marks must not survive (D-17).
        registerUserDataResetter {
            likeController.reset()
            postChanges.reset()
        }
    }

    /** Who is logged in (`null` = guest / unknown yet). Primed from secure storage in the background, then kept by every session read/write. */
    val currentUser: CurrentUser by lazy {
        applicationScope.launch { runCatching { trackedSessionStore.read() } }
        CurrentUser { trackedSessionStore.userId }
    }

    private val kstCalendar: KstCalendar by lazy { KstCalendar(clock) }

    /** Holder for the exhibition tab; [scope] is the owner's (ViewModel) scope. */
    fun newDisplayHolder(scope: CoroutineScope, initialDate: LocalDate? = null, initialSort: PostSort? = null): DisplayStateHolder =
        DisplayStateHolder(
            scope, postRepository, likeController, postChanges, currentUser, kstCalendar, platform.analytics, initialDate, initialSort,
        )

    /** Holder for one post detail. */
    fun newFeedHolder(scope: CoroutineScope, entry: FeedEntry): FeedStateHolder =
        FeedStateHolder(scope, postRepository, likeController, postChanges, currentUser, kstCalendar, platform.analytics, entry)

    /** AI feedback holder for one post detail (one per stacked feed). */
    fun newAiReviewHolder(scope: CoroutineScope): AiReviewStateHolder =
        AiReviewStateHolder(scope, aiReviewRepository, currentUser, kstCalendar, SystemMonotonicClock)

    /** BootGate state is touched on the main thread only (its contract). Created on first use. */
    private val mainScope: CoroutineScope by lazy { CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate) }

    val bootGate: BootGate by lazy {
        BootGate(
            scope = mainScope,
            clock = clock,
            sessionStore = sessionStore,
            updateChecker = platform.updateChecker,
            updateLauncher = platform.updateLauncher,
            preloader = platform.preloader,
            push = platform.push,
            resetter = userDataResetter,
            authEvents = authEventFlow,
        )
    }

    private val bootStarted = AtomicBoolean(false)

    /** Starts [bootGate] once per process; an Activity recreated by a configuration change must not boot again. */
    fun startBoot() {
        if (bootStarted.compareAndSet(false, true)) bootGate.start()
    }

    /** Holder factories and ports for `ChalkakRoot`. [onExitApp] is the Activity's finish. */
    fun newRootDependencies(onExitApp: () -> Unit = {}): RootDependencies {
        val nonces = SecureNonceGenerator()
        return RootDependencies(
            bootGate = bootGate,
            newNavigation = { mode, initial ->
                NavigationController(platform.analytics, mode, listOf(initial)).also { activeNavigation = it }
            },
            newLoginHolder = { scope ->
                LoginStateHolder(scope, platform.socialLogin, nonces, authRepository, guestFlagStore, platform.push, platform.analytics)
            },
            newTermsHolder = { TermsStateHolder(signupContext, platform.analytics) },
            signupContext = signupContext,
            legalDocumentOpener = LegalDocumentOpener(platform.externalBrowser),
            signup = SignupDependencies(
                newPadHolder = {
                    SignaturePadStateHolder(SignatureMode.Signup, SignaturePadSpace, platform.signatureEncoder, platform.analytics)
                },
                newSignupHolder = { scope ->
                    SignupStateHolder(scope, signupContext, signupRepository, signatureUploader, authRepository, platform.deviceRegistrar)
                },
            ),
            authEvents = authEventFlow,
            onExitApp = onExitApp,
            main = newMainDependencies(),
        )
    }

    /**
     * Main area ports. `screen_view` is sent by the navigation controller only (D-22), so the home holder gets a tracker that drops
     * everything: its own `screen_view(issue)` would double the controller's.
     */
    private fun newMainDependencies(): MainDependencies {
        val loader = imageLoader
        return MainDependencies(
            newHomeHolder = { scope, mode ->
                HomeStateHolder(
                    scope = scope,
                    clock = clock,
                    home = homeRepository,
                    banners = bannerRepository,
                    likes = LikeControllerToggler(likeController),
                    analytics = NoScreenViews,
                    mode = mode,
                    diagnostics = { where, error -> Log.e(TAG, "unexpected failure in $where", error) },
                )
            },
            likes = likeController,
            postChanges = postChanges,
            uploadGate = UploadEntryGate { enterUploadGate() },
            issueOpener = ExternalLinkOpener(platform.linkBrowser),
            newDisplayHolder = ::newDisplayHolder,
            newFeedHolder = ::newFeedHolder,
            // screen_view comes from the navigation controller only (D-22): the upload holder's own would double it.
            newUploadHolder = { scope, topicDate ->
                val upload = platform.upload
                PhotoUploadStateHolder(
                    scope = scope,
                    topicDate = topicDate,
                    home = homeRepository,
                    creation = postCreationRepository,
                    uploader = postImageUploader,
                    encoder = PostImageEncoder(upload.codec, upload.compressor),
                    codec = upload.codec,
                    files = upload.files,
                    gallery = upload.gallery,
                    toaster = upload.toaster,
                    camera = upload.camera,
                    monotonic = SystemMonotonicClock,
                    creations = postCreations,
                    analytics = NoScreenViews,
                )
            },
            uploadPlatform = platform.upload.platform,
            newAiReviewHolder = ::newAiReviewHolder,
            image = if (loader == null) {
                { _, _ -> }
            } else {
                { url, modifier -> CoilRemoteImage(loader, url, modifier) }
            },
            photo = if (loader == null) {
                { _, _ -> }
            } else {
                { url, modifier -> CoilPhotoImage(loader, url, modifier) }
            },
            issueWeb = { url, onNavigate, onLoaded, onFailed -> IssueWebView(url, onNavigate, onLoaded, onFailed, Modifier.fillMaxSize()) },
        )
    }

    /** `GET /posts/today` once: the upload screen may open only when today's photo has not been posted yet (REQ-UPL-002/003). */
    private suspend fun enterUploadGate(): UploadGateEffect = mapUploadGateResult(guardedApiCall("today") { homeRepository.today() })

    private object NoScreenViews : AnalyticsTracker {
        override fun screenView(screen: String) = Unit
    }

    companion object {
        private const val TAG = "Chalkak"

        fun create(context: Context, cipher: SecretCipher = KeystoreSecretCipher()): AppContainer {
            // One connection pool for API and images. Images use this bare client; `ApiClient` adds the Authorization header per
            // request itself, so the token never goes to the image CDN.
            val base = OkHttpClient()
            return create(context, cipher, base)
        }

        private fun create(context: Context, cipher: SecretCipher, base: OkHttpClient): AppContainer {
            val copy = Copy.load(context)
            return create(context, cipher, base, copy)
        }

        private fun create(context: Context, cipher: SecretCipher, base: OkHttpClient, copy: Copy): AppContainer = AppContainer(
            copy = copy,
            okHttpBase = base,
            apiBaseUrlRaw = BuildConfig.API_BASE_URL,
            clock = SystemClock,
            secureStorage = KeystoreRecordStorage(context, cipher),
            platform = PlatformAdapters.android(context, copy),
            imageLoader = ImageLoader.Builder(context)
                .components { add(OkHttpNetworkFetcherFactory(callFactory = { base })) }
                .build(),
        )
    }
}

/**
 * Decorates the session store with a synchronous view of the signed-in user id (`CurrentUser` is not suspending).
 * A `read()` that was already running when a `write()` / `clear()` happened returns the older state; it must not overwrite the newer
 * user id (logout during a token-refresh read would otherwise leave the old user "signed in"), so each change bumps [generation]
 * and a read tracks its result only if none happened meanwhile.
 */
internal class UserTrackingSessionStore(private val delegate: SessionStore) : SessionStore {
    @Volatile
    var userId: String? = null
        private set

    private val generation = java.util.concurrent.atomic.AtomicInteger()
    private val lock = Any()

    override suspend fun read(): StoredSession {
        val started = generation.get()
        val stored = delegate.read()
        synchronized(lock) {
            if (generation.get() == started) userId = (stored as? StoredSession.User)?.session?.userId
        }
        return stored
    }

    override suspend fun write(session: Session) {
        generation.incrementAndGet()
        delegate.write(session)
        set(session.userId)
    }

    override suspend fun clear() {
        try {
            delegate.clear()
        } finally {
            set(null)
        }
    }

    private fun set(id: String?) = synchronized(lock) {
        generation.incrementAndGet()
        userId = id
    }
}
