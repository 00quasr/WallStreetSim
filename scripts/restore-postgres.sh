#!/bin/bash
# ===========================================
# PostgreSQL Restore Script
# WallStreetSim
# ===========================================
#
# Usage: ./restore-postgres.sh <backup_file> [options]
#
# Arguments:
#   backup_file               Path to the .sql.gz backup file to restore
#
# Options:
#   -c, --container NAME      Docker container name (default: wss_postgres)
#   --skip-backup             Skip creating a pre-restore backup
#   --force                   Skip confirmation prompt
#   -h, --help                Show this help message
#
# Environment variables (loaded from .env if present):
#   POSTGRES_USER             Database user (default: wss_user)
#   POSTGRES_DB               Database name (default: wallstreetsim)
#   POSTGRES_PASSWORD         Database password (required)
#
# Exit codes:
#   0 - Success
#   1 - Missing dependencies or arguments
#   2 - Container not running
#   3 - Backup file not found or invalid
#   4 - Pre-restore backup failed
#   5 - Restore failed
#   6 - User cancelled

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default configuration
CONTAINER_NAME="${CONTAINER_NAME:-wss_postgres}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
SKIP_BACKUP=false
FORCE=false
BACKUP_FILE=""

# Load environment variables from .env if present
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

# Database configuration (with defaults)
POSTGRES_USER="${POSTGRES_USER:-wss_user}"
POSTGRES_DB="${POSTGRES_DB:-wallstreetsim}"

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

log_warn() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $*"
}

# Help message
show_help() {
    head -n 24 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -c|--container)
                CONTAINER_NAME="$2"
                shift 2
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
            *)
                if [[ -z "$BACKUP_FILE" ]]; then
                    BACKUP_FILE="$1"
                else
                    log_error "Unexpected argument: $1"
                    show_help
                    exit 1
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$BACKUP_FILE" ]]; then
        log_error "Missing required argument: backup_file"
        echo ""
        echo "Available backups:"
        list_backups
        exit 1
    fi
}

# Check dependencies
check_dependencies() {
    local missing=()

    if ! command -v docker &> /dev/null; then
        missing+=("docker")
    fi

    if ! command -v gunzip &> /dev/null; then
        missing+=("gunzip")
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
        log_info "Start it with: docker compose -f docker-compose.db.yml up -d postgres"
        exit 2
    fi
    log_info "PostgreSQL container '$CONTAINER_NAME' is running"
}

# Validate backup file
validate_backup_file() {
    if [[ ! -f "$BACKUP_FILE" ]]; then
        log_error "Backup file not found: $BACKUP_FILE"
        exit 3
    fi

    if [[ ! "$BACKUP_FILE" =~ \.sql\.gz$ ]]; then
        log_error "Backup file must be a .sql.gz file"
        exit 3
    fi

    # Test gzip integrity
    if ! gunzip -t "$BACKUP_FILE" 2>/dev/null; then
        log_error "Backup file is corrupted or not a valid gzip file"
        exit 3
    fi

    local size
    size=$(du -h "$BACKUP_FILE" | cut -f1)
    log_info "Backup file validated: $BACKUP_FILE ($size)"
}

# List available backups
list_backups() {
    echo "Daily backups:"
    if ls "$BACKUP_DIR"/wallstreetsim_*.sql.gz 1>/dev/null 2>&1; then
        ls -lh "$BACKUP_DIR"/wallstreetsim_*.sql.gz 2>/dev/null | tail -10 | awk '{print "  " $NF " (" $5 ")"}'
    else
        echo "  (none found)"
    fi

    echo ""
    echo "Weekly backups:"
    if [[ -d "$BACKUP_DIR/weekly" ]] && ls "$BACKUP_DIR/weekly"/wallstreetsim_weekly_*.sql.gz 1>/dev/null 2>&1; then
        ls -lh "$BACKUP_DIR/weekly"/wallstreetsim_weekly_*.sql.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
    else
        echo "  (none found)"
    fi
}

# Confirm restore operation
confirm_restore() {
    if [[ "$FORCE" == "true" ]]; then
        return 0
    fi

    echo ""
    echo "============================================"
    echo "  WARNING: DATABASE RESTORE OPERATION"
    echo "============================================"
    echo ""
    echo "This will:"
    echo "  1. Terminate all active database connections"
    echo "  2. Drop the existing '$POSTGRES_DB' database"
    echo "  3. Create a new '$POSTGRES_DB' database"
    echo "  4. Restore data from: $(basename "$BACKUP_FILE")"
    echo ""
    echo "Container: $CONTAINER_NAME"
    echo "Database:  $POSTGRES_DB"
    echo "User:      $POSTGRES_USER"
    echo ""

    read -r -p "Are you sure you want to continue? [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            log_info "Restore cancelled by user"
            exit 6
            ;;
    esac
}

# Create pre-restore backup
create_pre_restore_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_warn "Skipping pre-restore backup (--skip-backup flag)"
        return 0
    fi

    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    local pre_restore_file="$BACKUP_DIR/pre_restore_${timestamp}.sql.gz"

    log_info "Creating pre-restore backup: $pre_restore_file"

    if ! docker exec "$CONTAINER_NAME" pg_dump \
        -U "$POSTGRES_USER" \
        -d "$POSTGRES_DB" \
        --format=plain \
        --no-owner \
        --no-acl 2>/dev/null | gzip > "$pre_restore_file"; then
        log_error "Failed to create pre-restore backup"
        exit 4
    fi

    local size
    size=$(du -h "$pre_restore_file" | cut -f1)
    log_success "Pre-restore backup created: $pre_restore_file ($size)"
}

# Terminate existing connections
terminate_connections() {
    log_info "Terminating existing database connections..."

    docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();
    " > /dev/null 2>&1 || true
}

# Drop and recreate database
recreate_database() {
    log_info "Dropping and recreating database '$POSTGRES_DB'..."

    docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d postgres << EOF
DROP DATABASE IF EXISTS $POSTGRES_DB;
CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;
EOF

    if [[ $? -ne 0 ]]; then
        log_error "Failed to recreate database"
        exit 5
    fi

    log_success "Database recreated"
}

# Restore the backup
perform_restore() {
    log_info "Restoring database from backup..."
    log_info "This may take several minutes for large databases..."

    # Track progress with line count
    local total_lines
    total_lines=$(gunzip -c "$BACKUP_FILE" | wc -l)
    log_info "Backup contains approximately $total_lines SQL statements"

    if ! gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --quiet 2>&1; then
        log_error "Restore failed"
        exit 5
    fi

    log_success "Database restored successfully"
}

# Verify the restore
verify_restore() {
    log_info "Verifying restore..."

    local table_count
    table_count=$(docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    " | tr -d ' ')

    log_info "Tables found: $table_count"

    # Show table row counts
    log_info "Table row counts:"
    docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
        SELECT
            schemaname || '.' || relname as table_name,
            n_live_tup as row_count
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
        LIMIT 10;
    " 2>/dev/null || true
}

# Show next steps
show_next_steps() {
    echo ""
    echo "============================================"
    echo "  RESTORE COMPLETED SUCCESSFULLY"
    echo "============================================"
    echo ""
    echo "Next steps:"
    echo "  1. Run database migrations (if needed):"
    echo "     cd $PROJECT_ROOT && pnpm db:migrate"
    echo ""
    echo "  2. Restart application services:"
    echo "     pm2 restart all"
    echo ""
    echo "  3. Verify the application:"
    echo "     curl http://localhost:8080/health"
    echo ""
    echo "  4. Check application logs:"
    echo "     pm2 logs --lines 50"
    echo ""
}

# Main function
main() {
    parse_args "$@"

    log_info "=== PostgreSQL Restore Script ==="
    log_info "Backup file: $BACKUP_FILE"
    log_info "Container: $CONTAINER_NAME"
    log_info "Database: $POSTGRES_DB"

    check_dependencies
    validate_backup_file
    check_container
    confirm_restore
    create_pre_restore_backup
    terminate_connections
    recreate_database
    perform_restore
    verify_restore
    show_next_steps

    log_success "=== Restore process completed ==="
}

main "$@"
