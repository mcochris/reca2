#!/bin/sh
set -e

# Ubuntu 24.04+ restricts unprivileged user namespaces via AppArmor by
# default, which breaks bubblewrap (bwrap) and, with it, WebKitGTK's
# per-tab sandbox (used by this app's webview) — the app aborts on launch.
# This installs the standard community fix: an AppArmor profile granting
# bwrap the userns capability. See https://bugs.launchpad.net/apparmor/+bug/2046844
#
# Left in place on uninstall: other bwrap-sandboxed apps on the system
# (Flatpak, Electron apps, etc.) may come to depend on it too.
PROFILE=/etc/apparmor.d/bwrap

if [ -d /etc/apparmor.d ] && [ ! -e "$PROFILE" ]; then
  cat > "$PROFILE" <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
  include if exists <local/bwrap>
}
EOF

  if command -v apparmor_parser >/dev/null 2>&1; then
    apparmor_parser -r "$PROFILE" 2>/dev/null || true
  fi
fi

exit 0
