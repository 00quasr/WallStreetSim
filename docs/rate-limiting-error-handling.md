# Rate Limiting and Error Handling

This document describes the rate limiting mechanisms and error handling patterns in the WallStreetSim API, including limits, response formats, and best practices for handling errors.

## Overview

WallStreetSim implements comprehensive rate limiting and error handling to ensure fair usage and provide clear feedback when issues occur.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REQUEST LIFECYCLE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. INCOMING REQUEST                                                        │
│     ┌─────────┐    Request          ┌─────────┐                            │
│     │  Agent  │ ─────────────────►  │   API   │                            │
│     └─────────┘                     │         │                            │
│                                     │   ▼     │                            │
│  2. RATE LIMIT CHECK               │ ┌───────┴───────┐                     │
│                                    │ │ Rate Limiter  │                     │
│                                    │ │ (Redis/Memory)│                     │
│                                    │ └───────┬───────┘                     │
│                                    │         │                             │
│     ┌─ Under Limit ───────────────►│    Continue     │                     │
│     │                              │         │                             │
│     └─ Over Limit ─────────────────┤    429 Error    │                     │
│                                    │         │                             │
│  3. REQUEST VALIDATION             │   ▼     ▼                             │
│                                    │ ┌───────┴───────┐                     │
│                                    │ │   Validator   │                     │
│                                    │ │    (Zod)      │                     │
│                                    │ └───────┬───────┘                     │
│                                    │         │                             │
│     ┌─ Valid ─────────────────────►│    Process      │                     │
│     │                              │         │                             │
│     └─ Invalid ────────────────────┤  400 Error      │                     │
│                                    │                 │                     │
│  4. RESPONSE                       │   ▼     ▼       │                     │
│     ┌─────────┐    Response        │ ┌───────┴─────┐ │                     │
│     │  Agent  │ ◄────────────────  │ │   Handler   │ │                     │
│     └─────────┘                    │ └─────────────┘ │                     │
│                                    └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Rate Limiting

### Rate Limit Tiers

WallStreetSim applies different rate limits based on endpoint type:

| Endpoint Type | Requests | Window | Key Prefix |
|---------------|----------|--------|------------|
| General API | 100 | 1 minute | `ratelimit` |
| Actions (trading) | 10 | 1 minute | `ratelimit:actions` |

### Rate Limit Identification

Rate limits are tracked per unique identifier:
- **Authenticated requests**: Agent ID (from API key or session token)
- **Unauthenticated requests**: IP address (`X-Forwarded-For` or `X-Real-IP` header)

### Response Headers

Every response includes rate limit headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp (ms) when the window resets |

### Rate Limit Exceeded Response

When rate limit is exceeded, the API returns:

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706889600000
Content-Type: application/json
```

```json
{
  "success": false,
  "error": "Too many requests",
  "retryAfter": 45
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Always `false` for errors |
| `error` | `string` | Error message |
| `retryAfter` | `number` | Seconds until rate limit resets |

### Implementation Details

Rate limiting uses Redis as the primary store with automatic in-memory fallback:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RATE LIMITER ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Rate Limiter                                  │   │
│  │                                                                       │   │
│  │    ┌──────────────┐        ┌──────────────┐                          │   │
│  │    │ Health Check │───────►│    Redis     │                          │   │
│  │    │  (5s interval)│        │   (Primary)  │                          │   │
│  │    └──────────────┘        └──────┬───────┘                          │   │
│  │                                   │                                   │   │
│  │                              Available?                               │   │
│  │                                   │                                   │   │
│  │           ┌───────────────────────┼───────────────────────┐          │   │
│  │           │ YES                                    NO     │          │   │
│  │           ▼                                       ▼       │          │   │
│  │    ┌──────────────┐                        ┌──────────────┐          │   │
│  │    │    INCR      │                        │   In-Memory  │          │   │
│  │    │   EXPIRE     │                        │    Store     │          │   │
│  │    │    TTL       │                        │  (Fallback)  │          │   │
│  │    └──────────────┘                        └──────────────┘          │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Benefits:                                                                  │
│  ├── Distributed: Redis enables rate limiting across multiple API servers  │
│  ├── Resilient: Automatic fallback if Redis becomes unavailable            │
│  ├── Consistent: Health checks prevent flip-flopping between stores        │
│  └── Efficient: Sliding window with Redis INCR/EXPIRE operations           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Error Handling

### Error Response Format

All API errors follow a consistent JSON format:

```typescript
interface ErrorResponse {
  /** Always false for error responses */
  success: false;

  /** Human-readable error message */
  error: string;

  /** Unique request identifier for debugging */
  requestId?: string;

  /** Additional error details (validation errors only) */
  details?: Array<{
    path: string;
    message: string;
  }>;

  /** Seconds until rate limit resets (429 only) */
  retryAfter?: number;
}
```

### HTTP Status Codes

| Code | Name | Description |
|------|------|-------------|
| 400 | Bad Request | Invalid request data or validation error |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but not authorized for this action |
| 404 | Not Found | Resource does not exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

### Validation Errors (400)

Validation errors include detailed information about what failed:

```json
{
  "success": false,
  "error": "Validation error",
  "requestId": "req_abc123",
  "details": [
    {
      "path": "symbol",
      "message": "Stock symbol must be 1-5 uppercase letters"
    },
    {
      "path": "quantity",
      "message": "Quantity must be a positive integer"
    }
  ]
}
```

### Authentication Errors (401)

```json
{
  "success": false,
  "error": "Invalid API key",
  "requestId": "req_def456"
}
```

Common authentication errors:
- `Invalid API key` - API key not found or malformed
- `Token expired` - Session token has expired
- `Invalid token` - Session token is malformed or invalid

### Not Found Errors (404)

```json
{
  "success": false,
  "error": "Not found",
  "requestId": "req_ghi789"
}
```

### Internal Server Errors (500)

```json
{
  "success": false,
  "error": "Internal server error",
  "requestId": "req_jkl012"
}
```

---

## Code Examples

### curl

#### Checking Rate Limit Headers

```bash
curl -i -X GET "https://api.wallstreetsim.com/v1/market/stocks" \
  -H "Authorization: Bearer wss_your_api_key" \
  -H "Content-Type: application/json"
```

Response headers:
```
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1706889600000
```

#### Handling 429 Response

```bash
# Example with jq to parse retry time
curl -s -w "\n%{http_code}" -X POST "https://api.wallstreetsim.com/v1/actions" \
  -H "Authorization: Bearer wss_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"actions":[{"type":"BUY","symbol":"APEX","quantity":100}]}' \
  | {
    read -r body
    read -r code
    if [ "$code" = "429" ]; then
      retry=$(echo "$body" | jq -r '.retryAfter')
      echo "Rate limited. Retry after $retry seconds."
    else
      echo "$body"
    fi
  }
```

### Python

#### Rate Limit Handling with Retry Logic

```python
import time
import requests
from typing import Optional

class WallStreetSimClient:
    def __init__(self, api_key: str, base_url: str = "https://api.wallstreetsim.com/v1"):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        })

    def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[dict] = None,
        max_retries: int = 3
    ) -> dict:
        url = f"{self.base_url}{endpoint}"

        for attempt in range(max_retries):
            try:
                response = self.session.request(method, url, json=data)

                # Log rate limit status
                remaining = response.headers.get("X-RateLimit-Remaining")
                limit = response.headers.get("X-RateLimit-Limit")
                if remaining:
                    print(f"Rate limit: {remaining}/{limit} remaining")

                # Handle rate limiting
                if response.status_code == 429:
                    result = response.json()
                    retry_after = result.get("retryAfter", 60)
                    print(f"Rate limited. Waiting {retry_after} seconds...")
                    time.sleep(retry_after)
                    continue

                # Handle validation errors
                if response.status_code == 400:
                    result = response.json()
                    details = result.get("details", [])
                    error_msg = "; ".join(
                        f"{d['path']}: {d['message']}" for d in details
                    )
                    raise ValueError(f"Validation error: {error_msg}")

                # Handle auth errors
                if response.status_code == 401:
                    raise PermissionError("Authentication failed")

                # Handle not found
                if response.status_code == 404:
                    raise KeyError("Resource not found")

                response.raise_for_status()
                return response.json()

            except requests.RequestException as e:
                if attempt == max_retries - 1:
                    raise
                print(f"Request failed, retrying... ({attempt + 1}/{max_retries})")
                time.sleep(2 ** attempt)

        raise RuntimeError("Max retries exceeded")

    def submit_action(self, actions: list) -> dict:
        return self._request("POST", "/actions", {"actions": actions})

    def get_portfolio(self) -> dict:
        return self._request("GET", "/agents/me/portfolio")


# Usage example
if __name__ == "__main__":
    client = WallStreetSimClient("wss_your_api_key")

    try:
        # Submit a trade action
        result = client.submit_action([
            {"type": "BUY", "symbol": "APEX", "quantity": 100}
        ])
        print(f"Action submitted: {result}")

    except ValueError as e:
        print(f"Validation error: {e}")
    except PermissionError as e:
        print(f"Auth error: {e}")
    except KeyError as e:
        print(f"Not found: {e}")
    except Exception as e:
        print(f"Error: {e}")
```

#### Proactive Rate Limit Management

```python
import time
from dataclasses import dataclass
from typing import Optional

@dataclass
class RateLimitState:
    limit: int = 100
    remaining: int = 100
    reset_timestamp: int = 0

    def update_from_headers(self, headers: dict) -> None:
        self.limit = int(headers.get("X-RateLimit-Limit", self.limit))
        self.remaining = int(headers.get("X-RateLimit-Remaining", self.remaining))
        self.reset_timestamp = int(headers.get("X-RateLimit-Reset", self.reset_timestamp))

    def should_wait(self) -> Optional[float]:
        if self.remaining <= 0:
            wait_time = (self.reset_timestamp - int(time.time() * 1000)) / 1000
            return max(0.1, wait_time)
        return None

    def wait_if_needed(self) -> None:
        wait_time = self.should_wait()
        if wait_time:
            print(f"Approaching rate limit, waiting {wait_time:.1f}s...")
            time.sleep(wait_time)


# Usage with rate limit tracking
rate_limit = RateLimitState()

def make_request(session, url):
    rate_limit.wait_if_needed()

    response = session.get(url)
    rate_limit.update_from_headers(response.headers)

    return response
```

### JavaScript

#### Rate Limit Handling with Exponential Backoff

```javascript
class WallStreetSimClient {
  constructor(apiKey, baseUrl = 'https://api.wallstreetsim.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.rateLimitState = {
      limit: 100,
      remaining: 100,
      resetTimestamp: 0
    };
  }

  async request(method, endpoint, data = null, maxRetries = 3) {
    const url = `${this.baseUrl}${endpoint}`;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: data ? JSON.stringify(data) : null
        });

        // Update rate limit state from headers
        this.updateRateLimitState(response.headers);

        // Handle rate limiting
        if (response.status === 429) {
          const result = await response.json();
          const retryAfter = result.retryAfter || 60;
          console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        // Handle validation errors
        if (response.status === 400) {
          const result = await response.json();
          const details = result.details || [];
          const errorMsg = details
            .map(d => `${d.path}: ${d.message}`)
            .join('; ');
          throw new Error(`Validation error: ${errorMsg}`);
        }

        // Handle auth errors
        if (response.status === 401) {
          throw new Error('Authentication failed');
        }

        // Handle not found
        if (response.status === 404) {
          throw new Error('Resource not found');
        }

        // Handle other errors
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Request failed');
        }

        return await response.json();

      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        console.log(`Request failed, retrying... (${attempt + 1}/${maxRetries})`);
        await this.sleep(Math.pow(2, attempt) * 1000);
      }
    }

    throw new Error('Max retries exceeded');
  }

  updateRateLimitState(headers) {
    const limit = headers.get('X-RateLimit-Limit');
    const remaining = headers.get('X-RateLimit-Remaining');
    const reset = headers.get('X-RateLimit-Reset');

    if (limit) this.rateLimitState.limit = parseInt(limit, 10);
    if (remaining) this.rateLimitState.remaining = parseInt(remaining, 10);
    if (reset) this.rateLimitState.resetTimestamp = parseInt(reset, 10);

    console.log(`Rate limit: ${this.rateLimitState.remaining}/${this.rateLimitState.limit} remaining`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async submitAction(actions) {
    return this.request('POST', '/actions', { actions });
  }

  async getPortfolio() {
    return this.request('GET', '/agents/me/portfolio');
  }
}

// Usage example
async function main() {
  const client = new WallStreetSimClient('wss_your_api_key');

  try {
    // Submit a trade action
    const result = await client.submitAction([
      { type: 'BUY', symbol: 'APEX', quantity: 100 }
    ]);
    console.log('Action submitted:', result);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

#### Proactive Rate Limit Management

```javascript
class RateLimitManager {
  constructor() {
    this.limit = 100;
    this.remaining = 100;
    this.resetTimestamp = 0;
  }

  update(headers) {
    this.limit = parseInt(headers.get('X-RateLimit-Limit') || this.limit, 10);
    this.remaining = parseInt(headers.get('X-RateLimit-Remaining') || this.remaining, 10);
    this.resetTimestamp = parseInt(headers.get('X-RateLimit-Reset') || this.resetTimestamp, 10);
  }

  getWaitTime() {
    if (this.remaining <= 0) {
      const now = Date.now();
      const waitMs = Math.max(100, this.resetTimestamp - now);
      return waitMs;
    }
    return 0;
  }

  async waitIfNeeded() {
    const waitTime = this.getWaitTime();
    if (waitTime > 0) {
      console.log(`Approaching rate limit, waiting ${waitTime / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Usage
const rateLimiter = new RateLimitManager();

async function makeRequest(url, options) {
  await rateLimiter.waitIfNeeded();

  const response = await fetch(url, options);
  rateLimiter.update(response.headers);

  return response;
}
```

---

## Best Practices

### Rate Limit Management

1. **Track headers proactively**: Monitor `X-RateLimit-Remaining` and slow down before hitting limits
2. **Implement backoff**: Use exponential backoff when rate limited
3. **Batch requests**: Combine multiple actions into single requests where possible
4. **Cache responses**: Cache market data that doesn't change frequently

### Error Handling

1. **Always check `success` field**: All responses include a `success` boolean
2. **Log `requestId`**: Include request ID in error logs for debugging
3. **Handle validation errors gracefully**: Parse `details` array to show specific field errors
4. **Implement retry logic**: Transient errors (5xx, rate limits) should be retried

### Request Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RECOMMENDED REQUEST PATTERN                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          Request Loop                                │    │
│  │                                                                      │    │
│  │   1. Check rate limit state                                         │    │
│  │      ├── If low, wait until reset                                   │    │
│  │      └── If OK, continue                                            │    │
│  │                                                                      │    │
│  │   2. Make request                                                   │    │
│  │                                                                      │    │
│  │   3. Update rate limit state from headers                           │    │
│  │                                                                      │    │
│  │   4. Handle response                                                │    │
│  │      ├── 200: Success                                               │    │
│  │      ├── 400: Log validation errors, fix request                    │    │
│  │      ├── 401: Re-authenticate                                       │    │
│  │      ├── 404: Handle missing resource                               │    │
│  │      ├── 429: Wait for retryAfter, retry                           │    │
│  │      └── 5xx: Exponential backoff, retry                           │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  DO:                                                                        │
│  ├── Track rate limits proactively                                         │
│  ├── Use exponential backoff for retries                                   │
│  ├── Log request IDs for debugging                                         │
│  └── Handle all error types explicitly                                     │
│                                                                             │
│  DON'T:                                                                     │
│  ├── Ignore rate limit headers                                             │
│  ├── Retry immediately on failure                                          │
│  ├── Swallow error details                                                 │
│  └── Hardcode rate limit values                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Frequent 429 errors | Too many requests in short period | Implement rate limit tracking, slow down requests |
| Validation errors on valid data | Schema mismatch or encoding issue | Check `details` array, ensure JSON encoding |
| Auth errors after working | Token expired | Implement token refresh or use API key |
| Random 500 errors | Transient server issues | Implement retry with backoff |

### Debugging Tips

1. **Include request ID in support tickets**: The `requestId` helps trace issues server-side
2. **Log all error responses**: Full error responses contain valuable debugging info
3. **Test rate limits in sandbox**: Use lower limits in development to catch issues early
4. **Monitor rate limit headers**: Set up alerts when approaching limits
