package com.bracketbattle.util;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.parser.Parser;
import org.jsoup.safety.Safelist;

public final class Sanitizer {
    private static final Safelist NONE = Safelist.none();
    // No pretty printing: it would collapse newlines and trim spaces in multi-line comments.
    private static final Document.OutputSettings RAW = new Document.OutputSettings().prettyPrint(false);

    private Sanitizer() {}

    /**
     * Turns user input into plain text: removes HTML tags and control characters, decodes
     * entities, trims, and truncates to {@code maxLen}. Returns null for null input.
     *
     * <p>The result is <b>text, not HTML</b>. Decoding means {@code "&lt;b&gt;"} is stored as the
     * literal characters {@code <b>}. That is safe only because every consumer renders these
     * fields as text (React escapes them); never insert them into a page as HTML.
     */
    public static String stripToPlain(String input, int maxLen) {
        if (input == null) return null;
        String clean = Parser.unescapeEntities(Jsoup.clean(input, "", NONE, RAW), false)
                .replace("\r\n", "\n")
                .replace(' ', ' ')
                // Drop control characters except tab and newline
                .replaceAll("[\\p{Cntrl}&&[^\n\t]]", "")
                .strip();
        if (clean.length() <= maxLen) return clean;
        // Never cut between the two halves of a surrogate pair (emoji): a lone half is not text.
        int end = Character.isHighSurrogate(clean.charAt(maxLen - 1)) ? maxLen - 1 : maxLen;
        return clean.substring(0, end).strip();
    }
}
