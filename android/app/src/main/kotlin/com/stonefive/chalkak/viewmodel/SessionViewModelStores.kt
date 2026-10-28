package com.stonefive.chalkak.viewmodel

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory

/**
 * One [ViewModelStore] per session key, kept by the Activity's store (so it survives rotation). A holder created under a session key
 * is cleared (its `viewModelScope` cancelled) as soon as that session ends, instead of living until the Activity dies: after
 * logout / account switch the previous account's holders (home state, ...) are gone, not just unreachable.
 */
class SessionViewModelStores : ViewModel() {
    private val stores = HashMap<Int, ViewModelStore>()

    fun owner(key: Int): ViewModelStoreOwner {
        val store = stores.getOrPut(key) { ViewModelStore() }
        return object : ViewModelStoreOwner {
            override val viewModelStore: ViewModelStore = store
        }
    }

    /** Clears the holders of [key]. */
    fun clear(key: Int) {
        stores.remove(key)?.clear()
    }

    /** Clears every session except [key]. */
    fun retainOnly(key: Int) {
        stores.keys.filter { it != key }.forEach(::clear)
    }

    @androidx.annotation.VisibleForTesting
    internal fun onClearedForTest() = onCleared()

    override fun onCleared() {
        stores.values.forEach(ViewModelStore::clear)
        stores.clear()
    }
}

/**
 * Runs [content] with `rememberStateHolder` bound to the store of [sessionKey]. Leaving the composition for good (not a rotation,
 * which keeps the Activity's ViewModels) clears that session's holders; so does starting another session.
 */
@Composable
fun SessionHolders(sessionKey: Int, isChangingConfigurations: () -> Boolean, content: @Composable () -> Unit) {
    val stores = viewModel<SessionViewModelStores>(factory = viewModelFactory { initializer { SessionViewModelStores() } })
    val owner = remember(stores, sessionKey) {
        stores.retainOnly(sessionKey)
        stores.owner(sessionKey)
    }
    DisposableEffect(stores, sessionKey) {
        onDispose { if (!isChangingConfigurations()) stores.clear(sessionKey) }
    }
    CompositionLocalProvider(LocalViewModelStoreOwner provides owner) { content() }
}
