#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="${SKYLINE_SERVICE:-skyline}"
REPO_URL="${SKYLINE_REPO_URL:-https://gitlab.chabokan.net/catinrage/skyline.git}"
INSTALL_DIR="${SKYLINE_INSTALL_DIR:-/opt/skyline}"
BRANCH="${SKYLINE_BRANCH:-main}"
SKIP_BUILD=0
SKIP_SERVICE=0
BOOTSTRAPPED=0

usage() {
	cat <<USAGE
Skyline installer

Usage:
  ./install.sh [--no-build] [--no-service]
  curl -Ls https://gitlab.chabokan.net/catinrage/skyline/-/raw/main/install.sh | bash

What it does:
  - clones or updates Skyline when run through curl
  - installs npm dependencies with npm ci
  - builds Skyline
  - installs the sky CLI at /usr/local/bin/sky
  - optionally creates/enables a systemd service named ${SERVICE_NAME}

Environment:
  SKYLINE_SERVICE      Service name, default: skyline
  SKYLINE_REPO_URL     Git repository URL, default: ${REPO_URL}
  SKYLINE_INSTALL_DIR  Install directory, default: ${INSTALL_DIR}
  SKYLINE_BRANCH       Git branch, default: ${BRANCH}
USAGE
}

for arg in "$@"; do
	case "$arg" in
		--help|-h) usage; exit 0 ;;
		--no-build) SKIP_BUILD=1 ;;
		--no-service) SKIP_SERVICE=1 ;;
		--bootstrapped) BOOTSTRAPPED=1 ;;
		*) echo "Unknown option: $arg" >&2; usage; exit 1 ;;
	esac
done

if [ "$BOOTSTRAPPED" -eq 0 ] && { [ ! -f "$APP_DIR/package.json" ] || [ ! -d "$APP_DIR/.git" ]; }; then
	if ! command -v git >/dev/null 2>&1; then
		echo "git is required for one-command installation." >&2
		exit 1
	fi

	SUDO=""
	if [ "$(id -u)" -ne 0 ]; then
		SUDO="sudo"
	fi

	if [ -d "$INSTALL_DIR/.git" ]; then
		$SUDO git -C "$INSTALL_DIR" fetch origin "$BRANCH"
		$SUDO git -C "$INSTALL_DIR" checkout "$BRANCH"
		$SUDO git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
	else
		$SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
		$SUDO git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
	fi

	exec $SUDO bash "$INSTALL_DIR/install.sh" --bootstrapped "$@"
fi

if ! command -v node >/dev/null 2>&1; then
	echo "Node.js is required." >&2
	exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
	echo "npm is required." >&2
	exit 1
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
	SUDO="sudo"
fi

cd "$APP_DIR"

if [ "$SKIP_BUILD" -eq 0 ]; then
	npm ci
	npm run build
fi

chmod +x "$APP_DIR/scripts/sky.mjs" "$APP_DIR/scripts/skyline-cli.mjs"
$SUDO ln -sf "$APP_DIR/scripts/sky.mjs" /usr/local/bin/sky

echo "Installed sky CLI: /usr/local/bin/sky"

if [ "$SKIP_SERVICE" -eq 1 ]; then
	echo "Skipped systemd service setup."
	exit 0
fi

if ! command -v systemctl >/dev/null 2>&1; then
	echo "systemctl was not found. Service setup skipped."
	exit 0
fi

NPM_BIN="$(command -v npm)"
TMP_SERVICE="$(mktemp)"
cat > "$TMP_SERVICE" <<SERVICE
[Unit]
Description=Skyline VPN Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=${NPM_BIN} run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

$SUDO install -m 0644 "$TMP_SERVICE" "/etc/systemd/system/${SERVICE_NAME}.service"
rm -f "$TMP_SERVICE"
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$SERVICE_NAME"

echo "Installed and started systemd service: ${SERVICE_NAME}"
echo "Use: sky service status"
