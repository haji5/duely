#!/bin/sh
# Database backups for the backup service in docker-compose.prod.yml (runs in the postgres image,
# which has pg_dump and pg_restore; PGHOST, PGUSER, PGPASSWORD and PGDATABASE come from Compose).
#
#   backup.sh                 every day at BACKUP_TIME (TZ, default 03:30 UTC) write
#                             /backups/duely-<date>-<time>.dump (pg_dump -Fc) and delete dumps
#                             older than BACKUP_KEEP_DAYS (14). On start, dump at once if the
#                             newest dump is more than a day old.
#   backup.sh now             one dump now, with the same retention.
#   backup.sh restore FILE    replace the database with FILE (a name in /backups or a path).
#                             Refuses while anything else is connected, so stop the backend
#                             first. Dumps the current database to /backups/pre-restore-*.dump
#                             (never deleted automatically) before dropping it.
#
# BACKUP_HOOK, if set, is run with the new dump's path after each dump: the place to copy it off
# this machine (mount the script and whatever it needs into the container).
set -eu

dir=/backups
keep=${BACKUP_KEEP_DAYS:-14}
at=${BACKUP_TIME:-03:30}

log() { echo "backup: $*"; }

dump() { # dump NAME: write $dir/NAME atomically, so a half-written file never looks like a backup
    tmp="$dir/.$1.partial"
    if ! pg_dump -Fc -f "$tmp"; then
        rm -f "$tmp"
        log "pg_dump failed" >&2
        return 1
    fi
    mv "$tmp" "$dir/$1"
    log "wrote $dir/$1 ($(du -h "$dir/$1" | cut -f1))"
}

backup() {
    name="duely-$(date +%Y%m%d-%H%M%S).dump"
    dump "$name" || return 1
    find "$dir" -maxdepth 1 -name 'duely-*.dump' -mtime +$((keep - 1)) -print -exec rm -f {} \; \
        | sed 's/^/backup: deleted /'
    if [ -n "${BACKUP_HOOK:-}" ]; then
        "$BACKUP_HOOK" "$dir/$name" || log "BACKUP_HOOK failed for $name" >&2
    fi
}

restore() {
    file=$1
    case "$file" in /*) ;; *) file="$dir/$file" ;; esac
    [ -f "$file" ] || { log "no such dump: $file" >&2; exit 1; }
    pg_restore --list "$file" > /dev/null || { log "not a pg_dump -Fc file: $file" >&2; exit 1; }
    others=$(psql -Atc "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")
    if [ "$others" != 0 ]; then
        log "$others other connection(s) to $PGDATABASE; stop the backend first" >&2
        exit 1
    fi
    dump "pre-restore-$(date +%Y%m%d-%H%M%S).dump"
    dropdb --force "$PGDATABASE"
    createdb "$PGDATABASE"
    pg_restore --no-owner --exit-on-error -d "$PGDATABASE" "$file"
    log "restored $file into $PGDATABASE"
}

case "${1:-}" in
    now) backup; exit ;;
    restore) [ $# -eq 2 ] || { log "usage: backup.sh restore FILE" >&2; exit 2; }; restore "$2"; exit ;;
    "") ;;
    *) log "unknown command: $1" >&2; exit 2 ;;
esac

trap 'exit 0' TERM INT
log "dumping $PGDATABASE daily at $at ($(date +%Z)), keeping $keep days, into $dir"
if [ -z "$(find "$dir" -maxdepth 1 -name 'duely-*.dump' -mtime -1)" ]; then
    backup || true
fi
done_on=""
while :; do
    if [ "$(date +%H:%M)" = "$at" ] && [ "$(date +%F)" != "$done_on" ]; then
        backup || true
        done_on=$(date +%F)
    fi
    sleep 20 & wait $!
done
