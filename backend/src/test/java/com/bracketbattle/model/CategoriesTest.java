package com.bracketbattle.model;

import com.bracketbattle.support.SharedFixtures;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CategoriesTest {

    @Test
    void matchesTheSharedList() {
        List<String> shared = new ArrayList<>();
        SharedFixtures.read("categories.json").forEach(n -> shared.add(n.asString()));
        assertThat(Categories.ALL).containsExactlyElementsOf(shared);
    }

    @Test
    void canonicalisesCaseAndRejectsUnknownValues() {
        assertThat(Categories.canonical("music")).contains("Music");
        assertThat(Categories.canonical("TV")).contains("TV");
        assertThat(Categories.canonical("tv")).contains("TV");
        assertThat(Categories.canonical("Testing")).isEmpty();
        assertThat(Categories.canonical("Music ")).isEmpty();
    }
}
