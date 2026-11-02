package com.bracketbattle.seo;

import tools.jackson.databind.json.JsonMapper;

/**
 * JSON-LD for a {@code <script type="application/ld+json">} block. Serialised with Jackson (never
 * concatenated), then {@code <}, {@code >}, {@code &}, U+2028 and U+2029 become {@code \}{@code uXXXX}
 * escapes. Those characters can only occur inside JSON strings, where the escapes mean the same
 * thing, so user text such as {@code </script>} can't end the block or start markup.
 */
public final class JsonLd {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private JsonLd() {}

    public static String toScriptContent(Object value) {
        String json = MAPPER.writeValueAsString(value);
        StringBuilder out = new StringBuilder(json.length() + 16);
        for (int i = 0; i < json.length(); i++) {
            char c = json.charAt(i);
            switch (c) {
                case '<', '>', '&', ' ', ' ' -> out.append(String.format("\\u%04x", (int) c));
                default -> out.append(c);
            }
        }
        return out.toString();
    }
}
