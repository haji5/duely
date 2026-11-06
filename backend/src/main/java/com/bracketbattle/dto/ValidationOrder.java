package com.bracketbattle.dto;

import jakarta.validation.GroupSequence;
import jakarta.validation.groups.Default;

/**
 * Validation order for request bodies with lists ({@code @Validated(ValidationOrder.class)}): first
 * the request's own fields, list sizes included ({@link Fields}), and only if those pass the list
 * elements (the default group). An oversized list then costs one error instead of a check and an
 * error for every element, work that happens before the controller's rate limit. Without it a guest
 * could post a long list of invalid ids and cost the server seconds of CPU per request.
 */
@GroupSequence({ValidationOrder.Fields.class, Default.class})
public interface ValidationOrder {

    /** Constraints on the request's own fields, not on list elements. */
    interface Fields {}
}
