package com.bracketbattle.model;

import java.util.List;

/**
 * Why something was reported. Mirrored by REPORT_REASONS in frontend/src/utils/reports.ts, which
 * adds the labels; both test suites check against shared/report-reasons.json.
 */
public final class ReportReasons {

    public static final List<String> ALL = List.of("spam", "harassment", "sexual", "personal-info", "illegal", "other");

    private ReportReasons() {}
}
