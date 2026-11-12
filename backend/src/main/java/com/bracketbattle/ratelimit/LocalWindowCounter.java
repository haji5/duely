package com.bracketbattle.ratelimit;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The same fixed windows as the Valkey counters, kept in this process while Valkey is
 * unreachable. Each bucket holds at most {@code maxSubjects} subjects; a window's entry is dropped
 * once it ends. A subject that finds its bucket full counts as over the limit, so filling the map
 * with fresh subjects cannot switch the limit off.
 */
final class LocalWindowCounter {

    private record Window(long index, long count) {}

    private final int maxSubjects;
    private final Map<String, Map<String, Window>> buckets = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> lastPurge = new ConcurrentHashMap<>();

    LocalWindowCounter(int maxSubjects) {
        this.maxSubjects = maxSubjects;
    }

    /** The subject's new count in the current window, or {@link Long#MAX_VALUE} when the bucket is full. */
    long increment(String bucket, String subject, long epochSecond, long periodSeconds) {
        long index = epochSecond / periodSeconds;
        Map<String, Window> windows = buckets.computeIfAbsent(bucket, b -> new ConcurrentHashMap<>());
        purgeEndedWindows(bucket, windows, index, epochSecond);
        if (windows.size() >= maxSubjects && !windows.containsKey(subject)) {
            return Long.MAX_VALUE;
        }
        return windows.compute(subject, (s, w) ->
                w == null || w.index() != index ? new Window(index, 1) : new Window(index, w.count() + 1)).count();
    }

    /** Forgets every window, once Valkey counts again. */
    void clear() {
        buckets.clear();
    }

    boolean isEmpty() {
        return buckets.isEmpty();
    }

    // At most once a second per bucket, so a full bucket under load is not rescanned per request.
    private void purgeEndedWindows(String bucket, Map<String, Window> windows, long index, long epochSecond) {
        AtomicLong last = lastPurge.computeIfAbsent(bucket, b -> new AtomicLong(-1));
        long previous = last.get();
        if (previous != epochSecond && last.compareAndSet(previous, epochSecond)) {
            windows.values().removeIf(w -> w.index() < index);
        }
    }
}
