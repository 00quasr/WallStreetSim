#!/bin/bash
# ===========================================
# PostgreSQL Daily Backup Script with Rotation
# WallStreetSim
# ===========================================
#
# Usage: ./backup-postgres.sh [options]
#
# Options:
#   -d, --backup-dir DIR      Backup directory (default: /WallStreetSim/backups)
#   -c, --container NAME      Docker container name (default: wss_postgres)
#   --daily-retention NUM     Number of daily backups to keep (default: 7)
#   --weekly-retention NUM    Number of weekly backups to keep (default: 4)
#   -h, --help                Show this help message
#
# Environment variables (loaded from .env if present):
#   POSTGRES_USER           Database user (default: wss_user)
#   POSTGRES_DB             Database name (default: wallstreetsim)
#   POSTGRES_PASSWORD       Database password (required)
#
# Backup rotation strategy:
#   - Daily backups: Kept for --daily-retention days (default: 7)
#   - Weekly backups: Sunday backups promoted to weekly, kept for --weekly-retention weeks (default: 4)
#
# Exit codes:
#   0 - Success
#   1 - Missing dependencies
#   2 - Container not running
#   3 - Backup failed
#   4 - Compression failed

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default configuration
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
DAILY_RETENTION="${DAILY_RETENTION:-7}"
WEEKLY_RETENTION="${WEEKLY_RETENTION:-4}"
CONTAINER_NAME="${CONTAINER_NAME:-wss_postgres}"

# Load environment variables from .env if present
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

# Database configuration (with defaults)
POSTGRES_USER="${POSTGRES_USER:-wss_user}"
POSTGRES_DB="${POSTGRES_DB:-wallstreetsim}"

# Timestamp for backup file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
BACKUP_FILE="wallstreetsim_${TIMESTAMP}.sql.gz"

# Logging functions
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $*"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" >&2
}

log_success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] $*"
}

# Help message
show_help() {
    head -n 24 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -d|--backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            --daily-retention)
                DAILY_RETENTION="$2"
                shift 2
                ;;
            --weekly-retention)
                WEEKLY_RETENTION="$2"
                shift 2
                ;;
            -c|--container)
                CONTAINER_NAME="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Check dependencies
check_dependencies() {
    local missing=()

    if ! command -v docker &> /dev/null; then
        missing+=("docker")
    fi

    if ! command -v gzip &> /dev/null; then
        missing+=("gzip")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing[*]}"
        exit 1
    fi
}

# Check if container is running
check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_error "PostgreSQL container '$CONTAINER_NAME' is not running"
        exit 2
    fi
    log_info "PostgreSQL container '$CONTAINER_NAME' is running"
}

# Create backup directory
create_backup_dir() {
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_info "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi
}

# Perform backup
perform_backup() {
    local backup_path="$BACKUP_DIR/$BACKUP_FILE"
    local temp_file="$BACKUP_DIR/.backup_temp_${TIMESTAMP}.sql"

    log_info "Starting backup of database '$POSTGRES_DB'..."
    log_info "Backup file: $backup_path"

    # Perform pg_dump inside container and pipe to local file
    if ! docker exec "$CONTAINER_NAME" pg_dump \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        --format=plain \
        --no-owner \
        --no-acl \
        > "$temp_file" 2>/dev/null; then
        log_error "pg_dump failed"
        rm -f "$temp_file"
        exit 3
    fi

    # Check if backup is not empty
    if [[ ! -s "$temp_file" ]]; then
        log_error "Backup file is empty"
        rm -f "$temp_file"
        exit 3
    fi

    # Compress the backup
    log_info "Compressing backup..."
    if ! gzip -c "$temp_file" > "$backup_path"; then
        log_error "Compression failed"
        rm -f "$temp_file"
        exit 4
    fi

    rm -f "$temp_file"

    # Report size
    local size
    size=$(du -h "$backup_path" | cut -f1)
    log_success "Backup completed: $backup_path ($size)"
}

# Promote today's backup to weekly if it's Sunday
promote_to_weekly() {
    local backup_path="$BACKUP_DIR/$BACKUP_FILE"
    local weekly_dir="$BACKUP_DIR/weekly"

    # Only promote on Sundays (day 7)
    if [[ "$DAY_OF_WEEK" != "7" ]]; then
        log_info "Not Sunday, skipping weekly promotion"
        return
    fi

    log_info "Sunday detected, promoting backup to weekly..."

    if [[ ! -d "$weekly_dir" ]]; then
        mkdir -p "$weekly_dir"
    fi

    # Create a hard link (saves space, same file)
    local weekly_file="$weekly_dir/wallstreetsim_weekly_${TIMESTAMP}.sql.gz"
    if ln "$backup_path" "$weekly_file" 2>/dev/null; then
        log_success "Promoted to weekly: $weekly_file"
    else
        # Fallback to copy if hard link fails (e.g., different filesystems)
        if cp "$backup_path" "$weekly_file"; then
            log_success "Copied to weekly: $weekly_file"
        else
            log_error "Failed to promote backup to weekly"
        fi
    fi
}

# Clean up old daily backups (keep N most recent)
cleanup_daily_backups() {
    log_info "Rotating daily backups (keeping $DAILY_RETENTION most recent)..."

    local count=0
    local daily_backups

    # Get all daily backups sorted by modification time (newest first), skip the weekly directory
    daily_backups=$(find "$BACKUP_DIR" -maxdepth 1 -name "wallstreetsim_*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)

    # Count total daily backups
    local total
    total=$(echo "$daily_backups" | grep -c . || echo 0)

    if [[ $total -le $DAILY_RETENTION ]]; then
        log_info "Only $total daily backup(s), no cleanup needed"
        return
    fi

    # Remove backups beyond retention count
    local to_remove=$((total - DAILY_RETENTION))
    log_info "Removing $to_remove old daily backup(s)..."

    echo "$daily_backups" | tail -n "$to_remove" | while IFS= read -r file; do
        if [[ -n "$file" && -f "$file" ]]; then
            log_info "Removing old daily backup: $(basename "$file")"
            rm -f "$file"
            ((count++)) || true
        fi
    done

    log_info "Daily backup rotation complete"
}

# Clean up old weekly backups (keep N most recent)
cleanup_weekly_backups() {
    local weekly_dir="$BACKUP_DIR/weekly"

    if [[ ! -d "$weekly_dir" ]]; then
        log_info "No weekly backup directory, skipping weekly cleanup"
        return
    fi

    log_info "Rotating weekly backups (keeping $WEEKLY_RETENTION most recent)..."

    local weekly_backups
    weekly_backups=$(find "$weekly_dir" -name "wallstreetsim_weekly_*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)

    # Count total weekly backups
    local total
    total=$(echo "$weekly_backups" | grep -c . || echo 0)

    if [[ $total -le $WEEKLY_RETENTION ]]; then
        log_info "Only $total weekly backup(s), no cleanup needed"
        return
    fi

    # Remove backups beyond retention count
    local to_remove=$((total - WEEKLY_RETENTION))
    log_info "Removing $to_remove old weekly backup(s)..."

    echo "$weekly_backups" | tail -n "$to_remove" | while IFS= read -r file; do
        if [[ -n "$file" && -f "$file" ]]; then
            log_info "Removing old weekly backup: $(basename "$file")"
            rm -f "$file"
        fi
    done

    log_info "Weekly backup rotation complete"
}

# Perform all backup cleanup/rotation
cleanup_old_backups() {
    cleanup_daily_backups
    cleanup_weekly_backups
}

# List existing backups
list_backups() {
    log_info "Current backups in $BACKUP_DIR:"
    if ls "$BACKUP_DIR"/wallstreetsim_*.sql.gz 1>/dev/null 2>&1; then
        ls -lh "$BACKUP_DIR"/wallstreetsim_*.sql.gz | awk '{print "  " $9 " (" $5 ")"}'
    else
        echo "  (no backups found)"
    fi
}

# List existing backups
list_weekly_backups() {
    local weekly_dir="$BACKUP_DIR/weekly"
    log_info "Weekly backups in $weekly_dir:"
    if [[ -d "$weekly_dir" ]] && ls "$weekly_dir"/wallstreetsim_weekly_*.sql.gz 1>/dev/null 2>&1; then
        ls -lh "$weekly_dir"/wallstreetsim_weekly_*.sql.gz | awk '{print "  " $9 " (" $5 ")"}'
    else
        echo "  (no weekly backups found)"
    fi
}

# Main function
main() {
    parse_args "$@"

    log_info "=== PostgreSQL Backup Script ==="
    log_info "Backup directory: $BACKUP_DIR"
    log_info "Daily retention: $DAILY_RETENTION backups"
    log_info "Weekly retention: $WEEKLY_RETENTION backups"
    log_info "Container: $CONTAINER_NAME"
    log_info "Database: $POSTGRES_DB"
    log_info "Day of week: $DAY_OF_WEEK (7=Sunday)"

    check_dependencies
    check_container
    create_backup_dir
    perform_backup
    promote_to_weekly
    cleanup_old_backups
    list_backups
    list_weekly_backups

    log_success "=== Backup process completed ==="
}

main "$@"
