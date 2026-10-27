package kr.chalkak.core.common

import java.time.Instant

/** Production [Clock]. This file is the single allow-listed place for direct system clock access. */
object SystemClock : Clock {
    override fun now(): Instant = Instant.now()
}

/** Production [MonotonicClock]. Allow-listed together with [SystemClock]. */
object SystemMonotonicClock : MonotonicClock {
    override fun nanoTime(): Long = System.nanoTime()
}
