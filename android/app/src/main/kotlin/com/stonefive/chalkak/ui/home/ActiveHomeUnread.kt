package com.stonefive.chalkak.ui.home

import kr.chalkak.feature.home.HomeStateHolder
import kr.chalkak.feature.notification.UnreadStatusRefresher
import java.util.concurrent.atomic.AtomicReference

/**
 * `UnreadStatusRefresher` of the app: re-checks the unread dot of the home holder that `MainHost` attached
 * (`HomeStateHolder.onPushReceived()`); nothing attached or a guest holder -> nothing (the holder itself ignores guests).
 * [attach] with a holder replaces the previous one; [detach] removes it only if it is still the attached one.
 */
class ActiveHomeUnread : UnreadStatusRefresher {
    private val attached = AtomicReference<HomeStateHolder?>(null)

    fun attach(holder: HomeStateHolder) {
        attached.set(holder)
    }

    fun detach(holder: HomeStateHolder) {
        attached.compareAndSet(holder, null)
    }

    override fun refresh() {
        attached.get()?.onPushReceived()
    }
}
