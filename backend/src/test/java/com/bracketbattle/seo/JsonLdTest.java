package com.bracketbattle.seo;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class JsonLdTest {

    @Test
    void escapesCharactersThatCouldEndTheScriptBlock() {
        String json = JsonLd.toScriptContent(Map.of("name", "</script><b>\"x\" & \u2028\u2029"));

        assertThat(json).doesNotContain("<", ">", "&", "\u2028", "\u2029");
        assertThat(json).isEqualTo("{\"name\":\"\\u003c/script\\u003e\\u003cb\\u003e\\\"x\\\" \\u0026 \\u2028\\u2029\"}");
    }

    @Test
    void escapedJsonStillParsesToTheOriginalText() {
        String original = "</script><b>\"x\" & \u2028";
        String json = JsonLd.toScriptContent(Map.of("name", original));

        assertThat(JsonMapper.builder().build().readTree(json).get("name").asString()).isEqualTo(original);
    }
}
