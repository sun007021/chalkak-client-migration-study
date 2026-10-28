package kr.chalkak.feature.navigation

/** Saved view state of a tab (scroll offset, selected date/month/sort as an opaque string). */
data class TabViewState(val scrollOffset: Int, val selection: String? = null)

/** Per-tab state kept while the user visits other tabs (REQ-NAV-004/005). Home is never restored: it always starts fresh. */
class TabStateStore {
    private val states = mutableMapOf<Tab, TabViewState>()

    /** Remember [state] for [tab]. */
    fun save(tab: Tab, state: TabViewState) {
        states[tab] = state
    }

    /** The saved state, or null for [Tab.Home] (always starts fresh) and for tabs never saved. */
    fun restore(tab: Tab): TabViewState? = if (tab == Tab.Home) null else states[tab]

    /** Forget everything (logout, account switch: TC-NAV-050). */
    fun clear() {
        states.clear()
    }
}
