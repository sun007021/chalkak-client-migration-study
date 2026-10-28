package com.stonefive.chalkak.viewmodel

import androidx.lifecycle.ViewModelStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.isActive
import org.junit.Test
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class StateHolderViewModelTest {
    private class FakeHolder(val scope: CoroutineScope)

    @Test
    fun `holder gets viewModelScope which is cancelled when cleared`() {
        val store = ViewModelStore()
        val vm = StateHolderViewModel { FakeHolder(it) }
        store.put("k", vm)
        assertTrue(vm.holder.scope.isActive)
        assertSame(vm, store["k"])
        store.clear()
        assertFalse(vm.holder.scope.isActive)
    }
}
