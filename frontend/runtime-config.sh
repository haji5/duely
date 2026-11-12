#!/bin/sh
# Writes the deployment-specific part of the nginx config at container start, so one image runs
# behind any proxy and on any domain. Run by the nginx image's entrypoint (/docker-entrypoint.d);
# a bad value stops the container instead of serving with a wrong setting.
#
#   TRUSTED_PROXIES  addresses or CIDRs, comma- or space-separated, allowed to report the client
#                    address in REAL_IP_HEADER (the tunnel or the provider's load balancer).
#                    Empty: every client is identified by the address it connects from.
#   REAL_IP_HEADER   the header those proxies put the client address in (default X-Forwarded-For;
#                    nginx takes its last address, the one the trusted proxy appended).
#   PUBLIC_BASE_URL  the public origin, filled into <meta name="public-origin"> in the shell.
set -eu

out=/etc/nginx/runtime
fail() { echo "$0: $*" >&2; exit 1; }

header=${REAL_IP_HEADER:-X-Forwarded-For}
case "$header" in
    *[!A-Za-z0-9-]*) fail "REAL_IP_HEADER is not a header name: $header" ;;
esac

{
    for proxy in $(echo "${TRUSTED_PROXIES:-}" | tr ',' ' '); do
        case "$proxy" in
            *[!0-9A-Fa-f.:/]*) fail "TRUSTED_PROXIES: not an address or CIDR: $proxy" ;;
        esac
        echo "set_real_ip_from $proxy;"
    done
    echo "real_ip_header $header;"
} > "$out/real-ip.conf"

if ! grep -q set_real_ip_from "$out/real-ip.conf"; then
    echo "$0: no TRUSTED_PROXIES: clients are identified by the address they connect from"
fi

origin=${PUBLIC_BASE_URL:-}
origin=${origin%/}
if [ -n "$origin" ] && ! echo "$origin" | grep -Eq '^https?://[][A-Za-z0-9.:-]+$'; then
    fail "PUBLIC_BASE_URL must be an origin like https://duely.example: $origin"
fi
echo "map \$host \$public_origin { default \"$origin\"; }" > "$out/origin.conf"
