package com.stonefive.chalkak.testing

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasText

/**
 * Every [texts] entry is shown by the node itself (merged semantics) or by one of its descendants.
 * Used where testids.md tags only the container (for example `login.error-dialog`).
 */
fun SemanticsNodeInteraction.assertShowsAll(vararg texts: String): SemanticsNodeInteraction {
    texts.forEach { assert(hasText(it) or hasAnyDescendant(hasText(it))) }
    return this
}
