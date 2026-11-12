package com.bracketbattle.media;

import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;

@Component
public class JsoupUpstreamHttp implements UpstreamHttp {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
    // A search page is under 2 MB; anything much bigger is not what we are looking for.
    private static final int MAX_BODY_BYTES = 5 * 1024 * 1024;

    @Override
    public Response get(String url, Duration timeout, boolean followRedirects) throws IOException {
        Connection.Response response = Jsoup.connect(url)
                .userAgent(USER_AGENT)
                .timeout((int) timeout.toMillis())
                .maxBodySize(MAX_BODY_BYTES)
                .followRedirects(followRedirects)
                .ignoreContentType(true)
                .ignoreHttpErrors(true)
                .execute();
        return new Response(response.statusCode(), response.body());
    }
}
