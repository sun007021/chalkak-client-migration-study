package kr.chalkak.core.common

import java.time.Instant

/** The only source of "now". Never call the system clock directly (TC-TIME-029). */
fun interface Clock {
    fun now(): Instant
}

/** Monotonic time source for durations (upload URL expiry, TC-TIME-027). */
fun interface MonotonicClock {
    fun nanoTime(): Long
}
