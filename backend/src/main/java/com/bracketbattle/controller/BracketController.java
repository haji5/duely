package com.bracketbattle.controller;

import com.bracketbattle.dto.CommentDto;
import com.bracketbattle.dto.CreateBracketRequest;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.dto.SaveResultRequest;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.ratelimit.RateLimiter;
import com.bracketbattle.security.CurrentUser;
import com.bracketbattle.service.BracketService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
public class BracketController {

    private final BracketService bracketService;
    private final RateLimiter rateLimiter;

    public BracketController(BracketService bracketService, RateLimiter rateLimiter) {
        this.bracketService = bracketService;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/brackets")
    public List<Bracket> getAllBrackets() {
        return bracketService.getAllBrackets();
    }

    @GetMapping("/brackets/popular")
    public List<Bracket> getPopularBrackets() {
        return bracketService.getPopularBrackets();
    }

    @GetMapping("/brackets/{id}")
    public Bracket getBracket(@PathVariable Long id) {
        return requireBracket(id);
    }

    @GetMapping("/brackets/{id}/items")
    public List<Item> getBracketItems(@PathVariable Long id) {
        requireBracket(id);
        return bracketService.getBracketItems(id);
    }

    @GetMapping("/brackets/{id}/rankings")
    public List<ItemRankingDto> getBracketRankings(@PathVariable Long id) {
        requireBracket(id);
        return bracketService.getBracketRankings(id);
    }

    @GetMapping("/brackets/{id}/comments")
    public List<CommentDto> getBracketComments(@PathVariable Long id) {
        requireBracket(id);
        return bracketService.getBracketComments(id);
    }

    /** Open to guests; signed-in runs are attributed to the user and show up in their history. */
    @PostMapping("/brackets/{id}/results")
    public Result saveBracketResult(@PathVariable Long id, @Valid @RequestBody SaveResultRequest payload,
                                    Authentication authentication, HttpServletRequest request) {
        String userId = CurrentUser.uidOrNull(authentication);
        if (userId != null) {
            rateLimiter.tryAcquire("result-user", userId);
        } else {
            rateLimiter.tryAcquire("result-ip", request.getRemoteAddr());
        }
        return bracketService.saveBracketResult(id, userId, payload);
    }

    @PostMapping("/brackets")
    public Bracket createBracket(@Valid @RequestBody CreateBracketRequest payload, Authentication authentication) {
        String userId = CurrentUser.uidOrNull(authentication);
        rateLimiter.tryAcquire("bracket-create", userId);
        return bracketService.createBracket(payload, userId);
    }

    @GetMapping("/me/brackets")
    public List<Bracket> getMyBrackets(Authentication authentication) {
        return bracketService.getBracketsByCreator(CurrentUser.uidOrNull(authentication));
    }

    @GetMapping("/me/results")
    public List<Result> getMyResults(@RequestParam(required = false) Long bracketId, Authentication authentication) {
        return bracketService.getUserResults(CurrentUser.uidOrNull(authentication), bracketId);
    }

    private Bracket requireBracket(Long id) {
        return bracketService.getBracketById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bracket not found"));
    }
}
