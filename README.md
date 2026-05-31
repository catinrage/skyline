# Skyline

Skyline is a SvelteKit and Node.js control panel for operating a VPN business on top of x-ui or 3x-ui. It provides a manager panel, reseller panel, public user pages, password recovery over SMTP, protected panel paths, and a server-side CLI named `sky` for day-to-day VPS operations.

## Features

- Manager panel for traffic, resellers, plans, groups, credit requests, reports, backups, runtime settings, SMTP settings, client apps, and security controls.
- Reseller panel for creating and managing configs, finance, tickets, sub-resellers, account security, and custom messages.
- Public user panel at `/user/:uuid` with traffic, expiry, VLESS link, QR code, subscription support, and latency/report actions.
- Hidden manager/reseller base paths so `/manage` and `/reseller` can be disabled from public use.
- Unified Skyline login screen for manager and reseller routes.
- SMTP-backed password recovery for reseller accounts.
- `sky` CLI for service control, admin credential reset, panel path management, reseller account operations, updates, and DB checks.
- Changesets-based versioning with the UI version badge synced from `package.json`.

## Requirements

- Linux VPS with `systemd` for the recommended production install.
- Node.js and npm available on the server.
- Git and curl for the one-command installer.
- x-ui or 3x-ui already running and reachable from the Skyline server.
- A 3x-ui API token from the x-ui/3x-ui panel.
- Optional but recommended: a reverse proxy with HTTPS in front of Skyline.

## One-Command Install

Run this on the VPS:

```bash
curl -Ls https://raw.githubusercontent.com/catinrage/skyline/main/install.sh | bash
```

The installer clones or updates Skyline in `/opt/skyline`, installs dependencies with `npm ci`, builds the app, installs `/usr/local/bin/sky`, and creates/enables a `skyline` systemd service.

Useful install overrides:

```bash
curl -Ls https://raw.githubusercontent.com/catinrage/skyline/main/install.sh | SKYLINE_INSTALL_DIR=/srv/skyline bash
curl -Ls https://raw.githubusercontent.com/catinrage/skyline/main/install.sh | SKYLINE_BRANCH=main bash
curl -Ls https://raw.githubusercontent.com/catinrage/skyline/main/install.sh | bash -s -- --no-service
```

From an already-cloned project directory:

```bash
./install.sh
```

Use `./install.sh --no-service` when you only want dependencies, build output, and the `sky` symlink.

## Environment

Skyline now keeps x-ui, Xray, logging, SMTP, panel paths, and most runtime configuration in the manager panel settings. Keep `.env` focused on deployment-level process settings only.

Create `/opt/skyline/.env` after install, or create `.env` before running locally:

```bash
HOST=0.0.0.0
PORT=9133
```

Optional deployment settings:

```bash
# Use this only when serving Skyline directly without forwarded headers.
ORIGIN=https://panel.example.com

# Prefer these behind Nginx/Caddy/Cloudflare Tunnel/reverse proxies.
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
PORT_HEADER=x-forwarded-port

# Optional custom SQLite path. Default: data/skyline.sqlite
DATABASE_PATH=/opt/skyline/data/skyline.sqlite
```

Configure these from the manager panel after first login:

- x-ui/3x-ui panel URL and API token.
- Public host used in generated VLESS links.
- Xray binary path for server-side latency tests.
- Log level and optional log file.
- SMTP password recovery settings.
- Hidden manager/reseller panel paths.

Restart only when changing process-level `.env` values:

```bash
sky restart
```

## First Login

Default manager login is initialized by the app on first use:

- Username: `admin`
- Password: `passkey`

Change it immediately:

```bash
sky admin reset new-admin strong-password-here
```

Or use the manager panel security tab after login.

## CLI

Run `sky` with no arguments for an interactive menu.

Service commands:

```bash
sky status
sky start
sky stop
sky restart
sky logs
sky enable
sky disable
sky update
```

The old namespace is also supported:

```bash
sky service status
sky service start
sky service stop
sky service restart
sky service logs
```

Admin commands:

```bash
sky admin show
sky admin username new-admin
sky admin password
sky admin reset new-admin strong-password-here
```

Panel path commands:

```bash
sky paths show
sky paths set managersecret resellersecret
sky paths clear
```

When paths are set, manager login moves to `/<managersecret>/manager` and reseller login moves to `/<resellersecret>/reseller`. The default `/manage` and `/reseller` paths are disabled by the app when hidden paths are configured.

Reseller commands:

```bash
sky resellers list
sky resellers create seller1
sky resellers password 12
sky resellers reset-password 12
sky resellers activate 12
sky resellers deactivate 12
```

Database commands:

```bash
sky db path
sky db integrity
```

CLI environment overrides:

```bash
DATABASE_PATH=/srv/skyline/data/skyline.sqlite sky db integrity
SKYLINE_SERVICE=skyline-staging sky restart
```

## Updating

For installs managed by Git:

```bash
sky update
```

This runs `git pull --ff-only`, `npm ci`, `npm run build`, and restarts the systemd service.

Manual update:

```bash
cd /opt/skyline
git pull --ff-only
npm ci
npm run build
sky restart
```

## Development

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Useful development commands:

```bash
npm run check
npm run build
npm run changeset
npm run version
npm run sky -- help
```

The app listens on `0.0.0.0` in dev and preview mode.

## Production Runtime

The installer creates a service equivalent to:

```ini
[Unit]
Description=Skyline VPN Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/skyline
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

The production start command is:

```bash
node --env-file=.env build/index.js
```

For manual process managers, keep the working directory pointed at the Skyline project so the SQLite database remains under `data/skyline.sqlite` unless `DATABASE_PATH` is set.

## Reverse Proxy

Example Nginx server block:

```nginx
server {
    listen 80;
    server_name panel.example.com;

    location / {
        proxy_pass http://127.0.0.1:9133;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

When using forwarded headers, set:

```bash
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
PORT_HEADER=x-forwarded-port
```

## SMTP Password Recovery

Configure SMTP in the manager panel settings. Password recovery reads SMTP credentials from Skyline settings at runtime.

Typical settings:

- SMTP host and port.
- Username/password or provider token.
- Sender email/name.
- Public app URL matching your HTTPS domain.

A VPS by itself is not enough for reliable email delivery. For password recovery, use a real SMTP provider or a properly configured mail server with SPF, DKIM, DMARC, reverse DNS, and sane sending reputation.

## Backups

Skyline stores data in SQLite. Default path:

```bash
/opt/skyline/data/skyline.sqlite
```

Check the active path:

```bash
sky db path
```

Use the manager panel backup tools for app-managed backups, or stop the service and copy the SQLite database manually:

```bash
sky stop
cp /opt/skyline/data/skyline.sqlite /root/skyline-$(date +%F).sqlite
sky start
```

## Notes

- Skyline talks to x-ui/3x-ui over the HTTP API. It does not read the x-ui SQLite database directly.
- Generated links currently target VLESS inbounds and reuse stream settings from x-ui/3x-ui where available.
- The config latency test launches a temporary local Xray client and checks `https://www.gstatic.com/generate_204` through the user config by default.
- Unlimited plans are handled when `totalGB <= 0`.
- Some rate limits are in-memory and reset when the Skyline process restarts.
- Bun can still be used as a package manager, but the production runtime is Node.js.

## Troubleshooting

Check service status and logs:

```bash
sky status
sky logs
```

Validate the database:

```bash
sky db integrity
```

Common production issues:

- `403 Forbidden` on form submit: set `ORIGIN` correctly or configure forwarded headers behind the reverse proxy.
- x-ui data does not load: verify the x-ui/3x-ui URL and API token in the manager panel settings.
- Latency test fails: verify the Xray binary path in manager settings, confirm `curl` exists on the server, and avoid `google.com` as the latency target because many datacenter/VPN routes fail its TLS handshake.
- Emails do not arrive: verify SMTP credentials and DNS deliverability records.
