package com.bracketbattle.api;

import com.bracketbattle.dto.BracketDto;
import com.bracketbattle.dto.BracketListQuery;
import com.bracketbattle.dto.BracketPageDto;
import com.bracketbattle.dto.CommentDto;
import com.bracketbattle.dto.HomeDto;
import com.bracketbattle.dto.ItemDto;
import com.bracketbattle.dto.ItemRankingDto;
import com.bracketbattle.dto.ResultDto;
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

        Optional<BracketDto> bracket = service.getBracketById(id);
        List<ItemDto> items = service.getBracketItems(id);
        List<ItemRankingDto> rankings = service.getBracketRankings(id);
        List<CommentDto> comments = service.getBracketComments(id);
        List<ResultDto> results = service.getUserResults("uid-a", id);
        BracketListQuery firstPage = BracketListQuery.parse(null, null, null, null, null, null);
        BracketPageDto page = service.listBrackets(firstPage);
        HomeDto home = service.getHome();

        // Raw cache entries exist in Valkey under the versioned prefix...
        assertThat(redis.hasKey("duely:v8:bracket::" + id)).isTrue();
        assertThat(redis.hasKey("duely:v8:bracketRankings::" + id)).isTrue();
        assertThat(redis.hasKey("duely:v8:bracketPages::newest:24")).isTrue();
        assertThat(redis.hasKey("duely:v8:home::SimpleKey []")).isTrue();

        // ...and deserialize into the original types with the same content.
        BracketDto cachedBracket = get("bracket", id, BracketDto.class);
        assertThat(cachedBracket.getName()).isEqualTo(bracket.orElseThrow().getName());
        assertThat(cachedBracket.getCreatedAt()).isEqualTo(bracket.get().getCreatedAt());
        assertThat(cachedBracket.getItemCount()).isEqualTo(2);
        assertThat(cachedBracket.getRunCount()).isEqualTo(1);

        List<?> cachedItems = get("bracketItems", id, List.class);
        assertThat(cachedItems).hasSize(2).allMatch(ItemDto.class::isInstance);
        assertThat(((ItemDto) cachedItems.get(0)).getMediaUrl()).isEqualTo(items.get(0).getMediaUrl());

        List<?> cachedRankings = get("bracketRankings", id, List.class);
        assertThat(cachedRankings).hasSize(2).allMatch(ItemRankingDto.class::isInstance);
        ItemRankingDto top = (ItemRankingDto) cachedRankings.get(0);
        assertThat(top.getItem().getId()).isEqualTo(rankings.get(0).getItem().getId());
        assertThat(top.getAverageScore()).isEqualTo(1.0);
        assertThat(top.getScore()).isEqualTo(rankings.get(0).getScore()).isEqualTo((1.0 + 2.5) / 6);

        List<?> cachedComments = get("bracketComments", id, List.class);
        assertThat(cachedComments).hasSize(1).allMatch(CommentDto.class::isInstance);
        assertThat(((CommentDto) cachedComments.get(0)).getComment()).isEqualTo(comments.get(0).getComment());

        List<?> cachedResults = get("userResults", "uid-a:" + id, List.class);
        assertThat(cachedResults).hasSize(1).allMatch(ResultDto.class::isInstance);
        assertThat(((ResultDto) cachedResults.get(0)).getRanking()).isEqualTo(results.get(0).getRanking());
        assertThat(((ResultDto) cachedResults.get(0)).getMatches()).isEqualTo(results.get(0).getMatches()).hasSize(1);
        assertThat(((ResultDto) cachedResults.get(0)).getPlaces()).isEqualTo(results.get(0).getPlaces()).hasSize(2);

        BracketPageDto cachedPage = get("bracketPages", firstPage.cacheKey(), BracketPageDto.class);
        assertThat(cachedPage.getTotal()).isEqualTo(page.getTotal()).isPositive();
        assertThat(cachedPage.getItems()).hasSameSizeAs(page.getItems()).allMatch(BracketDto.class::isInstance);
        assertThat(cachedPage.getItems().get(0).getId()).isEqualTo(id);
        assertThat(cachedPage.getItems().get(0).getRunCount()).isEqualTo(1);

        HomeDto cachedHome = get("home", org.springframework.cache.interceptor.SimpleKey.EMPTY, HomeDto.class);
        assertThat(cachedHome.getRecent()).hasSameSizeAs(home.getRecent()).allMatch(BracketDto.class::isInstance);
        assertThat(cachedHome.getCategories()).hasSameSizeAs(home.getCategories())
                .allMatch(HomeDto.CategorySection.class::isInstance);
        assertThat(cachedHome.getCategories().get(0).getBrackets()).allMatch(BracketDto.class::isInstance);

        // A second call is served from the cache and equals the first
        assertThat(service.getBracketRankings(id).get(0).getWins()).isEqualTo(rankings.get(0).getWins());
    }

    /**
     * A cached read is in Valkey when the call returns, so an eviction right after it can't be
     * overtaken by the read's own put (which once left hidden brackets public for half an hour).
     */
    @Test
    void cacheWritesHaveLandedWhenTheReadReturns() throws Exception {
        for (int i = 0; i < 20; i++) {
            long id = createBracket(USER_A, "Written " + i, 2).get("id").asLong();
            service.getBracketById(id);
            assertThat(redis.hasKey("duely:v8:bracket::" + id)).as("bracket " + id).isTrue();
            cacheManager.getCache("bracket").evict(id);
            assertThat(redis.hasKey("duely:v8:bracket::" + id)).as("bracket " + id + " evicted").isFalse();
        }
    }

    private <T> T get(String cacheName, Object key, Class<T> type) {
        Cache cache = cacheManager.getCache(cacheName);
        assertThat(cache).isNotNull();
        T value = cache.get(key, type);
        assertThat(value).as(cacheName + "[" + key + "]").isNotNull();
        return value;
    }
}
