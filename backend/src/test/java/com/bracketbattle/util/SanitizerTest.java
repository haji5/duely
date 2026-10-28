package com.bracketbattle.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SanitizerTest {

    @Test
    void stripsTagsAndKeepsText() {
        assertThat(Sanitizer.stripToPlain("<b>Bold</b> <script>alert(1)</script>move", 100)).isEqualTo("Bold move");
        assertThat(Sanitizer.stripToPlain("<img src=x onerror=alert(1)>cat", 100)).isEqualTo("cat");
    }

    @Test
    void decodesEntitiesToPlainCharacters() {
        assertThat(Sanitizer.stripToPlain("Noah Kahan &amp; Hozier", 100)).isEqualTo("Noah Kahan & Hozier");
        assertThat(Sanitizer.stripToPlain("Tom & Jerry \"quoted\" it's", 100)).isEqualTo("Tom & Jerry \"quoted\" it's");
        // Encoded markup becomes literal text; it is rendered as text, never as HTML.
        assertThat(Sanitizer.stripToPlain("&lt;b&gt;", 100)).isEqualTo("<b>");
    }

    @Test
    void keepsNewlinesAndInnerSpacing() {
        assertThat(Sanitizer.stripToPlain("line1\nline2\n\n  line3", 100)).isEqualTo("line1\nline2\n\n  line3");
        assertThat(Sanitizer.stripToPlain("a\r\nb", 100)).isEqualTo("a\nb");
        assertThat(Sanitizer.stripToPlain("I <3 you, x < y", 100)).isEqualTo("I <3 you, x < y");
    }

    @Test
    void removesControlCharactersAndTrims() {
        assertThat(Sanitizer.stripToPlain("  a\u0000b\u0007c\td  ", 100)).isEqualTo("abc\td");
    }

    @Test
    void truncates() {
        assertThat(Sanitizer.stripToPlain("abcdef", 3)).isEqualTo("abc");
        assertThat(Sanitizer.stripToPlain(null, 3)).isNull();
    }

    @Test
    void truncationNeverSplitsASurrogatePair() {
        // An emoji is two UTF-16 chars; cutting between them leaves a lone surrogate, which is not
        // valid text (Postgres stores it as '?', and JSON encoders reject or mangle it).
        assertThat(Sanitizer.stripToPlain("a".repeat(99) + "😀", 100)).isEqualTo("a".repeat(99));
        assertThat(Sanitizer.stripToPlain("😀😀", 3)).isEqualTo("😀");
        assertThat(Sanitizer.stripToPlain("😀", 2)).isEqualTo("😀");
    }

    @Test
    void markupOnlyInputBecomesBlank() {
        assertThat(Sanitizer.stripToPlain("<b></b>", 100)).isEmpty();
        assertThat(Sanitizer.stripToPlain("<script>alert(1)</script>", 100)).isEmpty();
        assertThat(Sanitizer.stripToPlain("   \n\t  ", 100)).isEmpty();
    }

    @Test
    void doublyEncodedMarkupIsDecodedOnlyOnce() {
        assertThat(Sanitizer.stripToPlain("&amp;lt;b&amp;gt;", 100)).isEqualTo("&lt;b&gt;");
    }

    @Test
    void nonBreakingSpacesBecomeSpacesAndAreTrimmed() {
        assertThat(Sanitizer.stripToPlain(" a b&nbsp;", 100)).isEqualTo("a b");
    }

    @Test
    void truncationTrimsTheCutEnd() {
        assertThat(Sanitizer.stripToPlain("abc def", 4)).isEqualTo("abc");
    }
}
