package com.bracketbattle.util;

import java.text.Normalizer;
import java.util.regex.Pattern;

public final class Sanitizer {
    // Control characters except tab and newline; \r is gone by the time this runs.
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cntrl}&&[^\n\t]]");

    private Sanitizer() {}

    /**
     * Normalises user input as plain text: Unicode NFC, {@code \r\n} to {@code \n}, non-breaking
     * spaces to spaces, control characters other than tab and newline removed, trimmed, and
     * truncated to {@code maxLen}. Returns null for null input.
     *
     * <p>Markup is <b>not</b> stripped and entities are not decoded: {@code "x<y and y>z"} and
     * {@code "&amp;"} are stored exactly as typed. Parsing text as HTML used to delete anything
     * that looked like a tag, and protected nothing, because every consumer renders these fields
     * as text (React, jsoup text setters, the JSON-LD escaper). That is now the only defence, by
     * design: never insert them into a page as HTML.
     */
    public static String stripToPlain(String input, int maxLen) {
        if (input == null) return null;
        String clean = CONTROL.matcher(Normalizer.normalize(input, Normalizer.Form.NFC)
                        .replace("\r\n", "\n")
                        .replace('\r', '\n')
                        .replace(' ', ' '))
                .replaceAll("")
                .strip();
        if (clean.length() <= maxLen) return clean;
        // Never cut between the two halves of a surrogate pair (emoji): a lone half is not text.
        int end = Character.isHighSurrogate(clean.charAt(maxLen - 1)) ? maxLen - 1 : maxLen;
        return clean.substring(0, end).strip();
    }
}
