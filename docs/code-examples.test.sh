#!/bin/bash
# =============================================================================
# Documentation Code Examples Tests
# Validates syntax and structure of code examples in documentation files
# Run with: bash docs/code-examples.test.sh
# =============================================================================

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASSED=0
FAILED=0
SKIPPED=0

# Test helper functions
pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    FAILED=$((FAILED + 1))
}

skip() {
    echo -e "${YELLOW}○ SKIP${NC}: $1"
    SKIPPED=$((SKIPPED + 1))
}

# Create temp directory for extracted code
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# =============================================================================
# Test Functions
# =============================================================================

# Extract code blocks from markdown file
extract_code_blocks() {
    local file="$1"
    local lang="$2"
    local output_dir="$3"
    local count=0

    # Use awk to extract code blocks with specified language
    awk -v lang="$lang" -v dir="$output_dir" '
    BEGIN { in_block=0; block_num=0 }
    /^```'"$lang"'/ { in_block=1; block_num++; next }
    /^```$/ && in_block { in_block=0; next }
    in_block { print >> (dir "/block_" block_num ".tmp") }
    END { print block_num }
    ' "$file"
}

# Test Python syntax
test_python_syntax() {
    local file="$1"
    if python3 -m py_compile "$file" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Test JavaScript/TypeScript syntax using node
test_javascript_syntax() {
    local file="$1"
    if node --check "$file" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Test bash syntax
test_bash_syntax() {
    local file="$1"
    if bash -n "$file" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Test JSON syntax
test_json_syntax() {
    local file="$1"
    if python3 -c "import json; json.load(open('$file'))" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# Tests
# =============================================================================

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║        DOCUMENTATION CODE EXAMPLES - TEST SUITE               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# -----------------------------------------------------------------------------
# Test 1: Documentation files exist
# -----------------------------------------------------------------------------
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 1: Documentation files exist"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    if [ -f "$SCRIPT_DIR/$doc" ]; then
        pass "$doc exists"
    else
        fail "$doc not found"
    fi
done

# -----------------------------------------------------------------------------
# Test 2: Documentation contains code examples section
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 2: Code Examples sections exist"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    if grep -q "## Code Examples" "$SCRIPT_DIR/$doc" 2>/dev/null; then
        pass "$doc has Code Examples section"
    else
        fail "$doc missing Code Examples section"
    fi
done

# -----------------------------------------------------------------------------
# Test 3: Documentation contains Python examples
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 3: Python examples exist"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    if grep -q '```python' "$SCRIPT_DIR/$doc" 2>/dev/null; then
        pass "$doc has Python code examples"
    else
        fail "$doc missing Python code examples"
    fi
done

# -----------------------------------------------------------------------------
# Test 4: Documentation contains JavaScript examples
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 4: JavaScript examples exist"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    if grep -q '```javascript' "$SCRIPT_DIR/$doc" 2>/dev/null; then
        pass "$doc has JavaScript code examples"
    else
        fail "$doc missing JavaScript code examples"
    fi
done

# -----------------------------------------------------------------------------
# Test 5: Documentation contains curl examples
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 5: curl examples exist"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    if grep -q '```bash' "$SCRIPT_DIR/$doc" 2>/dev/null || grep -q 'curl' "$SCRIPT_DIR/$doc" 2>/dev/null; then
        pass "$doc has bash/curl code examples"
    else
        fail "$doc missing bash/curl code examples"
    fi
done

# -----------------------------------------------------------------------------
# Test 6: Documentation contains TypeScript examples
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 6: TypeScript examples exist"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    if grep -q '```typescript' "$SCRIPT_DIR/$doc" 2>/dev/null; then
        pass "$doc has TypeScript code examples"
    else
        fail "$doc missing TypeScript code examples"
    fi
done

# -----------------------------------------------------------------------------
# Test 7: Python code blocks have valid syntax
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 7: Python syntax validation"
echo "═══════════════════════════════════════════════════════════════"

if command -v python3 &> /dev/null; then
    for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
        # Create subdirectory for this doc's code blocks
        mkdir -p "$TEMP_DIR/$doc"

        # Extract Python code blocks
        awk '
        BEGIN { in_block=0; block_num=0 }
        /^```python/ { in_block=1; block_num++; next }
        /^```$/ && in_block { in_block=0; next }
        in_block { print >> ("'"$TEMP_DIR/$doc"'/python_" block_num ".py") }
        ' "$SCRIPT_DIR/$doc"

        # Test each Python file
        block_count=0
        error_count=0
        for pyfile in "$TEMP_DIR/$doc"/python_*.py; do
            if [ -f "$pyfile" ]; then
                block_count=$((block_count + 1))
                if ! python3 -m py_compile "$pyfile" 2>/dev/null; then
                    error_count=$((error_count + 1))
                fi
            fi
        done

        if [ $block_count -gt 0 ]; then
            if [ $error_count -eq 0 ]; then
                pass "$doc: All $block_count Python blocks have valid syntax"
            else
                fail "$doc: $error_count/$block_count Python blocks have syntax errors"
            fi
        else
            skip "$doc: No Python code blocks found to validate"
        fi
    done
else
    skip "Python3 not available - skipping Python syntax validation"
fi

# -----------------------------------------------------------------------------
# Test 8: JSON code blocks have valid syntax
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 8: JSON syntax validation"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    # Create subdirectory for this doc's code blocks
    mkdir -p "$TEMP_DIR/$doc"

    # Extract JSON code blocks
    awk '
    BEGIN { in_block=0; block_num=0 }
    /^```json/ { in_block=1; block_num++; next }
    /^```$/ && in_block { in_block=0; next }
    in_block { print >> ("'"$TEMP_DIR/$doc"'/json_" block_num ".json") }
    ' "$SCRIPT_DIR/$doc"

    # Test each JSON file
    block_count=0
    error_count=0
    for jsonfile in "$TEMP_DIR/$doc"/json_*.json; do
        if [ -f "$jsonfile" ]; then
            block_count=$((block_count + 1))
            if ! python3 -c "import json; json.load(open('$jsonfile'))" 2>/dev/null; then
                error_count=$((error_count + 1))
            fi
        fi
    done

    if [ $block_count -gt 0 ]; then
        if [ $error_count -eq 0 ]; then
            pass "$doc: All $block_count JSON blocks have valid syntax"
        else
            fail "$doc: $error_count/$block_count JSON blocks have syntax errors"
        fi
    else
        skip "$doc: No JSON code blocks found to validate"
    fi
done

# -----------------------------------------------------------------------------
# Test 9: curl commands are well-formed
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 9: curl command structure validation"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    # Check for proper curl command structure
    curl_count=$(grep -c 'curl -X\|curl https\?\|curl http' "$SCRIPT_DIR/$doc" 2>/dev/null | head -1 || echo "0")

    if [ "$curl_count" -gt 0 ]; then
        # Check that curl commands have proper headers
        has_content_type=$(grep -c 'Content-Type.*application/json' "$SCRIPT_DIR/$doc" 2>/dev/null | head -1 || echo "0")
        has_auth=$(grep -c 'Authorization.*Bearer' "$SCRIPT_DIR/$doc" 2>/dev/null | head -1 || echo "0")

        if [ "$has_content_type" -gt 0 ] && [ "$has_auth" -gt 0 ]; then
            pass "$doc: curl commands have proper headers (Content-Type, Authorization)"
        elif [ "$has_content_type" -gt 0 ]; then
            pass "$doc: curl commands have Content-Type header"
        else
            fail "$doc: curl commands missing proper headers"
        fi
    else
        skip "$doc: No curl commands found"
    fi
done

# -----------------------------------------------------------------------------
# Test 10: Code examples include error handling
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 10: Error handling patterns"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    # Check for error handling patterns
    has_try_catch=$(grep -c 'try.*catch\|try:\|except\|raise_for_status\|\.catch\|catch.*error\|connect_error' "$SCRIPT_DIR/$doc" 2>/dev/null | head -1 || echo "0")
    has_response_check=$(grep -c 'response.ok\|response.raise_for_status\|status.*401\|status.*4\|reject\|Error' "$SCRIPT_DIR/$doc" 2>/dev/null | head -1 || echo "0")

    if [ "$has_try_catch" -gt 0 ] || [ "$has_response_check" -gt 0 ]; then
        pass "$doc: Code examples include error handling patterns"
    else
        fail "$doc: Code examples missing error handling patterns"
    fi
done

# -----------------------------------------------------------------------------
# Test 11: Signature verification examples exist
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 11: Signature verification examples"
echo "═══════════════════════════════════════════════════════════════"

for doc in "webhooks.md"; do
    if grep -q 'verify.*[Ss]ignature\|HMAC\|hmac\|sha256' "$SCRIPT_DIR/$doc" 2>/dev/null; then
        pass "$doc: Contains signature verification examples"
    else
        fail "$doc: Missing signature verification examples"
    fi
done

# -----------------------------------------------------------------------------
# Test 12: WebSocket examples include authentication
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 12: WebSocket authentication examples"
echo "═══════════════════════════════════════════════════════════════"

for doc in "websocket-events.md"; do
    if grep -q 'AUTH.*apiKey\|emit.*AUTH\|apiKey' "$SCRIPT_DIR/$doc" 2>/dev/null; then
        pass "$doc: Contains WebSocket authentication examples"
    else
        fail "$doc: Missing WebSocket authentication examples"
    fi
done

# -----------------------------------------------------------------------------
# Test 13: Actions examples cover trading operations
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 13: Trading action examples"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md"; do
    has_buy=$(grep -c "type.*BUY\|'BUY'\|\"BUY\"" "$SCRIPT_DIR/$doc" 2>/dev/null || echo "0")
    has_sell=$(grep -c "type.*SELL\|'SELL'\|\"SELL\"" "$SCRIPT_DIR/$doc" 2>/dev/null || echo "0")

    if [ "$has_buy" -gt 0 ] && [ "$has_sell" -gt 0 ]; then
        pass "$doc: Contains BUY and SELL action examples"
    else
        fail "$doc: Missing trading action examples (BUY/SELL)"
    fi
done

# -----------------------------------------------------------------------------
# Test 14: Documentation has consistent formatting
# -----------------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test Group 14: Documentation formatting consistency"
echo "═══════════════════════════════════════════════════════════════"

for doc in "actions.md" "webhooks.md" "websocket-events.md"; do
    # Check for section headers
    has_curl_section=$(grep -c "### curl" "$SCRIPT_DIR/$doc" 2>/dev/null || echo "0")
    has_python_section=$(grep -c "### Python" "$SCRIPT_DIR/$doc" 2>/dev/null || echo "0")
    has_js_section=$(grep -c "### JavaScript" "$SCRIPT_DIR/$doc" 2>/dev/null || echo "0")

    if [ "$has_curl_section" -gt 0 ] && [ "$has_python_section" -gt 0 ] && [ "$has_js_section" -gt 0 ]; then
        pass "$doc: Has consistent section headers for curl, Python, JavaScript"
    else
        fail "$doc: Missing consistent section headers (curl: $has_curl_section, Python: $has_python_section, JS: $has_js_section)"
    fi
done

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                      TEST RESULTS                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Passed:  ${GREEN}$PASSED${NC}"
echo -e "Failed:  ${RED}$FAILED${NC}"
echo -e "Skipped: ${YELLOW}$SKIPPED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
