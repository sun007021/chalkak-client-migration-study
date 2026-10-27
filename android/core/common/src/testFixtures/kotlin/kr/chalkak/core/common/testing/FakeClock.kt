package kr.chalkak.core.common.testing

import kr.chalkak.core.common.Clock
import kr.chalkak.core.common.MonotonicClock
import java.time.Duration
import java.time.Instant

/** Settable [Clock] for tests. Starts at FIXTURE_NOW by default. Never sleeps. */
class FakeClock(start: Instant = Fixtures.fixtureNow) : Clock {
    @Volatile private var current: Instant = start
    override fun now(): Instant = current

    fun set(instant: Instant) { current = instant }
    fun set(iso: String) { current = Instant.parse(iso) }
    fun advance(duration: Duration) { current = current.plus(duration) }
}

/** Settable [MonotonicClock]; independent of [FakeClock] on purpose (system time changes must not matter). */
class FakeMonotonicClock(var nanos: Long = 0L) : MonotonicClock {
    override fun nanoTime(): Long = nanos
    fun advanceMillis(ms: Long) { nanos += ms * 1_000_000L }
}
