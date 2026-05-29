#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/xui-db-backups"
COOKIE_JAR="$(mktemp)"
LOGIN_BODY_FILE="$(mktemp)"
INBOUNDS_FILE="$(mktemp)"
API_BODY_FILE="$(mktemp)"

cleanup() {
	rm -f "$COOKIE_JAR" "$LOGIN_BODY_FILE" "$INBOUNDS_FILE" "$API_BODY_FILE"
}

trap cleanup EXIT

if [[ -t 1 ]]; then
	RED="$(printf '\033[31m')"
	GREEN="$(printf '\033[32m')"
	YELLOW="$(printf '\033[33m')"
	BLUE="$(printf '\033[34m')"
	CYAN="$(printf '\033[36m')"
	BOLD="$(printf '\033[1m')"
	DIM="$(printf '\033[2m')"
	RESET="$(printf '\033[0m')"
else
	RED=""
	GREEN=""
	YELLOW=""
	BLUE=""
	CYAN=""
	BOLD=""
	DIM=""
	RESET=""
fi

info() {
	printf '%b\n' "${CYAN}$*${RESET}"
}

warn() {
	printf '%b\n' "${YELLOW}$*${RESET}" >&2
}

error() {
	printf '%b\n' "${RED}$*${RESET}" >&2
}

success() {
	printf '%b\n' "${GREEN}$*${RESET}"
}

die() {
	error "$1"
	exit 1
}

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

print_banner() {
	printf '%b\n' "${BOLD}${BLUE}============================================================${RESET}"
	printf '%b\n' "${BOLD}${BLUE}  X-UI Time Limit Remover${RESET}"
	printf '%b\n' "${DIM}  Creates a DB backup first, then clears expiry limits for every inbound and client.${RESET}"
	printf '%b\n' "${BOLD}${BLUE}============================================================${RESET}"
}

print_tip() {
	printf '%b\n' "${DIM}Tip: $1${RESET}"
}

prompt_input() {
	local label="$1"
	local tip="$2"
	local value=""

	printf '\n%b\n' "${BOLD}${label}${RESET}"
	print_tip "$tip"
	printf '> '
	read -r value

	while [[ -z "${value// }" ]]; do
		warn "This value cannot be empty."
		printf '> '
		read -r value
	done

	printf '%s' "$value"
}

prompt_secret() {
	local label="$1"
	local tip="$2"
	local value=""

	printf '\n%b\n' "${BOLD}${label}${RESET}"
	print_tip "$tip"
	printf '> '
	read -r -s value
	printf '\n'

	while [[ -z "${value// }" ]]; do
		warn "This value cannot be empty."
		printf '> '
		read -r -s value
		printf '\n'
	done

	printf '%s' "$value"
}

prompt_confirm() {
	local label="$1"
	local tip="$2"
	local answer=""

	printf '\n%b\n' "${BOLD}${label}${RESET}"
	print_tip "$tip"
	printf '> '
	read -r answer
	[[ "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]
}

normalize_url() {
	local input="$1"
	local trimmed="${input%/}"

	if [[ "$trimmed" == */panel ]]; then
		PANEL_URL="$trimmed"
		BASE_URL="${trimmed%/panel}"
	else
		BASE_URL="$trimmed"
		PANEL_URL="${trimmed}/panel"
	fi

	LOGIN_URL="${BASE_URL}/login"
}

curl_capture() {
	local output_file="$1"
	shift
	local status

	status="$(curl -sS -L -o "$output_file" -w '%{http_code}' "$@")" || return 1
	printf '%s' "$status"
}

api_get_json() {
	local endpoint="$1"
	local status

	status="$(curl_capture "$API_BODY_FILE" -b "$COOKIE_JAR" "${PANEL_URL}/api/${endpoint}")" || {
		error "Request failed for ${endpoint}."
		return 1
	}

	if [[ "$status" != "200" ]]; then
		error "Request failed for ${endpoint} with HTTP ${status}."
		return 1
	fi

	jq -e '.success == true' "$API_BODY_FILE" >/dev/null || {
		error "$(jq -r '.msg // "The panel API returned an error."' "$API_BODY_FILE")"
		return 1
	}

	cat "$API_BODY_FILE"
}

api_post_json() {
	local endpoint="$1"
	local payload="$2"
	local status

	status="$(curl_capture "$API_BODY_FILE" \
		-b "$COOKIE_JAR" \
		-H 'Content-Type: application/json' \
		-X POST \
		-d "$payload" \
		"${PANEL_URL}/api/${endpoint}")" || {
		error "Request failed for ${endpoint}."
		return 1
	}

	if [[ "$status" != "200" ]]; then
		error "Request failed for ${endpoint} with HTTP ${status}."
		return 1
	fi

	jq -e '.success == true' "$API_BODY_FILE" >/dev/null || {
		error "$(jq -r '.msg // "The panel API returned an error."' "$API_BODY_FILE")"
		return 1
	}
}

login() {
	local status

	status="$(curl_capture "$LOGIN_BODY_FILE" \
		-c "$COOKIE_JAR" \
		-H 'Content-Type: application/x-www-form-urlencoded' \
		-X POST \
		--data-urlencode "username=${USERNAME}" \
		--data-urlencode "password=${PASSWORD}" \
		"$LOGIN_URL")" || die "Login request failed."

	if [[ "$status" != "200" ]]; then
		die "Login failed with HTTP ${status}."
	fi

	jq -e '.success == true' "$LOGIN_BODY_FILE" >/dev/null || die "$(jq -r '.msg // "Login failed."' "$LOGIN_BODY_FILE")"
	[[ -s "$COOKIE_JAR" ]] || die "Login succeeded but no session cookie was returned."
}

backup_database() {
	local timestamp backup_file status

	mkdir -p "$BACKUP_DIR"
	timestamp="$(date '+%Y%m%d-%H%M%S')"
	backup_file="${BACKUP_DIR}/x-ui-db-${timestamp}.sqlite3"

	info "Creating SQLite backup first..."
	status="$(curl_capture "$backup_file" -b "$COOKIE_JAR" "${PANEL_URL}/api/server/getDb")" || die "Failed to download the database backup."

	if [[ "$status" != "200" ]]; then
		rm -f "$backup_file"
		die "Database backup failed with HTTP ${status}."
	fi

	if [[ ! -s "$backup_file" ]]; then
		rm -f "$backup_file"
		die "Database backup file was empty."
	fi

	BACKUP_FILE="$backup_file"
}

update_all_inbounds() {
	local inbound_count=0
	local updated_inbounds=0
	local skipped_inbounds=0
	local total_clients=0
	local changed_clients=0
	local inbound_json inbound_id remark client_count changed_count settings_json updated_settings payload

	api_get_json "inbounds/list" > "$INBOUNDS_FILE"
	inbound_count="$(jq '.obj | length' "$INBOUNDS_FILE")"

	if [[ "$inbound_count" -eq 0 ]]; then
		warn "No inbounds were found. Nothing needed to be changed."
		return 0
	fi

	info "Found ${inbound_count} inbound(s). Updating expiry settings..."

	while IFS= read -r inbound_json; do
		inbound_id="$(printf '%s\n' "$inbound_json" | jq -r '.id')"
		remark="$(printf '%s\n' "$inbound_json" | jq -r '.remark // "(no remark)"')"

		if ! settings_json="$(printf '%s\n' "$inbound_json" | jq -cer '.settings | fromjson')" 2>/dev/null; then
			warn "Skipping inbound #${inbound_id} (${remark}) because its settings JSON could not be parsed."
			skipped_inbounds=$((skipped_inbounds + 1))
			continue
		fi

		client_count="$(printf '%s\n' "$settings_json" | jq '(.clients // []) | length')"
		changed_count="$(printf '%s\n' "$settings_json" | jq '[.clients[]? | select(((.expiryTime // 0) != 0) or ((.expiryDays // 0) != 0) or ((.totalDays // 0) != 0) or ((.expireDays // 0) != 0) or ((.day // 0) != 0) or ((.days // 0) != 0))] | length')"
		total_clients=$((total_clients + client_count))
		changed_clients=$((changed_clients + changed_count))

		updated_settings="$(printf '%s\n' "$settings_json" | jq -c '
			.clients = ((.clients // []) | map(
				.expiryTime = 0
				| .expiryDays = 0
				| .totalDays = 0
				| .expireDays = 0
				| .day = 0
				| .days = 0
			))
		')"

		payload="$(printf '%s\n' "$inbound_json" | jq -c --arg settings "$updated_settings" '
			{
				up: (.up // 0),
				down: (.down // 0),
				total: (.total // 0),
				remark: (.remark // ""),
				enable: (.enable // true),
				expiryTime: 0,
				listen: (.listen // ""),
				port: .port,
				protocol: .protocol,
				settings: $settings,
				streamSettings: (.streamSettings // ""),
				sniffing: (.sniffing // ""),
				allocate: (.allocate // "")
			}
			+ (if has("tag") then {tag: .tag} else {} end)
			+ (if has("trafficReset") then {trafficReset: .trafficReset} else {} end)
		')"

		api_post_json "inbounds/update/${inbound_id}" "$payload" || {
			warn "Update failed for inbound #${inbound_id} (${remark})."
			skipped_inbounds=$((skipped_inbounds + 1))
			continue
		}

		updated_inbounds=$((updated_inbounds + 1))
		success "Updated inbound #${inbound_id} (${remark})"
	done < <(jq -c '.obj[]' "$INBOUNDS_FILE")

	printf '\n'
	success "Finished."
	printf '%b\n' "${BOLD}Backup:${RESET} ${BACKUP_FILE}"
	printf '%b\n' "${BOLD}Updated inbounds:${RESET} ${updated_inbounds}/${inbound_count}"
	printf '%b\n' "${BOLD}Skipped inbounds:${RESET} ${skipped_inbounds}"
	printf '%b\n' "${BOLD}Clients scanned:${RESET} ${total_clients}"
	printf '%b\n' "${BOLD}Clients with time limits cleared:${RESET} ${changed_clients}"
}

main() {
	require_cmd curl
	require_cmd jq

	print_banner

	PANEL_INPUT="$(prompt_input "Panel address" "Enter the full x-ui panel URL. Example: https://panel.example.com/panel . If you enter only the base address, /panel will be added automatically.")"
	USERNAME="$(prompt_input "Username" "Enter the same admin username you use to sign in to the x-ui panel.")"
	PASSWORD="$(prompt_secret "Password" "Enter the admin password for that x-ui panel account. Input is hidden while you type.")"

	normalize_url "$PANEL_INPUT"

	printf '\n%b\n' "${BOLD}Summary${RESET}"
	printf 'Panel API: %s\n' "$PANEL_URL"
	printf 'Login URL: %s\n' "$LOGIN_URL"
	printf 'Backup folder: %s\n' "$BACKUP_DIR"

	prompt_confirm "Continue?" "Type y or yes to create the backup and remove all inbound/client time limits." || {
		warn "Operation cancelled."
		exit 0
	}

	info "Logging in to the panel..."
	login

	backup_database
	update_all_inbounds
}

main "$@"
