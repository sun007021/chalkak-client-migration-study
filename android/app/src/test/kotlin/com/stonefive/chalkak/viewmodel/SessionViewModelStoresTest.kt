package com.stonefive.chalkak.viewmodel

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.isActive
import org.junit.Test
import kotlin.test.assertFalse
import kotlin.test.assertNotSame
import kotlin.test.assertSame
import kotlin.test.assertTrue

class SessionViewModelStoresTest {
    private class Holder(val scope: CoroutineScope)

    private fun SessionViewModelStores.holder(key: Int): Holder {
        val store = owner(key).viewModelStore
        val vm = StateHolderViewModel { Holder(it) }
        store.put("h", vm)
        return vm.holder
    }

    @Test
    fun `same key gives the same store and another key another one`() {
        val stores = SessionViewModelStores()
        assertSame(stores.owner(1).viewModelStore, stores.owner(1).viewModelStore)
        assertNotSame(stores.owner(1).viewModelStore, stores.owner(2).viewModelStore)
    }

    @Test
    fun `retainOnly clears the holders of every other session`() {
        val stores = SessionViewModelStores()
        val old = stores.holder(1)
        val current = stores.holder(2)
        stores.retainOnly(2)
        assertFalse(old.scope.isActive, "the previous account's holder is cancelled, not just unreachable")
        assertTrue(current.scope.isActive)
    }

    @Test
    fun `clear and onCleared cancel holders and a cleared key starts fresh`() {
        val stores = SessionViewModelStores()
        val first = stores.holder(1)
        stores.clear(1)
        assertFalse(first.scope.isActive)
        val second = stores.holder(1)
        assertTrue(second.scope.isActive)
        stores.onClearedForTest()
        assertFalse(second.scope.isActive)
    }
}
