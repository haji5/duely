package com.bracketbattle.model;

import com.bracketbattle.support.SharedFixtures;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReportReasonsTest {

    @Test
    void matchesTheSharedList() {
        List<String> shared = new ArrayList<>();
        SharedFixtures.read("report-reasons.json").forEach(n -> shared.add(n.asString()));
        assertThat(ReportReasons.ALL).containsExactlyElementsOf(shared);
    }
}
