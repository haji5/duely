package com.bracketbattle.media;

import java.io.IOException;
import java.time.Duration;

/** GET requests to the sites the bracket creator scrapes, behind an interface so tests don't use the network. */
public interface UpstreamHttp {

    /** Any status is returned rather than thrown; IOException means no answer at all. */
    Response get(String url, Duration timeout, boolean followRedirects) throws IOException;

    record Response(int status, String body) {
        public boolean ok() {
            return status >= 200 && status < 300;
        }
    }
}
