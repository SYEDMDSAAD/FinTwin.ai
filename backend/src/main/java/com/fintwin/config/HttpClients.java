package com.fintwin.config;

import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * Factory helpers for {@link RestTemplate}s that call external third-party APIs.
 *
 * A bare {@code new RestTemplate()} uses Spring's default
 * {@link SimpleClientHttpRequestFactory}, which has <b>infinite</b> connect and
 * read timeouts. A slow or unresponsive remote then blocks the calling thread
 * forever; enough stuck calls exhaust the Tomcat worker pool and take the whole
 * backend down. Always build outbound clients with explicit timeouts.
 */
public final class HttpClients {

    private HttpClients() {}

    /** Connect 5 s, read 15 s — sensible defaults for external REST APIs. */
    public static RestTemplate externalApi() {
        return externalApi(5_000, 15_000);
    }

    public static RestTemplate externalApi(int connectMs, int readMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectMs);
        factory.setReadTimeout(readMs);
        return new RestTemplate(factory);
    }
}
