package com.bracketbattle.support;

import com.bracketbattle.media.UpstreamHttp;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stands in for YouTube and Spotify. Answers by the first registered URL fragment the request
 * contains; anything unregistered fails as if the site were unreachable. Reset before each test.
 */
public class FakeUpstreamHttp implements UpstreamHttp {

    private final Map<String, Object> answers = new LinkedHashMap<>();
    private final List<String> requests = new ArrayList<>();

    public synchronized void reply(String urlContains, int status, String body) {
        answers.put(urlContains, new Response(status, body));
    }

    public synchronized void unreachable(String urlContains) {
        answers.put(urlContains, new IOException("connection refused"));
    }

    public synchronized List<String> requests() {
        return List.copyOf(requests);
    }

    public synchronized void reset() {
        answers.clear();
        requests.clear();
    }

    @Override
    public synchronized Response get(String url, Duration timeout, boolean followRedirects) throws IOException {
        requests.add(url);
        for (Map.Entry<String, Object> answer : answers.entrySet()) {
            if (url.contains(answer.getKey())) {
                if (answer.getValue() instanceof IOException e) throw e;
                return (Response) answer.getValue();
            }
        }
        throw new IOException("no fake answer for " + url);
    }
}
