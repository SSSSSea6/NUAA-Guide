#!/bin/sh
# Forced SSH command for the `nuaaguide` deploy user on the Hong Kong server.
# Installed as /usr/local/bin/nuaaguide-deploy and bound to the CI key in
# ~nuaaguide/.ssh/authorized_keys with `restrict,command="..."`.
#
# Reads a gzipped tar of Hugo's public/ on stdin, unpacks it as a new release,
# then switches /var/www/nuaa-guide/current to it atomically.
set -eu
umask 022

BASE=/var/www/nuaa-guide
KEEP=5

if [ "${SSH_ORIGINAL_COMMAND:-deploy}" != "deploy" ]; then
    echo "unsupported command" >&2
    exit 2
fi

release="$BASE/releases/$(date -u +%Y%m%d%H%M%S)"
staging="$release.partial"

mkdir -p "$staging"
if ! tar -xzf - -C "$staging" --no-same-owner --no-same-permissions; then
    rm -rf "$staging"
    echo "failed to unpack archive" >&2
    exit 1
fi
if [ ! -f "$staging/index.html" ] || [ ! -f "$staging/404.html" ]; then
    rm -rf "$staging"
    echo "archive is missing index.html or 404.html" >&2
    exit 1
fi

mv "$staging" "$release"
ln -sfn "$release" "$BASE/current.next"
mv -T "$BASE/current.next" "$BASE/current"

cd "$BASE/releases"
ls -1d 2* | sort | head -n "-$KEEP" | xargs -r rm -rf

echo "deployed $(basename "$release")"
