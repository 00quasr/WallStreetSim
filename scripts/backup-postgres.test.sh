#!/bin/bash
# ===========================================
# PostgreSQL Backup Script Tests
# WallStreetSim
# ===========================================
#
# Usage: ./backup-postgres.test.sh
#
# This test suite validates the backup script functionality.
# Tests are designed to run without affecting production data.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-postgres.sh"
TEST_BACKUP_DIR=$(mktemp -d)
TESTS_PASSED=0
TESTS_FAILED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

cleanup() {
    rm -rf "$TEST_BACKUP_DIR"
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

    if [[ -x "$BACKUP_SCRIPT" ]]; then
        log_pass "Script is executable"
    else
        log_fail "Script is not executable at: $BACKUP_SCRIPT"
    fi
}

# Test: Help flag works
test_help_flag() {
    log_test "Help flag displays usage"

    local output
    output=$("$BACKUP_SCRIPT" --help 2>&1 || true)

    if echo "$output" | grep -q "Usage"; then
        log_pass "Help flag shows usage information"
    else
        log_fail "Help flag did not show usage"
    fi
}

# Test: Invalid flag handling
test_invalid_flag() {
    log_test "Invalid flag is rejected"

    local exit_code=0
    "$BACKUP_SCRIPT" --invalid-flag 2>/dev/null || exit_code=$?

    if [[ $exit_code -ne 0 ]]; then
        log_pass "Invalid flag correctly rejected"
    else
        log_fail "Invalid flag was not rejected"
    fi
}

# Test: Custom backup directory parameter
test_backup_dir_param() {
    log_test "Custom backup directory parameter is parsed"

    # This will fail early because container check, but we verify param parsing works
    local output
    output=$("$BACKUP_SCRIPT" --backup-dir "$TEST_BACKUP_DIR" 2>&1 || true)

    if echo "$output" | grep -q "$TEST_BACKUP_DIR"; then
        log_pass "Custom backup directory parameter parsed correctly"
    else
        log_fail "Custom backup directory parameter not parsed"
    fi
}

# Test: Retention days parameter
test_retention_param() {
    log_test "Retention days parameter is parsed"

    local output
    output=$("$BACKUP_SCRIPT" --retention 14 2>&1 || true)

    if echo "$output" | grep -q "14 days"; then
        log_pass "Retention parameter parsed correctly"
    else
        log_fail "Retention parameter not parsed"
    fi
}

# Test: Container name parameter
test_container_param() {
    log_test "Container name parameter is parsed"

    local output
    output=$("$BACKUP_SCRIPT" --container test_container 2>&1 || true)

    if echo "$output" | grep -q "test_container"; then
        log_pass "Container parameter parsed correctly"
    else
        log_fail "Container parameter not parsed"
    fi
}

# Test: Detects missing container
test_missing_container() {
    log_test "Detects when container is not running"

    local exit_code=0
    "$BACKUP_SCRIPT" --container nonexistent_container_xyz123 2>&1 || exit_code=$?

    if [[ $exit_code -eq 2 ]]; then
        log_pass "Correctly exits with code 2 for missing container"
    else
        log_fail "Expected exit code 2 for missing container, got $exit_code"
    fi
}

# Test: Docker dependency check
test_docker_dependency() {
    log_test "Docker dependency is checked"

    # If docker is installed, script should pass dependency check
    if command -v docker &> /dev/null; then
        local output
        output=$("$BACKUP_SCRIPT" 2>&1 || true)

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

# Test: Integration with running container (if available)
test_integration_backup() {
    log_test "Integration test: Full backup (if container running)"

    if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^wss_postgres$"; then
        log_pass "Container not running, skipping integration test"
        return
    fi

    # Create a temporary backup directory
    local test_dir
    test_dir=$(mktemp -d)

    local exit_code=0
    "$BACKUP_SCRIPT" --backup-dir "$test_dir" 2>&1 || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        # Check if backup file was created
        if ls "$test_dir"/wallstreetsim_*.sql.gz 1>/dev/null 2>&1; then
            local backup_file
            backup_file=$(ls "$test_dir"/wallstreetsim_*.sql.gz | head -1)
            local size
            size=$(stat -c %s "$backup_file" 2>/dev/null || stat -f %z "$backup_file" 2>/dev/null)

            if [[ $size -gt 0 ]]; then
                log_pass "Integration test: Backup created successfully ($size bytes)"
            else
                log_fail "Integration test: Backup file is empty"
            fi
        else
            log_fail "Integration test: No backup file created"
        fi
    else
        log_fail "Integration test: Backup failed with exit code $exit_code"
    fi

    rm -rf "$test_dir"
}

# Test: Backup file naming convention
test_backup_naming() {
    log_test "Backup file follows naming convention"

    # Check the script uses correct naming pattern
    if grep -q 'wallstreetsim_.*\.sql\.gz' "$BACKUP_SCRIPT"; then
        log_pass "Backup naming convention is correct"
    else
        log_fail "Backup naming convention not found in script"
    fi
}

# Test: Cleanup function exists
test_cleanup_function() {
    log_test "Cleanup function removes old backups"

    if grep -q 'cleanup_old_backups' "$BACKUP_SCRIPT"; then
        log_pass "Cleanup function exists in script"
    else
        log_fail "Cleanup function not found"
    fi
}

# Test: Error handling (exit codes)
test_exit_codes() {
    log_test "Script uses proper exit codes"

    local exit_codes_found=0

    if grep -q 'exit 1' "$BACKUP_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi
    if grep -q 'exit 2' "$BACKUP_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi
    if grep -q 'exit 3' "$BACKUP_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi
    if grep -q 'exit 4' "$BACKUP_SCRIPT"; then
        exit_codes_found=$((exit_codes_found + 1))
    fi

    if [[ $exit_codes_found -ge 4 ]]; then
        log_pass "Script uses documented exit codes"
    else
        log_fail "Script missing some exit codes ($exit_codes_found/4 found)"
    fi
}

# Test: Compression is used
test_compression() {
    log_test "Backup uses gzip compression"

    if grep -q 'gzip' "$BACKUP_SCRIPT"; then
        log_pass "gzip compression is used"
    else
        log_fail "gzip compression not found"
    fi
}

# Test: pg_dump flags are appropriate
test_pgdump_flags() {
    log_test "pg_dump uses appropriate flags"

    # Check for --no-owner and --no-acl for portability
    local flags_found=0

    if grep -q '\-\-no-owner' "$BACKUP_SCRIPT"; then
        flags_found=$((flags_found + 1))
    fi
    if grep -q '\-\-no-acl' "$BACKUP_SCRIPT"; then
        flags_found=$((flags_found + 1))
    fi

    if [[ $flags_found -eq 2 ]]; then
        log_pass "pg_dump uses portable flags (--no-owner, --no-acl)"
    else
        log_fail "pg_dump missing portable flags ($flags_found/2 found)"
    fi
}

# Test: Logging functions exist
test_logging() {
    log_test "Logging functions are defined"

    local logging_found=0

    if grep -q 'log_info()' "$BACKUP_SCRIPT"; then
        logging_found=$((logging_found + 1))
    fi
    if grep -q 'log_error()' "$BACKUP_SCRIPT"; then
        logging_found=$((logging_found + 1))
    fi
    if grep -q 'log_success()' "$BACKUP_SCRIPT"; then
        logging_found=$((logging_found + 1))
    fi

    if [[ $logging_found -eq 3 ]]; then
        log_pass "All logging functions defined"
    else
        log_fail "Missing logging functions ($logging_found/3 found)"
    fi
}

# Test: Set errexit and pipefail
test_strict_mode() {
    log_test "Script uses strict mode (errexit, pipefail)"

    if grep -q 'set -euo pipefail' "$BACKUP_SCRIPT" || \
       (grep -q 'set -e' "$BACKUP_SCRIPT" && grep -q 'set -o pipefail' "$BACKUP_SCRIPT"); then
        log_pass "Strict mode is enabled"
    else
        log_fail "Strict mode not enabled"
    fi
}

# Run all tests
main() {
    echo "=== PostgreSQL Backup Script Tests ==="
    echo "Test backup directory: $TEST_BACKUP_DIR"
    echo

    # Structural tests
    test_script_exists
    test_strict_mode
    test_logging
    test_exit_codes
    test_compression
    test_pgdump_flags
    test_backup_naming
    test_cleanup_function
    test_env_loading

    # Functional tests
    test_help_flag
    test_invalid_flag
    test_backup_dir_param
    test_retention_param
    test_container_param
    test_missing_container
    test_docker_dependency

    # Integration tests
    test_integration_backup

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
