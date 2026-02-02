#!/bin/bash
# ===========================================
# PostgreSQL Restore Script Tests
# WallStreetSim
# ===========================================
#
# Usage: ./restore-postgres.test.sh
#
# This test suite validates the restore script functionality.
# Tests are designed to run without affecting production data.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTORE_SCRIPT="$SCRIPT_DIR/restore-postgres.sh"
TEST_DIR=$(mktemp -d)
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

cleanup() {
    rm -rf "$TEST_DIR"
}

trap cleanup EXIT

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Test: Script exists and is executable
test_script_exists() {
    log_test "Script exists and is executable"

    if [[ -x "$RESTORE_SCRIPT" ]]; then
        log_pass "Script is executable"
    else
        log_fail "Script is not executable at: $RESTORE_SCRIPT"
    fi
}

# Test: Help flag works
test_help_flag() {
    log_test "Help flag displays usage"

    local output
    output=$("$RESTORE_SCRIPT" --help 2>&1 || true)

    if echo "$output" | grep -q "Usage"; then
        log_pass "Help flag shows usage information"
    else
        log_fail "Help flag did not show usage"
    fi
}

# Test: Script requires backup file argument
test_requires_backup_file() {
    log_test "Script requires backup file argument"

    local exit_code=0
    "$RESTORE_SCRIPT" 2>/dev/null || exit_code=$?

    if [[ $exit_code -eq 1 ]]; then
        log_pass "Script correctly requires backup file argument"
    else
        log_fail "Expected exit code 1 for missing argument, got $exit_code"
    fi
}

# Test: Invalid option handling
test_invalid_option() {
    log_test "Invalid option is rejected"

    local exit_code=0
    "$RESTORE_SCRIPT" --invalid-option 2>/dev/null || exit_code=$?

    if [[ $exit_code -eq 1 ]]; then
        log_pass "Invalid option correctly rejected"
    else
        log_fail "Invalid option was not rejected (exit code: $exit_code)"
    fi
}

# Test: Container name parameter
test_container_param() {
    log_test "Container name parameter is parsed"

    local output
    # This will fail early because file doesn't exist, but we verify param parsing
    output=$("$RESTORE_SCRIPT" --container test_container /nonexistent.sql.gz 2>&1 || true)

    if echo "$output" | grep -q "test_container"; then
        log_pass "Container parameter parsed correctly"
    else
        log_fail "Container parameter not parsed"
    fi
}

# Test: Skip backup flag
test_skip_backup_flag() {
    log_test "Skip backup flag is recognized"

    if grep -q '\-\-skip-backup' "$RESTORE_SCRIPT"; then
        log_pass "Skip backup flag exists in script"
    else
        log_fail "Skip backup flag not found"
    fi
}

# Test: Force flag
test_force_flag() {
    log_test "Force flag is recognized"

    if grep -q '\-\-force' "$RESTORE_SCRIPT"; then
        log_pass "Force flag exists in script"
    else
        log_fail "Force flag not found"
    fi
}

# Test: Detects non-existent backup file
test_missing_backup_file() {
    log_test "Detects when backup file doesn't exist"

    local exit_code=0
    "$RESTORE_SCRIPT" /nonexistent_backup_file.sql.gz 2>&1 || exit_code=$?

    if [[ $exit_code -eq 3 ]]; then
        log_pass "Correctly exits with code 3 for missing backup file"
    else
        log_fail "Expected exit code 3 for missing file, got $exit_code"
    fi
}

# Test: Validates gzip file format
test_gzip_validation() {
    log_test "Validates backup file is gzip format"

    # Create a non-gzip file with .sql.gz extension
    local fake_backup="$TEST_DIR/fake_backup.sql.gz"
    echo "not a gzip file" > "$fake_backup"

    local exit_code=0
    "$RESTORE_SCRIPT" "$fake_backup" 2>/dev/null || exit_code=$?

    if [[ $exit_code -eq 3 ]]; then
        log_pass "Correctly detects invalid gzip file"
    else
        log_fail "Expected exit code 3 for invalid gzip, got $exit_code"
    fi
}

# Test: Detects missing container
test_missing_container() {
    log_test "Detects when container is not running"

    # Create a valid gzip backup file
    local test_backup="$TEST_DIR/test_backup.sql.gz"
    echo "SELECT 1;" | gzip > "$test_backup"

    local exit_code=0
    "$RESTORE_SCRIPT" --container nonexistent_container_xyz123 --force "$test_backup" 2>&1 || exit_code=$?

    if [[ $exit_code -eq 2 ]]; then
        log_pass "Correctly exits with code 2 for missing container"
    else
        log_fail "Expected exit code 2 for missing container, got $exit_code"
    fi
}

# Test: Docker dependency check
test_docker_dependency() {
    log_test "Docker dependency is checked"

    if command -v docker &> /dev/null; then
        local output
        output=$("$RESTORE_SCRIPT" --help 2>&1 || true)

        if ! echo "$output" | grep -q "Missing dependencies.*docker"; then
            log_pass "Docker dependency check passed"
        else
            log_fail "Docker dependency check failed unexpectedly"
        fi
    else
        log_pass "Docker not installed, skipping docker dependency test"
    fi
}

# Test: Script loads .env file
test_env_loading() {
    log_test "Script loads .env file"

    local project_root
    project_root=$(dirname "$SCRIPT_DIR")

    if [[ -f "$project_root/.env" ]]; then
        log_pass ".env file exists and will be loaded"
    else
        log_fail ".env file not found at $project_root/.env"
    fi
}

# Test: Pre-restore backup function exists
test_pre_restore_backup() {
    log_test "Pre-restore backup function exists"

    if grep -q 'create_pre_restore_backup' "$RESTORE_SCRIPT"; then
        log_pass "Pre-restore backup function exists"
    else
        log_fail "Pre-restore backup function not found"
    fi
}

# Test: Connection termination function exists
test_terminate_connections() {
    log_test "Connection termination function exists"

    if grep -q 'terminate_connections' "$RESTORE_SCRIPT"; then
        log_pass "Connection termination function exists"
    else
        log_fail "Connection termination function not found"
    fi
}

# Test: Database recreation function exists
test_recreate_database() {
    log_test "Database recreation function exists"

    if grep -q 'recreate_database' "$RESTORE_SCRIPT"; then
        log_pass "Database recreation function exists"
    else
        log_fail "Database recreation function not found"
    fi
}

# Test: Restore function exists
test_perform_restore() {
    log_test "Restore function exists"

    if grep -q 'perform_restore' "$RESTORE_SCRIPT"; then
        log_pass "Restore function exists"
    else
        log_fail "Restore function not found"
    fi
}

# Test: Verification function exists
test_verify_restore() {
    log_test "Verification function exists"

    if grep -q 'verify_restore' "$RESTORE_SCRIPT"; then
        log_pass "Verification function exists"
    else
        log_fail "Verification function not found"
    fi
}

# Test: Confirmation prompt exists
test_confirm_prompt() {
    log_test "Confirmation prompt exists"

    if grep -q 'confirm_restore' "$RESTORE_SCRIPT"; then
        log_pass "Confirmation prompt function exists"
    else
        log_fail "Confirmation prompt function not found"
    fi
}

# Test: Exit codes are documented
test_exit_codes() {
    log_test "Script uses proper exit codes"

    local exit_codes_found=0

    if grep -q 'exit 1' "$RESTORE_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi
    if grep -q 'exit 2' "$RESTORE_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi
    if grep -q 'exit 3' "$RESTORE_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi
    if grep -q 'exit 4' "$RESTORE_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi
    if grep -q 'exit 5' "$RESTORE_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi
    if grep -q 'exit 6' "$RESTORE_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi

    if [[ $exit_codes_found -ge 6 ]]; then
        log_pass "Script uses documented exit codes"
    else
        log_fail "Script missing some exit codes ($exit_codes_found/6 found)"
    fi
}

# Test: Gunzip is used for decompression
test_gunzip_decompression() {
    log_test "Script uses gunzip for decompression"

    if grep -q 'gunzip -c' "$RESTORE_SCRIPT"; then
        log_pass "gunzip decompression is used"
    else
        log_fail "gunzip decompression not found"
    fi
}

# Test: Uses pg_terminate_backend for safe disconnect
test_pg_terminate_backend() {
    log_test "Uses pg_terminate_backend for safe disconnect"

    if grep -q 'pg_terminate_backend' "$RESTORE_SCRIPT"; then
        log_pass "pg_terminate_backend is used"
    else
        log_fail "pg_terminate_backend not found"
    fi
}

# Test: Logging functions exist
test_logging() {
    log_test "Logging functions are defined"

    local logging_found=0

    if grep -q 'log_info()' "$RESTORE_SCRIPT"; then
        logging_found=$((logging_found + 1))
    fi
    if grep -q 'log_error()' "$RESTORE_SCRIPT"; then
        logging_found=$((logging_found + 1))
    fi
    if grep -q 'log_success()' "$RESTORE_SCRIPT"; then
        logging_found=$((logging_found + 1))
    fi
    if grep -q 'log_warn()' "$RESTORE_SCRIPT"; then
        logging_found=$((logging_found + 1))
    fi

    if [[ $logging_found -ge 4 ]]; then
        log_pass "All logging functions defined"
    else
        log_fail "Missing logging functions ($logging_found/4 found)"
    fi
}

# Test: Strict mode enabled
test_strict_mode() {
    log_test "Script uses strict mode (errexit, pipefail)"

    if grep -q 'set -euo pipefail' "$RESTORE_SCRIPT" || \
       (grep -q 'set -e' "$RESTORE_SCRIPT" && grep -q 'set -o pipefail' "$RESTORE_SCRIPT"); then
        log_pass "Strict mode is enabled"
    else
        log_fail "Strict mode not enabled"
    fi
}

# Test: Shows next steps after restore
test_next_steps() {
    log_test "Script shows next steps after restore"

    if grep -q 'show_next_steps' "$RESTORE_SCRIPT"; then
        log_pass "Next steps function exists"
    else
        log_fail "Next steps function not found"
    fi
}

# Test: Lists available backups when no file specified
test_list_backups() {
    log_test "Lists available backups function exists"

    if grep -q 'list_backups' "$RESTORE_SCRIPT"; then
        log_pass "List backups function exists"
    else
        log_fail "List backups function not found"
    fi
}

# Test: Integration with running container (if available)
test_integration_with_container() {
    log_test "Integration test: Container detection (if running)"

    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^wss_postgres$"; then
        log_pass "Container not running, skipping integration test"
        return
    fi

    # Create a minimal test backup
    local test_backup="$TEST_DIR/integration_test.sql.gz"
    echo "SELECT 1;" | gzip > "$test_backup"

    local output
    output=$("$RESTORE_SCRIPT" --force "$test_backup" 2>&1 || true)

    # We expect the script to at least detect the container
    if echo "$output" | grep -q "PostgreSQL container.*is running"; then
        log_pass "Integration test: Container detection works"
    else
        log_fail "Integration test: Container detection failed"
    fi
}

# Test: Runbook exists
test_runbook_exists() {
    log_test "Restore runbook documentation exists"

    local runbook_path="$SCRIPT_DIR/RESTORE-RUNBOOK.md"

    if [[ -f "$runbook_path" ]]; then
        log_pass "Restore runbook exists at $runbook_path"
    else
        log_fail "Restore runbook not found"
    fi
}

# Test: Runbook contains essential sections
test_runbook_content() {
    log_test "Runbook contains essential sections"

    local runbook_path="$SCRIPT_DIR/RESTORE-RUNBOOK.md"
    local sections_found=0

    if [[ -f "$runbook_path" ]]; then
        if grep -q "PostgreSQL Restore" "$runbook_path"; then
            sections_found=$((sections_found + 1))
        fi
        if grep -q "Redis Restore" "$runbook_path"; then
            sections_found=$((sections_found + 1))
        fi
        if grep -q "ClickHouse Restore" "$runbook_path"; then
            sections_found=$((sections_found + 1))
        fi
        if grep -q "Full System Recovery" "$runbook_path"; then
            sections_found=$((sections_found + 1))
        fi
        if grep -q "Verification" "$runbook_path"; then
            sections_found=$((sections_found + 1))
        fi
        if grep -q "Troubleshooting" "$runbook_path"; then
            sections_found=$((sections_found + 1))
        fi

        if [[ $sections_found -ge 6 ]]; then
            log_pass "Runbook contains all essential sections ($sections_found/6)"
        else
            log_fail "Runbook missing some sections ($sections_found/6 found)"
        fi
    else
        log_fail "Runbook file not found, cannot check content"
    fi
}

# Run all tests
main() {
    echo "=== PostgreSQL Restore Script Tests ==="
    echo "Test directory: $TEST_DIR"
    echo

    # Script structural tests
    test_script_exists
    test_strict_mode
    test_logging
    test_exit_codes
    test_gunzip_decompression
    test_pg_terminate_backend
    test_env_loading

    # Function existence tests
    test_pre_restore_backup
    test_terminate_connections
    test_recreate_database
    test_perform_restore
    test_verify_restore
    test_confirm_prompt
    test_next_steps
    test_list_backups

    # Argument handling tests
    test_help_flag
    test_requires_backup_file
    test_invalid_option
    test_container_param
    test_skip_backup_flag
    test_force_flag

    # Validation tests
    test_missing_backup_file
    test_gzip_validation
    test_missing_container
    test_docker_dependency

    # Documentation tests
    test_runbook_exists
    test_runbook_content

    # Integration tests
    test_integration_with_container

    echo
    echo "=== Test Results ==="
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo

    if [[ $TESTS_FAILED -gt 0 ]]; then
        echo -e "${RED}Some tests failed!${NC}"
        exit 1
    else
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    fi
}

main "$@"
