package com.bracketbattle.scoring;

import java.util.ArrayList;
import java.util.List;

/**
 * The bracket sizes a run may use. Mirrors bracketSizeOptions in frontend/src/utils/tournament.ts;
 * both test suites check shared/bracket-sizes.json.
 */
public final class BracketSizes {

    private BracketSizes() {}

    /**
     * For {@code count} entries: the next power of two (with byes) when count isn't one, then
     * every power of two from count down to 2 (random subsets).
     */
    public static List<Integer> options(int count) {
        List<Integer> options = new ArrayList<>();
        if (count < 2) return options;
        int floor = Integer.highestOneBit(count);
        if (count > floor) options.add(floor * 2);
        for (int p = floor; p >= 2; p /= 2) options.add(p);
        return options;
    }
}
