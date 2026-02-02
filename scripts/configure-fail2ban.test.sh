#!/bin/bash
# Test suite for configure-fail2ban.sh
# Run with: ./scripts/configure-fail2ban.test.sh
#
# These tests verify the script's behavior without requiring root access
# by testing dry-run mode, argument parsing, and help output.

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly SCRIPT_UNDER_TEST="$SCRIPT_DIR/configure-fail2ban.sh"
readonly TEST_NAME="configure-fail2ban.test.sh"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test result tracking
declare -a FAILED_TESTS=()

# Logging functions
log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Assert functions
assert_exit_code() {
    local expected="$1"
    local actual="$2"
    local message="$3"

    if [[ "$expected" -eq "$actual" ]]; then
        return 0
    else
        echo "Expected exit code $expected, got $actual: $message"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"

    if [[ "$haystack" == *"$needle"* ]]; then
        return 0
    else
        echo "Expected to find '$needle' in output: $message"
        echo "Actual output (first 500 chars): ${haystack:0:500}"
        return 1
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"

    if [[ "$haystack" != *"$needle"* ]]; then
        return 0
    else
        echo "Expected NOT to find '$needle' in output: $message"
        return 1
    fi
}

# Run a test case
run_test() {
    local test_name="$1"
    local test_function="$2"

    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "Running: $test_name"

    if $test_function; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        log_pass "$test_name"
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        FAILED_TESTS+=("$test_name")
        log_fail "$test_name"
    fi
}

# Test: Script exists and is executable
test_script_exists() {
    if [[ -x "$SCRIPT_UNDER_TEST" ]]; then
        return 0
    else
        echo "Script not found or not executable: $SCRIPT_UNDER_TEST"
        return 1
    fi
}

# Test: Help option works
test_help_option() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --help 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Help should exit with 0" || return 1
    assert_contains "$output" "Usage:" "Help should contain usage info" || return 1
    assert_contains "$output" "fail2ban" "Help should mention fail2ban" || return 1
    assert_contains "$output" "--dry-run" "Help should mention dry-run option" || return 1
    assert_contains "$output" "--uninstall" "Help should mention uninstall option" || return 1
    assert_contains "$output" "Ban time:" "Help should show ban time" || return 1
    assert_contains "$output" "Max retry:" "Help should show max retry" || return 1

    return 0
}

# Test: Short help option works
test_short_help_option() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" -h 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Short help should exit with 0" || return 1
    assert_contains "$output" "Usage:" "Short help should contain usage info" || return 1

    return 0
}

# Test: Unknown option fails
test_unknown_option() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --invalid-option 2>&1) || exit_code=$?

    assert_exit_code 1 "$exit_code" "Unknown option should exit with 1" || return 1
    assert_contains "$output" "Unknown option" "Should report unknown option" || return 1

    return 0
}

# Test: Dry run mode outputs expected messages
test_dry_run_mode() {
    local output
    local exit_code=0

    # Dry run should work without root
    output=$("$SCRIPT_UNDER_TEST" --dry-run 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Dry run should exit with 0" || return 1
    assert_contains "$output" "Dry run mode enabled" "Should indicate dry run mode" || return 1
    assert_contains "$output" "[DRY RUN]" "Should prefix commands with DRY RUN" || return 1

    return 0
}

# Test: Dry run shows jail.local configuration
test_dry_run_jail_local() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --dry-run 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Dry run should exit with 0" || return 1
    assert_contains "$output" "jail.local" "Should mention jail.local" || return 1
    assert_contains "$output" "[DEFAULT]" "Should show DEFAULT section" || return 1
    assert_contains "$output" "ignoreip" "Should configure ignoreip" || return 1
    assert_contains "$output" "bantime" "Should configure bantime" || return 1
    assert_contains "$output" "findtime" "Should configure findtime" || return 1
    assert_contains "$output" "maxretry" "Should configure maxretry" || return 1

    return 0
}

# Test: Dry run shows SSH jail configuration
test_dry_run_ssh_jail() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --dry-run 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Dry run should exit with 0" || return 1
    assert_contains "$output" "[sshd]" "Should show sshd jail section" || return 1
    assert_contains "$output" "enabled = true" "SSH jail should be enabled" || return 1
    assert_contains "$output" "port = ssh" "Should configure SSH port" || return 1
    assert_contains "$output" "filter = sshd" "Should use sshd filter" || return 1

    return 0
}

# Test: Private networks are whitelisted
test_private_networks_whitelisted() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --dry-run 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Dry run should exit with 0" || return 1
    assert_contains "$output" "127.0.0.0/8" "Should whitelist localhost" || return 1
    assert_contains "$output" "10.0.0.0/8" "Should whitelist 10.x.x.x" || return 1
    assert_contains "$output" "172.16.0.0/12" "Should whitelist 172.16.x.x" || return 1
    assert_contains "$output" "192.168.0.0/16" "Should whitelist 192.168.x.x" || return 1

    return 0
}

# Test: Ban time increment is enabled
test_ban_time_increment() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --dry-run 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Dry run should exit with 0" || return 1
    assert_contains "$output" "bantime.increment = true" "Should enable ban time increment" || return 1
    assert_contains "$output" "bantime.factor" "Should configure ban time factor" || return 1
    assert_contains "$output" "bantime.maxtime" "Should configure max ban time" || return 1

    return 0
}

# Test: Uninstall mode
test_uninstall_mode() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --dry-run --uninstall 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Uninstall with dry-run should exit with 0" || return 1
    assert_contains "$output" "Uninstall mode enabled" "Should indicate uninstall mode" || return 1
    assert_contains "$output" "[DRY RUN] Would remove" "Should show files to be removed" || return 1

    return 0
}

# Test: Script has proper shebang
test_script_shebang() {
    local first_line
    first_line=$(head -1 "$SCRIPT_UNDER_TEST")

    if [[ "$first_line" == "#!/bin/bash" ]]; then
        return 0
    else
        echo "Expected shebang '#!/bin/bash', got '$first_line'"
        return 1
    fi
}

# Test: Script uses strict mode
test_script_strict_mode() {
    if grep -q "set -euo pipefail" "$SCRIPT_UNDER_TEST"; then
        return 0
    else
        echo "Script should use 'set -euo pipefail' for strict mode"
        return 1
    fi
}

# Test: Script has comment documentation
test_script_documentation() {
    local content
    content=$(cat "$SCRIPT_UNDER_TEST")

    assert_contains "$content" "# Fail2ban Configuration" "Should have title comment" || return 1
    assert_contains "$content" "# Usage:" "Should have usage documentation" || return 1
    assert_contains "$content" "# Options:" "Should have options documentation" || return 1
    assert_contains "$content" "# Configuration:" "Should have configuration documentation" || return 1

    return 0
}

# Test: Script checks for root
test_root_check() {
    local content
    content=$(cat "$SCRIPT_UNDER_TEST")

    assert_contains "$content" "EUID" "Should check for root using EUID" || return 1
    assert_contains "$content" "must be run as root" "Should have root error message" || return 1

    return 0
}

# Test: Script checks for fail2ban installation
test_fail2ban_check() {
    local content
    content=$(cat "$SCRIPT_UNDER_TEST")

    assert_contains "$content" "fail2ban-client" "Should check for fail2ban-client" || return 1
    assert_contains "$content" "apt-get install" "Should have install command" || return 1

    return 0
}

# Test: Configuration complete message
test_completion_message() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --dry-run 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Dry run should exit with 0" || return 1
    assert_contains "$output" "configuration complete" "Should show completion message" || return 1

    return 0
}

# Test: Help shows useful commands
test_help_shows_useful_commands() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --help 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Help should exit with 0" || return 1
    assert_contains "$output" "fail2ban-client status" "Should show status command" || return 1
    assert_contains "$output" "unbanip" "Should show unban command" || return 1
    assert_contains "$output" "fail2ban.log" "Should mention log file" || return 1

    return 0
}

# Test: SSH jail uses systemd backend
test_systemd_backend() {
    local output
    local exit_code=0

    output=$("$SCRIPT_UNDER_TEST" --dry-run 2>&1) || exit_code=$?

    assert_exit_code 0 "$exit_code" "Dry run should exit with 0" || return 1
    assert_contains "$output" "backend = systemd" "Should use systemd backend" || return 1

    return 0
}

# Test: Configuration verifies syntax
test_config_verification() {
    local content
    content=$(cat "$SCRIPT_UNDER_TEST")

    assert_contains "$content" "fail2ban-client -t" "Should verify config with -t flag" || return 1
    assert_contains "$content" "Configuration syntax" "Should report syntax status" || return 1

    return 0
}

# Print test summary
print_summary() {
    echo ""
    echo "========================================"
    echo "  Test Summary"
    echo "========================================"
    echo "  Total:  $TESTS_RUN"
    echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    echo "========================================"

    if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
        echo ""
        echo "Failed tests:"
        for test in "${FAILED_TESTS[@]}"; do
            echo -e "  ${RED}✗${NC} $test"
        done
    fi

    echo ""
}

# Main test runner
main() {
    echo "========================================"
    echo "  Fail2ban Configuration Script Tests"
    echo "========================================"
    echo ""

    # Basic tests
    run_test "Script exists and is executable" test_script_exists
    run_test "Script has proper shebang" test_script_shebang
    run_test "Script uses strict mode" test_script_strict_mode
    run_test "Script has documentation" test_script_documentation

    # Help tests
    run_test "Help option (--help)" test_help_option
    run_test "Short help option (-h)" test_short_help_option
    run_test "Unknown option fails" test_unknown_option
    run_test "Help shows useful commands" test_help_shows_useful_commands

    # Dry run tests
    run_test "Dry run mode works" test_dry_run_mode
    run_test "Dry run shows jail.local config" test_dry_run_jail_local
    run_test "Dry run shows SSH jail config" test_dry_run_ssh_jail
    run_test "Private networks are whitelisted" test_private_networks_whitelisted
    run_test "Ban time increment enabled" test_ban_time_increment
    run_test "Uses systemd backend" test_systemd_backend
    run_test "Uninstall mode works" test_uninstall_mode
    run_test "Completion message shown" test_completion_message

    # Security tests
    run_test "Script checks for root" test_root_check
    run_test "Script checks for fail2ban installation" test_fail2ban_check
    run_test "Configuration syntax verification" test_config_verification

    print_summary

    # Exit with appropriate code
    if [[ $TESTS_FAILED -gt 0 ]]; then
        exit 1
    else
        exit 0
    fi
}

# Run tests
main "$@"
