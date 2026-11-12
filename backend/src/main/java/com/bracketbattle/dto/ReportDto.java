package com.bracketbattle.dto;

import java.time.Instant;

/**
 * A report as the moderation queue shows it, with what was reported: the bracket (and whether it
 * is hidden already), and for a comment its text and name. Target fields are null when the target
 * is gone. Who reported it is not included. Admin-only and never cached.
 */
public record ReportDto(
        long id,
        String targetType,
        long targetId,
        String reason,
        String details,
        Instant createdAt,
        Instant resolvedAt,
        Long bracketId,
        String bracketName,
        boolean bracketHidden,
        String comment,
        String displayName
) {}
