package com.bracketbattle.api;

import com.bracketbattle.dto.CommentDto;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.model.Bracket;
import com.bracketbattle.model.Item;
import com.bracketbattle.model.Result;
import com.bracketbattle.service.BracketService;
import com.bracketbattle.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/** Cached values must survive a real write to Valkey and a read back into the right types. */
class CacheRoundTripIT extends IntegrationTest {

    @Autowired
    BracketService service;

    @Autowired
    CacheManager cacheManager;

    @Test
    void cachedValuesRoundTripThroughValkey() throws Exception {
        long id = createBracket(USER_A, "Cached", 2).get("id").asLong();
        List<Long> ranking = itemIds(id);
        perform(as(USER_A, postJson("/brackets/" + id + "/results", runPayload(ranking, null, "nice"))));

        Optional<Bracket> bracket = service.getBracketById(id);
        List<Item> items = service.getBracketItems(id);
        List<ItemRankingDto> rankings = service.getBracketRankings(id);
        List<CommentDto> comments = service.getBracketComments(id);
        List<Result> results = service.getUserResults("uid-a", id);
        List<Bracket> all = service.getAllBrackets();

        // Raw cache entries exist in Valkey under the versioned prefix...
        assertThat(redis.hasKey("duely:v2:bracket::" + id)).isTrue();
        assertThat(redis.hasKey("duely:v2:bracketRankings::" + id)).isTrue();

        // ...and deserialize into the original types with the same content.
        Bracket cachedBracket = get("bracket", id, Bracket.class);
        assertThat(cachedBracket.getName()).isEqualTo(bracket.orElseThrow().getName());
        assertThat(cachedBracket.getCreatedAt()).isEqualTo(bracket.get().getCreatedAt());

        List<?> cachedItems = get("bracketItems", id, List.class);
        assertThat(cachedItems).hasSize(2).allMatch(Item.class::isInstance);
        assertThat(((Item) cachedItems.get(0)).getMediaUrl()).isEqualTo(items.get(0).getMediaUrl());

        List<?> cachedRankings = get("bracketRankings", id, List.class);
        assertThat(cachedRankings).hasSize(2).allMatch(ItemRankingDto.class::isInstance);
        ItemRankingDto top = (ItemRankingDto) cachedRankings.get(0);
        assertThat(top.getItem().getId()).isEqualTo(rankings.get(0).getItem().getId());
        assertThat(top.getAverageScore()).isEqualTo(1.0);

        List<?> cachedComments = get("bracketComments", id, List.class);
        assertThat(cachedComments).hasSize(1).allMatch(CommentDto.class::isInstance);
        assertThat(((CommentDto) cachedComments.get(0)).getComment()).isEqualTo(comments.get(0).getComment());

        List<?> cachedResults = get("userResults", "uid-a:" + id, List.class);
        assertThat(cachedResults).hasSize(1).allMatch(Result.class::isInstance);
        assertThat(((Result) cachedResults.get(0)).getRanking()).isEqualTo(results.get(0).getRanking());

        assertThat(get("brackets", org.springframework.cache.interceptor.SimpleKey.EMPTY, List.class)).hasSameSizeAs(all);

        // A second call is served from the cache and equals the first
        assertThat(service.getBracketRankings(id).get(0).getWins()).isEqualTo(rankings.get(0).getWins());
    }

    private <T> T get(String cacheName, Object key, Class<T> type) {
        Cache cache = cacheManager.getCache(cacheName);
        assertThat(cache).isNotNull();
        T value = cache.get(key, type);
        assertThat(value).as(cacheName + "[" + key + "]").isNotNull();
        return value;
    }
}
