package com.stonefive.chalkak.viewmodel

import androidx.compose.runtime.Composable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.CoroutineScope

/**
 * Wraps a pure-Kotlin `*StateHolder` in an AndroidX [ViewModel]. The holder is built once from [create] with
 * `viewModelScope`, so its coroutines are cancelled when the ViewModel is cleared and it survives configuration changes.
 */
class StateHolderViewModel<H : Any>(create: (CoroutineScope) -> H) : ViewModel() {
    val holder: H = create(viewModelScope)
}

/**
 * `val holder = rememberStateHolder { scope -> LoginStateHolder(container.authRepository, ..., scope) }`
 * [key] separates several holders of the same type under one owner (for example per post id).
 */
@Composable
inline fun <reified H : Any> rememberStateHolder(
    key: String? = null,
    noinline create: (CoroutineScope) -> H,
): H {
    val vm = viewModel<StateHolderViewModel<H>>(
        key = H::class.java.name + (key?.let { ":$it" } ?: ""),
        factory = viewModelFactory { initializer { StateHolderViewModel(create) } },
    )
    return vm.holder
}
