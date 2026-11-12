package com.bracketbattle.ratelimit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class ClientSubjectTest {

    @Test
    void keepsIpv4AsIs() {
        assertThat(ClientSubject.fromAddress("203.0.113.7")).isEqualTo("203.0.113.7");
        assertThat(ClientSubject.fromAddress("0.0.0.0")).isEqualTo("0.0.0.0");
        assertThat(ClientSubject.fromAddress("255.255.255.255")).isEqualTo("255.255.255.255");
        assertThat(ClientSubject.fromAddress(" 10.1.2.3 ")).isEqualTo("10.1.2.3");
    }

    @Test
    void truncatesIpv6ToItsSlash64() {
        assertThat(ClientSubject.fromAddress("2001:db8:1:2:3:4:5:6")).isEqualTo("2001:db8:1:2::/64");
        assertThat(ClientSubject.fromAddress("2001:0DB8:0001:0002:ffff:ffff:ffff:ffff")).isEqualTo("2001:db8:1:2::/64");
        assertThat(ClientSubject.fromAddress("2001:db8::1")).isEqualTo("2001:db8:0:0::/64");
        assertThat(ClientSubject.fromAddress("::1")).isEqualTo("0:0:0:0::/64");
        assertThat(ClientSubject.fromAddress("[2001:db8:1:2::9]")).isEqualTo("2001:db8:1:2::/64");
        assertThat(ClientSubject.fromAddress("fe80::1%eth0")).isEqualTo("fe80:0:0:0::/64");
    }

    @Test
    void addressesInOneSlash64ShareASubject() {
        assertThat(ClientSubject.fromAddress("2a02:8070:abcd:1200:1111:2222:3333:4444"))
                .isEqualTo(ClientSubject.fromAddress("2a02:8070:abcd:1200:9999::1"))
                .isNotEqualTo(ClientSubject.fromAddress("2a02:8070:abcd:1201:1111:2222:3333:4444"));
    }

    @Test
    void unwrapsIpv4MappedIpv6() {
        assertThat(ClientSubject.fromAddress("::ffff:203.0.113.7")).isEqualTo("203.0.113.7");
        assertThat(ClientSubject.fromAddress("::FFFF:cb00:7107")).isEqualTo("203.0.113.7");
        assertThat(ClientSubject.fromAddress("[::ffff:198.51.100.1]")).isEqualTo("198.51.100.1");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"localhost", "example.com", "256.1.1.1", "1.2.3", "1.2.3.4.5", "01.2.3.4",
            "1:2:3:4:5:6:7:8:9", "2001:db8::g", ":::", ".:", "a:", "unknown", "[1.2.3.4", "1.2.3.4]",
            "1.2.3.4:8080", "2001:db8::1 junk"})
    void sharesOneSubjectForGarbage(String address) {
        assertThat(ClientSubject.fromAddress(address)).isEqualTo(ClientSubject.UNKNOWN);
    }

    @Test
    void readsTheRequestsRemoteAddress() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("2001:db8:aa:bb::77");
        assertThat(ClientSubject.of(request)).isEqualTo("2001:db8:aa:bb::/64");
    }
}
