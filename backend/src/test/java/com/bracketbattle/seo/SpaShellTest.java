package com.bracketbattle.seo;

import org.jsoup.nodes.Document;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SpaShellTest {

    private static String shell(String version) {
        return "<!doctype html><html><head><title>" + version + "</title></head><body><div id=\"root\"></div></body></html>";
    }

    /** A shell whose TTL is zero, so every call wants a refresh, backed by {@code resource}. */
    private static SpaShell shellFrom(Resource resource) {
        ResourceLoader loader = mock(ResourceLoader.class);
        when(loader.getResource(anyString())).thenReturn(resource);
        return new SpaShell("classpath:index.html", Duration.ZERO, loader);
    }

    @Test
    void servesTheStaleCopyWhileAnotherRequestRefreshes() throws Exception {
        CountDownLatch refreshing = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger fetches = new AtomicInteger();
        Resource resource = mock(Resource.class);
        when(resource.getContentAsString(any())).thenAnswer(inv -> {
            if (fetches.incrementAndGet() == 1) return shell("v1");
            refreshing.countDown();
            release.await(10, TimeUnit.SECONDS);
            return shell("v2");
        });
        SpaShell spaShell = shellFrom(resource);
        assertThat(spaShell.get().title()).isEqualTo("v1");

        CompletableFuture<Document> slow = CompletableFuture.supplyAsync(spaShell::get);
        assertThat(refreshing.await(10, TimeUnit.SECONDS)).isTrue();
        // The refresh is stuck upstream; this request must not wait for it.
        long start = System.nanoTime();
        assertThat(spaShell.get().title()).isEqualTo("v1");
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(1));

        release.countDown();
        assertThat(slow.get(10, TimeUnit.SECONDS).title()).isEqualTo("v2");
        assertThat(fetches.get()).isEqualTo(2);
    }

    @Test
    void keepsThePreviousCopyWhenARefreshFails() throws Exception {
        AtomicInteger fetches = new AtomicInteger();
        Resource resource = mock(Resource.class);
        when(resource.getContentAsString(any())).thenAnswer(inv -> {
            if (fetches.incrementAndGet() == 1) return shell("v1");
            throw new IOException("frontend down");
        });
        SpaShell spaShell = shellFrom(resource);
        assertThat(spaShell.get().title()).isEqualTo("v1");
        assertThat(spaShell.get().title()).isEqualTo("v1");
    }

    @Test
    void answers503WithoutAnyCopy() throws Exception {
        Resource resource = mock(Resource.class);
        when(resource.getContentAsString(any())).thenReturn("<html><body>no root</body></html>");
        assertThatThrownBy(() -> shellFrom(resource).get())
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("503");
    }

    @Test
    void eachCallerGetsItsOwnCopyToEdit() throws Exception {
        Resource resource = mock(Resource.class);
        when(resource.getContentAsString(any())).thenReturn(shell("v1"));
        SpaShell spaShell = new SpaShell("classpath:index.html", Duration.ofMinutes(5), loaderFor(resource));
        spaShell.get().title("edited");
        assertThat(spaShell.get().title()).isEqualTo("v1");
    }

    private static ResourceLoader loaderFor(Resource resource) {
        ResourceLoader loader = mock(ResourceLoader.class);
        when(loader.getResource(anyString())).thenReturn(resource);
        return loader;
    }
}
