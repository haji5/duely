package com.bracketbattle.service;

import com.bracketbattle.model.Bracket;
import com.bracketbattle.repository.BracketRepository;
import com.bracketbattle.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

/**
 * Who may see and change a bracket. A hidden bracket exists only for its owner and admins: to
 * everyone else, crawlers and page requests included, it is a 404, as if it had been deleted.
 * Ownership is always read from the table, never the cache: cached brackets carry no owner.
 */
@Component
public class BracketAccess {

    private final BracketService bracketService;
    private final BracketRepository bracketRepository;

    public BracketAccess(BracketService bracketService, BracketRepository bracketRepository) {
        this.bracketService = bracketService;
        this.bracketRepository = bracketRepository;
    }

    /** The bracket, if it exists and the caller (null for a guest or a page request) may see it. */
    public Optional<Bracket> findVisible(long id, Authentication authentication) {
        Optional<Bracket> bracket = bracketService.getBracketById(id);
        if (bracket.isEmpty() || bracket.get().getHiddenAt() == null || CurrentUser.isAdmin(authentication)) {
            return bracket;
        }
        String uid = CurrentUser.uidOrNull(authentication);
        return uid != null && bracketRepository.existsByIdAndCreatedBy(id, uid) ? bracket : Optional.empty();
    }

    public Bracket requireVisible(long id, Authentication authentication) {
        return findVisible(id, authentication).orElseThrow(BracketAccess::notFound);
    }

    /**
     * For changes only the owner or an admin may make. Anyone else gets a 403, or a 404 if the
     * bracket is hidden, so they cannot tell a hidden bracket from a deleted one.
     */
    public void requireOwnerOrAdmin(long id, Authentication authentication) {
        Bracket bracket = bracketRepository.findById(id).orElseThrow(BracketAccess::notFound);
        String uid = CurrentUser.uidOrNull(authentication);
        if (CurrentUser.isAdmin(authentication) || (uid != null && uid.equals(bracket.getCreatedBy()))) {
            return;
        }
        if (bracket.getHiddenAt() != null) {
            throw notFound();
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the person who made this bracket can do this");
    }

    static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Bracket not found");
    }
}
