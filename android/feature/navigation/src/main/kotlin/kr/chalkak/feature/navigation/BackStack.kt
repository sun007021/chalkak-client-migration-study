package kr.chalkak.feature.navigation

/**
 * The route stack, bottom to top, never empty. Pure list manipulation: no analytics, no guest rules (those live in
 * [NavigationController]).
 */
internal class BackStack(initial: List<Route>) {
    private val entries: MutableList<Route> = initial.ifEmpty { listOf(Route.TabRoot(Tab.Home)) }.toMutableList()

    val snapshot: List<Route> get() = entries.toList()
    val top: Route get() = entries.last()

    /** Topmost tab root, or null while only login / sign-up screens are on the stack. */
    val selectedTab: Tab? get() = entries.lastOrNull { it is Route.TabRoot }?.let { (it as Route.TabRoot).tab }

    val canPop: Boolean get() = entries.size > 1

    fun push(route: Route) {
        entries += route
    }

    fun pop(): Route {
        check(canPop) { "Cannot pop the last stack entry" }
        entries.removeAt(entries.lastIndex)
        return top
    }

    fun replaceTop(route: Route) {
        entries[entries.lastIndex] = route
    }

    /** Replace everything with [routes] (tab moves, login, logout). */
    fun reset(vararg routes: Route) {
        entries.clear()
        entries += routes
    }

    /** Pop while the top satisfies [predicate], keeping at least one entry. */
    fun popWhile(predicate: (Route) -> Boolean) {
        while (canPop && predicate(top)) entries.removeAt(entries.lastIndex)
    }
}
