#!/bin/bash
# ===========================================
# Setup PostgreSQL Backup Cron Job
# WallStreetSim
# ===========================================
#
# This script installs the daily PostgreSQL backup cron job.
#
# Usage: sudo ./setup-backup-cron.sh [options]
#
# Options:
#   --uninstall    Remove the backup cron job
#   --status       Show current cron job status
#   -h, --help     Show this help message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="/var/log/wallstreetsim"
BACKUP_DIR="$PROJECT_ROOT/backups"
CRON_MARKER="# WallStreetSim PostgreSQL Backup"

log_info() {
    echo "[INFO] $*"
}

log_error() {
    echo "[ERROR] $*" >&2
}

log_success() {
    echo "[SUCCESS] $*"
}

show_help() {
    head -n 15 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

create_directories() {
    log_info "Creating directories..."

    # Create log directory
    if [[ ! -d "$LOG_DIR" ]]; then
        mkdir -p "$LOG_DIR"
        chown "$(logname)":"$(logname)" "$LOG_DIR" 2>/dev/null || true
        log_info "Created log directory: $LOG_DIR"
    fi

    # Create backup directory
    if [[ ! -d "$BACKUP_DIR" ]]; then
        mkdir -p "$BACKUP_DIR"
        chown "$(logname)":"$(logname)" "$BACKUP_DIR" 2>/dev/null || true
        log_info "Created backup directory: $BACKUP_DIR"
    fi

    # Create log file with proper permissions
    local log_file="$LOG_DIR/backup-postgres.log"
    if [[ ! -f "$log_file" ]]; then
        touch "$log_file"
        chown "$(logname)":"$(logname)" "$log_file" 2>/dev/null || true
    fi
}

setup_log_rotation() {
    log_info "Setting up log rotation..."

    local logrotate_config="/etc/logrotate.d/wallstreetsim-backup"
    cat > "$logrotate_config" << 'EOF'
/var/log/wallstreetsim/backup-postgres.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
EOF
    log_info "Created logrotate config: $logrotate_config"
}

install_cron() {
    log_info "Installing cron job..."

    # Get the current user's crontab (or empty if none)
    local current_cron
    current_cron=$(crontab -l 2>/dev/null || true)

    # Check if already installed
    if echo "$current_cron" | grep -q "backup-postgres.sh"; then
        log_info "Cron job already installed, updating..."
        # Remove existing entry
        current_cron=$(echo "$current_cron" | grep -v "backup-postgres.sh" | grep -v "$CRON_MARKER")
    fi

    # Add new cron entry
    local new_cron="$current_cron
$CRON_MARKER
0 2 * * * $SCRIPT_DIR/backup-postgres.sh >> $LOG_DIR/backup-postgres.log 2>&1"

    # Install crontab
    echo "$new_cron" | crontab -

    log_success "Cron job installed successfully"
    log_info "Backup will run daily at 2:00 AM"
}

uninstall_cron() {
    log_info "Removing cron job..."

    local current_cron
    current_cron=$(crontab -l 2>/dev/null || true)

    if echo "$current_cron" | grep -q "backup-postgres.sh"; then
        # Remove backup-related entries
        local new_cron
        new_cron=$(echo "$current_cron" | grep -v "backup-postgres.sh" | grep -v "$CRON_MARKER")
        echo "$new_cron" | crontab -
        log_success "Cron job removed"
    else
        log_info "No cron job found"
    fi
}

show_status() {
    echo "=== PostgreSQL Backup Cron Status ==="
    echo

    # Check directories
    echo "Directories:"
    echo "  Log directory: $LOG_DIR $(test -d "$LOG_DIR" && echo '[exists]' || echo '[missing]')"
    echo "  Backup directory: $BACKUP_DIR $(test -d "$BACKUP_DIR" && echo '[exists]' || echo '[missing]')"
    echo

    # Check cron job
    echo "Cron job:"
    if crontab -l 2>/dev/null | grep -q "backup-postgres.sh"; then
        crontab -l 2>/dev/null | grep "backup-postgres.sh" | sed 's/^/  /'
    else
        echo "  (not installed)"
    fi
    echo

    # Check backups
    echo "Existing backups:"
    if ls "$BACKUP_DIR"/wallstreetsim_*.sql.gz 1>/dev/null 2>&1; then
        ls -lh "$BACKUP_DIR"/wallstreetsim_*.sql.gz | awk '{print "  " $9 " (" $5 ")"}'
    else
        echo "  (no backups found)"
    fi
    echo

    # Check logs
    echo "Recent log entries:"
    if [[ -f "$LOG_DIR/backup-postgres.log" ]]; then
        tail -5 "$LOG_DIR/backup-postgres.log" | sed 's/^/  /'
    else
        echo "  (no log file)"
    fi
}

main() {
    case "${1:-}" in
        --uninstall)
            check_root
            uninstall_cron
            ;;
        --status)
            show_status
            ;;
        -h|--help)
            show_help
            ;;
        "")
            check_root
            create_directories
            setup_log_rotation
            install_cron
            echo
            show_status
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
}

main "$@"
