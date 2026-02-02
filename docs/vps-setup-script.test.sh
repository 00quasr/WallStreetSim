#!/bin/bash
# =============================================================================
# VPS Setup Script Tests
# Run with: bash docs/vps-setup-script.test.sh
# =============================================================================

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP_SCRIPT="$SCRIPT_DIR/vps-setup-script.sh"
PASSED=0
FAILED=0

# Test helper functions
pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    FAILED=$((FAILED + 1))
}

# =============================================================================
# Tests
# =============================================================================

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           VPS SETUP SCRIPT - TEST SUITE                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Script exists
echo "Test 1: Script file exists"
if [ -f "$SETUP_SCRIPT" ]; then
    pass "Setup script exists at $SETUP_SCRIPT"
else
    fail "Setup script not found at $SETUP_SCRIPT"
fi

# Test 2: Script has valid bash syntax
echo "Test 2: Script has valid bash syntax"
if bash -n "$SETUP_SCRIPT" 2>/dev/null; then
    pass "Script syntax is valid"
else
    fail "Script has syntax errors"
fi

# Test 3: Script is executable or has shebang
echo "Test 3: Script has proper shebang"
FIRST_LINE=$(head -1 "$SETUP_SCRIPT")
if [[ "$FIRST_LINE" == "#!/bin/bash"* ]]; then
    pass "Script has proper bash shebang"
else
    fail "Script missing or has incorrect shebang: $FIRST_LINE"
fi

# Test 4: Script contains certbot installation
echo "Test 4: Script contains certbot installation"
if grep -q "apt install.*certbot" "$SETUP_SCRIPT"; then
    pass "Script includes certbot installation"
else
    fail "Script missing certbot installation"
fi

# Test 5: Script contains renewal hook directory creation
echo "Test 5: Script creates renewal hooks directory"
if grep -q "/etc/letsencrypt/renewal-hooks/deploy" "$SETUP_SCRIPT"; then
    pass "Script creates renewal hooks directory"
else
    fail "Script missing renewal hooks directory creation"
fi

# Test 6: Script contains nginx reload hook
echo "Test 6: Script includes nginx reload hook"
if grep -q "reload-nginx.sh" "$SETUP_SCRIPT"; then
    pass "Script includes nginx reload hook"
else
    fail "Script missing nginx reload hook"
fi

# Test 7: Script contains cron job configuration
echo "Test 7: Script configures cron job for auto-renewal"
if grep -q "certbot renew" "$SETUP_SCRIPT"; then
    pass "Script includes certbot renew in cron"
else
    fail "Script missing certbot renew cron configuration"
fi

# Test 8: Cron job runs twice daily (as recommended by Let's Encrypt)
echo "Test 8: Cron job runs twice daily"
if grep -q '\*/12' "$SETUP_SCRIPT" || grep -q '0 0,12' "$SETUP_SCRIPT" || grep -q '0 \*/12' "$SETUP_SCRIPT"; then
    pass "Cron job configured to run twice daily"
else
    fail "Cron job not configured for twice daily runs"
fi

# Test 9: Script sets correct permissions for cron file
echo "Test 9: Script sets correct cron file permissions"
if grep -q 'chmod 644.*CRON_FILE\|chmod 644.*cron' "$SETUP_SCRIPT"; then
    pass "Cron file permissions set correctly (644)"
else
    fail "Cron file permissions not set to 644"
fi

# Test 10: Script includes deploy hook for nginx reload
echo "Test 10: Script includes deploy-hook for nginx"
if grep -q "\-\-deploy-hook.*nginx" "$SETUP_SCRIPT" || grep -q "systemctl reload nginx" "$SETUP_SCRIPT"; then
    pass "Script includes nginx reload deploy hook"
else
    fail "Script missing nginx reload deploy hook"
fi

# Test 11: Script enables certbot systemd timer (alternative to cron)
echo "Test 11: Script enables certbot systemd timer"
if grep -q "systemctl enable certbot.timer" "$SETUP_SCRIPT"; then
    pass "Script enables certbot systemd timer"
else
    fail "Script missing certbot.timer enablement"
fi

# Test 12: Script has idempotent cron job creation
echo "Test 12: Cron job creation is idempotent"
if grep -q 'if \[ ! -f' "$SETUP_SCRIPT" && grep -q 'cron' "$SETUP_SCRIPT"; then
    pass "Cron job creation checks for existing file"
else
    fail "Cron job creation may not be idempotent"
fi

# Test 13: Script makes renewal hook executable
echo "Test 13: Renewal hook is made executable"
if grep -q "chmod +x.*reload-nginx.sh" "$SETUP_SCRIPT"; then
    pass "Renewal hook is made executable"
else
    fail "Renewal hook not made executable"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                      TEST RESULTS                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
