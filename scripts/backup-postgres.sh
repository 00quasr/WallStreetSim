#!/bin/bash
# ===========================================
# PostgreSQL Daily Backup Script
# WallStreetSim
# ===========================================
#
# Usage: ./backup-postgres.sh [options]
#
# Options:
#   -d, --backup-dir DIR    Backup directory (default: /WallStreetSim/backups)
#   -r, --retention DAYS    Retention period in days (default: 7)
#   -c, --container NAME    Docker container name (default: wss_postgres)
#   -h, --help              Show this help message
#
# Environment variables (loaded from .env if present):
#   POSTGRES_USER           Database user (default: wss_user)
#   POSTGRES_DB             Database name (default: wallstreetsim)
#   POSTGRES_PASSWORD       Database password (required)
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
RETENTION_DAYS="${RETENTION_DAYS:-7}"
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
    head -n 20 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -d|--backup-dir)
                BACKUP_DIR="$2"
                shift 2
                ;;
            -r|--retention)
                RETENTION_DAYS="$2"
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

# Clean up old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."

    local count=0
    while IFS= read -r file; do
        if [[ -n "$file" ]]; then
            log_info "Removing old backup: $file"
            rm -f "$file"
            ((count++))
        fi
    done < <(find "$BACKUP_DIR" -name "wallstreetsim_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" 2>/dev/null)

    if [[ $count -gt 0 ]]; then
        log_info "Removed $count old backup(s)"
    else
        log_info "No old backups to remove"
    fi
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

# Main function
main() {
    parse_args "$@"

    log_info "=== PostgreSQL Backup Script ==="
    log_info "Backup directory: $BACKUP_DIR"
    log_info "Retention period: $RETENTION_DAYS days"
    log_info "Container: $CONTAINER_NAME"
    log_info "Database: $POSTGRES_DB"

    check_dependencies
    check_container
    create_backup_dir
    perform_backup
    cleanup_old_backups
    list_backups

    log_success "=== Backup process completed ==="
}

main "$@"
