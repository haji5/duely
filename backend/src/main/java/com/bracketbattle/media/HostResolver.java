package com.bracketbattle.media;

import java.net.InetAddress;
import java.net.UnknownHostException;

/** DNS lookup, behind an interface so tests don't depend on the network. */
@FunctionalInterface
public interface HostResolver {
    InetAddress[] resolve(String host) throws UnknownHostException;
}
