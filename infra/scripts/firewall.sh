#!/usr/bin/env bash
# Pare-feu atelier : ferme depuis Internet le port publié par docker-compose (web: 8090),
# qui ne doit être joignable que via le tunnel Cloudflare (loopback). Idempotent.
set -euo pipefail

EXT_IFACE="${EXT_IFACE:-$(ip -4 route get 1.1.1.1 | grep -oP 'dev \K\S+')}"
DOCKER_PORTS="8090"

iptables -N ATELIER-DOCKER 2>/dev/null || iptables -F ATELIER-DOCKER
for port in $DOCKER_PORTS; do
  iptables -A ATELIER-DOCKER -i "$EXT_IFACE" -p tcp -m conntrack --ctorigdstport "$port" -j DROP
done
iptables -A ATELIER-DOCKER -j RETURN
iptables -C DOCKER-USER -j ATELIER-DOCKER 2>/dev/null || iptables -I DOCKER-USER 1 -j ATELIER-DOCKER

echo "Firewall atelier appliqué (interface externe : ${EXT_IFACE})"
