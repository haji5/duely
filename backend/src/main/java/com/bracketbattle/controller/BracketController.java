package com.bracketbattle.controller;

import com.bracketbattle.dto.BracketStatsDto;
import com.bracketbattle.dto.CommentDto;
import com.bracketbattle.dto.CreateBracketRequest;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.dto.ReportRequest;
import com.bracketbattle.dto.RunTicketDto;
import com.bracketbattle.dto.SaveResultRequest;
import com.bracketbattle.dto.StartRunRequest;
import com.bracketbattle.dto.ValidationOrder;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.ratelimit.RateLimiter;
import com.bracketbattle.security.CurrentUser;
import com.bracketbattle.service.AccountService;
import com.bracketbattle.service.BracketAccess;
import com.bracketbattle.service.BracketService;
import com.bracketbattle.service.ModerationService;
import com.bracketbattle.service.RunService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class BracketController {

    private final BracketService bracketService;
    private final BracketAccess bracketAccess;
    private final RunService runService;
    private final ModerationService moderationService;
    private final AccountService accountService;
    private final RateLimiter rateLimiter;

    public BracketController(BracketService bracketService, BracketAccess bracketAccess, RunService runService,
                             ModerationService moderationService, AccountService accountService, RateLimiter rateLimiter) {
        this.bracketService = bracketService;
        this.bracketAccess = bracketAccess;
        this.runService = runService;
        this.moderationService = moderationService;
        this.accountService = accountService;
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

    /** Hidden brackets are a 404 here and below for everyone but their owner and admins. */
    @GetMapping("/brackets/{id}")
    public Bracket getBracket(@PathVariable Long id, Authentication authentication) {
        return bracketAccess.requireVisible(id, authentication);
    }

    /** The owner or an admin deletes a bracket with its entries, runs and leaderboard. */
    @DeleteMapping("/brackets/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBracket(@PathVariable Long id, Authentication authentication) {
        bracketAccess.requireOwnerOrAdmin(id, authentication);
        moderationService.deleteBracket(id);
    }

    @GetMapping("/brackets/{id}/items")
    public List<Item> getBracketItems(@PathVariable Long id, Authentication authentication) {
        bracketAccess.requireVisible(id, authentication);
        return bracketService.getBracketItems(id);
    }

    @GetMapping("/brackets/{id}/rankings")
    public List<ItemRankingDto> getBracketRankings(@PathVariable Long id, Authentication authentication) {
        bracketAccess.requireVisible(id, authentication);
        return bracketService.getBracketRankings(id);
    }

    @GetMapping("/brackets/{id}/stats")
    public BracketStatsDto getBracketStats(@PathVariable Long id, Authentication authentication) {
        bracketAccess.requireVisible(id, authentication);
        return bracketService.getBracketStats(id);
    }

    @GetMapping("/brackets/{id}/comments")
    public List<CommentDto> getBracketComments(@PathVariable Long id, Authentication authentication) {
        bracketAccess.requireVisible(id, authentication);
        return bracketService.getBracketComments(id);
    }

    /** Starts a run: the server picks the entrants and signs them into a ticket. Open to guests. */
    @PostMapping("/brackets/{id}/runs")
    public RunTicketDto startRun(@PathVariable Long id, @Validated @RequestBody StartRunRequest payload,
                                 Authentication authentication, HttpServletRequest request) {
        bracketAccess.requireVisible(id, authentication);
        String userId = CurrentUser.uidOrNull(authentication);
        if (userId != null) {
            rateLimiter.tryAcquire("run-start-user", userId);
        } else {
            rateLimiter.tryAcquire("run-start-ip", request.getRemoteAddr());
        }
        return runService.startRun(id, payload.size());
    }

    /** Open to guests; signed-in runs are attributed to the user and show up in their history. */
    @PostMapping("/brackets/{id}/results")
    public Result saveBracketResult(@PathVariable Long id, @Validated(ValidationOrder.class) @RequestBody SaveResultRequest payload,
                                    Authentication authentication, HttpServletRequest request) {
        bracketAccess.requireVisible(id, authentication);
        String userId = CurrentUser.uidOrNull(authentication);
        if (userId != null) {
            rateLimiter.tryAcquire("result-user", userId);
        } else {
            rateLimiter.tryAcquire("result-ip", request.getRemoteAddr());
        }
        return runService.saveRun(id, userId, request.getRemoteAddr(), payload);
    }

    @PostMapping("/brackets")
    public Bracket createBracket(@Validated(ValidationOrder.class) @RequestBody CreateBracketRequest payload, Authentication authentication) {
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

    /**
     * Deletes what Duely keeps about the caller: their unplayed brackets, the owner and the name
     * and comment on everything else (see AccountService).
     */
    @DeleteMapping("/me")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMyData(Authentication authentication) {
        accountService.deleteAccount(CurrentUser.uidOrNull(authentication));
    }

    /** Open to guests, a few an hour each. */
    @PostMapping("/reports")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void report(@Validated @RequestBody ReportRequest payload, Authentication authentication, HttpServletRequest request) {
        String userId = CurrentUser.uidOrNull(authentication);
        rateLimiter.tryAcquire("report", userId != null ? userId : request.getRemoteAddr());
        moderationService.report(payload, authentication, userId);
    }
}
