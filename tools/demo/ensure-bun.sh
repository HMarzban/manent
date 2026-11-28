#!/bin/sh
# Ensures Bun (at least the version pinned in package.json) is available on PATH,
# optionally installing missing prerequisites and Bun first, then runs the given command.
set -u

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH='' cd -- "$SCRIPT_DIR/../.." && pwd)"

MIN_BUN="$(sed -n 's/.*"packageManager"[[:space:]]*:[[:space:]]*"bun@\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)".*/\1/p' "$REPO_ROOT/package.json" 2>/dev/null | head -n 1)"
[ -n "$MIN_BUN" ] || MIN_BUN="1.4.4"

MIN_MAJOR=1
MIN_MINOR=4
MIN_PATCH=4

parse_min_bun() {
  old_ifs="$IFS"
  IFS=.
  # shellcheck disable=SC2086
  set -- $1
  IFS="$old_ifs"
  MIN_MAJOR="${1:-1}"
  MIN_MINOR="${2:-4}"
  MIN_PATCH="${3:-4}"
}

parse_min_bun "$MIN_BUN"

is_windows_shell() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    MINGW* | MSYS* | CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

install_hint() {
  if is_windows_shell; then
    printf '%s' 'powershell -c "irm bun.com/install.ps1 | iex"'
  else
    printf '%s' 'curl -fsSL https://bun.com/install | bash'
  fi
}

pronoun_for() {
  case "$1" in
    *" "*) printf '%s' "them" ;;
    *) printf '%s' "it" ;;
  esac
}

version_ok() {
  v_clean="$(printf '%s' "$1" | tr -d '\r\n' | sed 's/+.*//')"
  v_pre=""
  case "$v_clean" in
    *-*)
      v_pre="${v_clean#*-}"
      v_clean="${v_clean%%-*}"
      ;;
  esac
  old_ifs="$IFS"
  IFS=.
  # shellcheck disable=SC2086
  set -- $v_clean
  IFS="$old_ifs"
  v_maj="${1:-}"
  v_min="${2:-}"
  v_pat="${3:-}"
  case "$v_maj" in "" | *[!0-9]*) return 1 ;; esac
  case "$v_min" in "" | *[!0-9]*) return 1 ;; esac
  case "$v_pat" in "" | *[!0-9]*) return 1 ;; esac
  if [ "$v_maj" -gt "$MIN_MAJOR" ]; then return 0; fi
  if [ "$v_maj" -lt "$MIN_MAJOR" ]; then return 1; fi
  if [ "$v_min" -gt "$MIN_MINOR" ]; then return 0; fi
  if [ "$v_min" -lt "$MIN_MINOR" ]; then return 1; fi
  if [ "$v_pat" -gt "$MIN_PATCH" ]; then return 0; fi
  if [ "$v_pat" -lt "$MIN_PATCH" ]; then return 1; fi
  [ -z "$v_pre" ]
}

bun_version_of() {
  "$1" --version 2>/dev/null | head -n 1 | tr -d '\r\n'
}

FOUND_BUN_DIR=""
FOUND_BUN_VERSION=""
OLDEST_FOUND_VERSION=""
TEMP_INSTALLER=""

cleanup_temp() {
  if [ -n "$TEMP_INSTALLER" ]; then
    rm -f "$TEMP_INSTALLER"
    TEMP_INSTALLER=""
  fi
}

try_bun_at() {
  cand_bin="$1"
  cand_dir="$2"
  [ -f "$cand_bin" ] && [ -x "$cand_bin" ] || return 1
  cand_ver="$(bun_version_of "$cand_bin")"
  [ -n "$cand_ver" ] || return 1
  if version_ok "$cand_ver"; then
    FOUND_BUN_DIR="$cand_dir"
    FOUND_BUN_VERSION="$cand_ver"
    return 0
  fi
  if [ -z "$OLDEST_FOUND_VERSION" ]; then
    OLDEST_FOUND_VERSION="$cand_ver"
  fi
  return 1
}

try_standard_dirs() {
  if [ -n "${BUN_INSTALL:-}" ]; then
    try_bun_at "$BUN_INSTALL/bin/bun" "$BUN_INSTALL/bin" && return 0
    try_bun_at "$BUN_INSTALL/bin/bun.exe" "$BUN_INSTALL/bin" && return 0
  fi
  if [ -n "${HOME:-}" ]; then
    try_bun_at "$HOME/.bun/bin/bun" "$HOME/.bun/bin" && return 0
    try_bun_at "$HOME/.bun/bin/bun.exe" "$HOME/.bun/bin" && return 0
  fi
  if is_windows_shell && [ -n "${USERPROFILE:-}" ]; then
    win_home="$USERPROFILE"
    if command -v cygpath >/dev/null 2>&1; then
      win_home="$(cygpath -u "$USERPROFILE" 2>/dev/null || printf '%s' "$USERPROFILE")"
    fi
    try_bun_at "$win_home/.bun/bin/bun.exe" "$win_home/.bun/bin" && return 0
    try_bun_at "$win_home/.bun/bin/bun" "$win_home/.bun/bin" && return 0
  fi
  return 1
}

try_path_bun() {
  path_bun="$(command -v bun 2>/dev/null || true)"
  [ -n "$path_bun" ] || return 1
  try_bun_at "$path_bun" ""
}

prepend_bun_dir() {
  if [ -n "$FOUND_BUN_DIR" ]; then
    PATH="$FOUND_BUN_DIR:$PATH"
    export PATH
    hash -r 2>/dev/null || true
  fi
}

can_elevate() {
  if [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ]; then
    PRIV_CMD=""
    return 0
  fi
  if command -v sudo >/dev/null 2>&1; then
    if sudo -n true 2>/dev/null || [ -t 0 ]; then
      PRIV_CMD="sudo"
      return 0
    fi
  fi
  return 1
}

run_priv() {
  if [ -n "$PRIV_CMD" ]; then
    "$PRIV_CMD" "$@"
  else
    "$@"
  fi
}

install_unix_prereqs() {
  missing_list=""
  for tool in curl unzip bash; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      missing_list="${missing_list:+$missing_list }$tool"
    fi
  done
  [ -n "$missing_list" ] || return 0

  PRIV_CMD=""
  pkg_installed=0
  case "$missing_list" in
    *curl*) extra_ca="ca-certificates" ;;
    *) extra_ca="" ;;
  esac

  if command -v apt-get >/dev/null 2>&1 && can_elevate; then
    echo "Installing missing tools needed for Bun: ${missing_list}..."
    # shellcheck disable=SC2086
    if run_priv env DEBIAN_FRONTEND=noninteractive apt-get update -qq &&
      run_priv env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $missing_list $extra_ca; then
      pkg_installed=1
    fi
  elif command -v dnf >/dev/null 2>&1 && can_elevate; then
    echo "Installing missing tools needed for Bun: ${missing_list}..."
    # shellcheck disable=SC2086
    if run_priv dnf install -y $missing_list; then
      pkg_installed=1
    fi
  elif command -v yum >/dev/null 2>&1 && can_elevate; then
    echo "Installing missing tools needed for Bun: ${missing_list}..."
    # shellcheck disable=SC2086
    if run_priv yum install -y $missing_list; then
      pkg_installed=1
    fi
  elif command -v apk >/dev/null 2>&1 && can_elevate; then
    echo "Installing missing tools needed for Bun: ${missing_list}..."
    # shellcheck disable=SC2086
    if run_priv apk add --no-cache $missing_list $extra_ca; then
      pkg_installed=1
    fi
  elif command -v pacman >/dev/null 2>&1 && can_elevate; then
    echo "Installing missing tools needed for Bun: ${missing_list}..."
    # shellcheck disable=SC2086
    if run_priv pacman -Sy --noconfirm $missing_list; then
      pkg_installed=1
    fi
  elif command -v zypper >/dev/null 2>&1 && can_elevate; then
    echo "Installing missing tools needed for Bun: ${missing_list}..."
    # shellcheck disable=SC2086
    if run_priv zypper --non-interactive install $missing_list; then
      pkg_installed=1
    fi
  elif command -v brew >/dev/null 2>&1; then
    echo "Installing missing tools needed for Bun: ${missing_list}..."
    # shellcheck disable=SC2086
    if HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 brew install $missing_list; then
      pkg_installed=1
    fi
  else
    echo "Manent needs ${missing_list} to install Bun ${MIN_BUN} or later. Install $(pronoun_for "$missing_list"), then run make demo again." >&2
    exit 1
  fi

  hash -r 2>/dev/null || true
  still_missing=""
  for tool in curl unzip bash; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      still_missing="${still_missing:+$still_missing }$tool"
    fi
  done
  if [ "$pkg_installed" -ne 1 ] || [ -n "$still_missing" ]; then
    target_missing="${still_missing:-$missing_list}"
    echo "Could not install ${target_missing}, which Bun needs. Install $(pronoun_for "$target_missing"), then run make demo again." >&2
    exit 1
  fi
}

announce_install() {
  if [ -n "$OLDEST_FOUND_VERSION" ]; then
    echo "Bun ${OLDEST_FOUND_VERSION} is older than ${MIN_BUN}. Installing a newer Bun..."
  else
    echo "Bun ${MIN_BUN} or later was not found. Installing Bun..."
  fi
}

install_bun() {
  if is_windows_shell; then
    ps_bin=""
    for candidate in pwsh powershell powershell.exe; do
      if command -v "$candidate" >/dev/null 2>&1; then
        ps_bin="$candidate"
        break
      fi
    done
    if [ -z "$ps_bin" ]; then
      echo "Manent needs PowerShell to install Bun ${MIN_BUN} or later. Install Bun from https://bun.com, then run make demo again." >&2
      exit 1
    fi
    announce_install
    if ! "$ps_bin" -NoProfile -ExecutionPolicy Bypass -Command "irm https://bun.com/install.ps1 | iex"; then
      echo "Bun ${MIN_BUN} or later could not be installed. Install it with: $(install_hint)" >&2
      exit 1
    fi
  else
    install_unix_prereqs
    announce_install
    tmp_base="${TMPDIR:-/tmp}"
    tmp_base="${tmp_base%/}"
    [ -n "$tmp_base" ] || tmp_base="/tmp"
    TEMP_INSTALLER="$(mktemp "${tmp_base}/manent-bun-install.XXXXXX")" || {
      echo "Could not create a temporary file to install Bun." >&2
      exit 1
    }
    trap cleanup_temp EXIT INT TERM
    if ! curl -fsSL https://bun.com/install -o "$TEMP_INSTALLER"; then
      cleanup_temp
      echo "Could not download the Bun installer. Check your connection and run make demo again." >&2
      exit 1
    fi
    bash "$TEMP_INSTALLER"
    install_status=$?
    cleanup_temp
    trap - EXIT INT TERM
    if [ "$install_status" -ne 0 ]; then
      echo "Bun ${MIN_BUN} or later could not be installed. Install it with: $(install_hint)" >&2
      exit 1
    fi
  fi

  hash -r 2>/dev/null || true
  FOUND_BUN_DIR=""
  FOUND_BUN_VERSION=""
  if ! try_standard_dirs && ! try_path_bun; then
    echo "Bun ${MIN_BUN} or later could not be verified after installation. Install it with: $(install_hint)" >&2
    exit 1
  fi
  prepend_bun_dir
  echo "Installed Bun ${FOUND_BUN_VERSION}."
}

ALLOW_INSTALL=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --install)
      ALLOW_INSTALL=1
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if try_path_bun || try_standard_dirs; then
  prepend_bun_dir
elif [ "$ALLOW_INSTALL" -eq 1 ]; then
  install_bun
else
  if [ -n "$OLDEST_FOUND_VERSION" ]; then
    echo "Manent needs Bun ${MIN_BUN} or later (found ${OLDEST_FOUND_VERSION}). Run make demo to update it, or install it with: $(install_hint)" >&2
  else
    echo "Manent needs Bun ${MIN_BUN} or later. Run make demo to install it, or install it with: $(install_hint)" >&2
  fi
  exit 1
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi
