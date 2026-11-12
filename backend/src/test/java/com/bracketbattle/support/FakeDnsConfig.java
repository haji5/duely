package com.bracketbattle.support;

import com.bracketbattle.media.HostResolver;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * Keeps tests off the network. DNS resolves every name to a public address, except hosts that
 * name a private or missing one; the scraped sites are a {@link FakeUpstreamHttp}.
 */
@TestConfiguration
public class FakeDnsConfig {
    @Bean
    @Primary
    FakeUpstreamHttp fakeUpstreamHttp() {
        return new FakeUpstreamHttp();
    }

    @Bean
    @Primary
    HostResolver fakeHostResolver() {
        return host -> {
            if (host.contains("nxdomain")) throw new UnknownHostException(host);
            String ip = host.contains("private") ? "10.0.0.7" : "93.184.216.34";
            return new InetAddress[]{InetAddress.getByName(ip)};
        };
    }
}
