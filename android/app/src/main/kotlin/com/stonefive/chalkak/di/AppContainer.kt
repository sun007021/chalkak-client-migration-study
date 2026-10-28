package com.stonefive.chalkak.di

import android.content.Context
import com.stonefive.chalkak.BuildConfig
import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.data.KeystoreRecordStorage
import com.stonefive.chalkak.data.KeystoreSecretCipher
import com.stonefive.chalkak.data.SecretCipher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kr.chalkak.core.common.Clock
import kr.chalkak.core.common.SystemClock
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
    okHttpBase: OkHttpClient = OkHttpClient(),
) {
    /** `API_BASE_URL` is validated once (REQ-NET-001/002). An invalid value is a build configuration error: fail at start. */
    val apiBaseUrl: ApiBaseUrl = when (val parsed = ApiBaseUrl.parse(apiBaseUrlRaw)) {
        is ApiBaseUrlResult.Valid -> parsed.baseUrl
        is ApiBaseUrlResult.Invalid -> error("Invalid API_BASE_URL '$apiBaseUrlRaw': ${parsed.reason}")
    }

    private val persistentSessionStore = PersistentSessionStore(secureStorage)
    val sessionStore: SessionStore get() = persistentSessionStore
    val guestFlagStore: GuestFlagStore get() = persistentSessionStore

    // A Channel, not a SharedFlow: an event emitted before the navigation shell starts collecting (cold start refresh
    // failure) must be buffered, not dropped. Single consumer.
    private val authEvents = Channel<AuthEvent>(Channel.BUFFERED)

    /** `AuthEvent.GoToLogin` etc.; the navigation shell collects this (one collector). */
    val authEventFlow: Flow<AuthEvent> = authEvents.receiveAsFlow()

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
        val sink = AuthEventSink { authEvents.trySend(it) }
        val refresher = TokenRefresher(sessionStore, HttpRefreshApi(apiBaseUrl, authFreeOkHttp), clock, applicationScope, sink)
        ApiClient(apiBaseUrl, apiOkHttp, sessionStore, refresher, clock, sink)
    }

    val authRepository: AuthRepository by lazy { DefaultAuthRepository(apiClient, sessionStore, userDataResetter, clock) }
    val homeRepository: HomeRepository by lazy { DefaultHomeRepository(apiClient) }
    val bannerRepository: BannerRepository by lazy { DefaultBannerRepository(apiClient) }

    companion object {
        fun create(context: Context, cipher: SecretCipher = KeystoreSecretCipher()): AppContainer = AppContainer(
            copy = Copy.load(context),
            apiBaseUrlRaw = BuildConfig.API_BASE_URL,
            clock = SystemClock,
            secureStorage = KeystoreRecordStorage(context, cipher),
        )
    }
}
