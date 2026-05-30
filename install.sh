#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="${SKYLINE_SERVICE:-skyline}"
REPO_URL="${SKYLINE_REPO_URL:-https://github.com/catinrage/skyline.git}"
INSTALL_DIR="${SKYLINE_INSTALL_DIR:-/opt/skyline}"
BRANCH="${SKYLINE_BRANCH:-main}"
SKIP_BUILD=0
SKIP_SERVICE=0
BOOTSTRAPPED=0
PROXY=""
PROXY_NPM=0

usage() {
	cat <<USAGE
Skyline installer

Usage:
  ./install.sh [options]
  curl -Ls https://raw.githubusercontent.com/catinrage/skyline/main/install.sh | bash -s -- [options]

Options:
  --proxy <url>     SOCKS5 proxy for git (GitHub clone/pull). Required when
                    GitHub is filtered. Format: socks5://user:pass@host:port
                    or socks5://host:port for unauthenticated proxies.
  --npm-proxy       Also route npm ci through the proxy. Use when the npm
                    registry is filtered in addition to GitHub.
  --no-build        Skip npm ci + build (useful for re-running service setup).
  --no-service      Skip systemd service creation.

Environment overrides:
  SKYLINE_SERVICE      Service name, default: skyline
  SKYLINE_REPO_URL     Git repository URL, default: ${REPO_URL}
  SKYLINE_INSTALL_DIR  Install directory, default: ${INSTALL_DIR}
  SKYLINE_BRANCH       Git branch, default: ${BRANCH}

One-command install behind a proxy:
  curl --proxy socks5h://host:port -Ls \\
    https://raw.githubusercontent.com/catinrage/skyline/main/install.sh | \\
    bash -s -- --proxy socks5://host:port
USAGE
}

FORWARD_ARGS=()

while [ $# -gt 0 ]; do
	case "$1" in
		--help|-h)
			usage; exit 0 ;;
		--no-build)
			SKIP_BUILD=1; FORWARD_ARGS+=("$1"); shift ;;
		--no-service)
			SKIP_SERVICE=1; FORWARD_ARGS+=("$1"); shift ;;
		--bootstrapped)
			BOOTSTRAPPED=1; shift ;;
		--npm-proxy)
			PROXY_NPM=1; FORWARD_ARGS+=("$1"); shift ;;
		--proxy)
			shift
			if [ $# -eq 0 ]; then
				echo "Error: --proxy requires a value (e.g. socks5://host:port)" >&2
				exit 1
			fi
			PROXY="$1"; FORWARD_ARGS+=(--proxy "$1"); shift ;;
		--proxy=*)
			PROXY="${1#--proxy=}"; FORWARD_ARGS+=("$1"); shift ;;
		*)
			echo "Unknown option: $1" >&2; usage; exit 1 ;;
	esac
done

# Build git proxy args: convert socks5:// to socks5h:// so git resolves
# hostnames via the proxy (avoids DNS leaks on filtered networks).
GIT_PROXY_ARGS=()
if [ -n "$PROXY" ]; then
	GIT_PROXY_URL="${PROXY/socks5:\/\//socks5h://}"
	GIT_PROXY_ARGS=(-c "http.proxy=${GIT_PROXY_URL}" -c "https.proxy=${GIT_PROXY_URL}")
fi

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
		$SUDO git "${GIT_PROXY_ARGS[@]}" -C "$INSTALL_DIR" fetch origin "$BRANCH"
		$SUDO git "${GIT_PROXY_ARGS[@]}" -C "$INSTALL_DIR" checkout "$BRANCH"
		$SUDO git "${GIT_PROXY_ARGS[@]}" -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
	else
		$SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
		$SUDO git "${GIT_PROXY_ARGS[@]}" clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
	fi

	exec $SUDO bash "$INSTALL_DIR/install.sh" --bootstrapped "${FORWARD_ARGS[@]}"
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
	if [ "$PROXY_NPM" -eq 1 ] && [ -n "$PROXY" ]; then
		echo "npm: routing through proxy ${PROXY}"
		HTTPS_PROXY="$PROXY" HTTP_PROXY="$PROXY" npm ci
	else
		npm ci
	fi
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

NODE_BIN="$(command -v node)"
TMP_SERVICE="$(mktemp)"
cat > "$TMP_SERVICE" <<SERVICE
[Unit]
Description=Skyline VPN Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=${NODE_BIN} --env-file=.env build/index.js
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
