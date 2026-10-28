package com.stonefive.chalkak.ui.home

import kr.chalkak.feature.home.HomeStateHolder
import kr.chalkak.feature.notification.UnreadStatusRefresher

/**
 * STUB (A8 test step). `UnreadStatusRefresher` of the app: re-checks the unread dot of the home holder that `MainHost` attached
 * (`HomeStateHolder.onPushReceived()`); nothing attached or a guest holder -> nothing. [attach] with a holder replaces the previous one;
 * [detach] removes it only if it is still the attached one.
 */
class ActiveHomeUnread : UnreadStatusRefresher {
    fun attach(holder: HomeStateHolder) {
    }

    fun detach(holder: HomeStateHolder) {
    }

    override fun refresh() {
    }
}
