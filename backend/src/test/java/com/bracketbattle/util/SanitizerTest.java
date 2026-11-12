package com.bracketbattle.util;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SanitizerTest {

    /**
     * The inputs the old HTML-parsing sanitizer mangled (audit finding E1). Plain text in, plain
     * text out: nothing that looks like markup or an entity is touched.
     */
    @ParameterizedTest
    @CsvSource(delimiter = '|', textBlock = """
            x<y and y>z            | x<y and y>z
            Tom<Jerry              | Tom<Jerry
            <Name> the band        | <Name> the band
            Rock &amp; Roll        | Rock &amp; Roll
            """)
    void keepsTextThatLooksLikeMarkup(String input, String stored) {
        assertThat(Sanitizer.stripToPlain(input, 100)).isEqualTo(stored);
    }

    @Test
    void storesMarkupAndEntitiesExactlyAsTyped() {
        // Rendered as text everywhere, so this shows up literally and runs nowhere.
        assertThat(Sanitizer.stripToPlain("<b>Bold</b> <script>alert(1)</script>", 100))
                .isEqualTo("<b>Bold</b> <script>alert(1)</script>");
        assertThat(Sanitizer.stripToPlain("&lt;b&gt;", 100)).isEqualTo("&lt;b&gt;");
        assertThat(Sanitizer.stripToPlain("I <3 you, x < y", 100)).isEqualTo("I <3 you, x < y");
    }

    @Test
    void keepsNewlinesAndInnerSpacing() {
        assertThat(Sanitizer.stripToPlain("line1\nline2\n\n  line3", 100)).isEqualTo("line1\nline2\n\n  line3");
        assertThat(Sanitizer.stripToPlain("a\r\nb", 100)).isEqualTo("a\nb");
        assertThat(Sanitizer.stripToPlain("a\rb", 100)).isEqualTo("a\nb");
    }

    @Test
    void normalisesToNfc() {
        // "e" plus a combining acute accent is stored as the single character é.
        assertThat(Sanitizer.stripToPlain("Beyoncé", 100)).isEqualTo("Beyoncé");
    }

    @Test
    void removesControlCharactersAndTrims() {
        assertThat(Sanitizer.stripToPlain("  a\u0000b\u0007c\td\u007f  ", 100)).isEqualTo("abc\td");
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
    void whitespaceOnlyInputBecomesBlank() {
        assertThat(Sanitizer.stripToPlain("   \n\t  ", 100)).isEmpty();
        assertThat(Sanitizer.stripToPlain(" \u0000", 100)).isEmpty();
    }

    @Test
    void nonBreakingSpacesBecomeSpacesAndAreTrimmed() {
        assertThat(Sanitizer.stripToPlain(" a b ", 100)).isEqualTo("a b");
    }

    @Test
    void truncationTrimsTheCutEnd() {
        assertThat(Sanitizer.stripToPlain("abc def", 4)).isEqualTo("abc");
    }
}
