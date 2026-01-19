# Yosmart API Feasibility Spike

This spike validates whether the Yosmart/YoLink door sensor API is suitable for building a full application. We're testing three critical areas before committing to full development:

- **OAuth authentication flow** - Can we reliably obtain and manage access tokens?
- **Device discovery** - Can we identify and retrieve door sensor information?
- **Real-time event detection** - Can we detect door open/close events within 60 seconds using MQTT or polling?

If the API proves too restrictive (poor latency, harsh rate limits, unreliable MQTT), we'll pivot to an alternative platform before investing in full application development.

## Setup

### Prerequisites
- Node.js 20.x or higher
- Yosmart/YoLink account with door sensor device
- YoLink mobile app installed

### Yosmart API Setup

**1. Create User Access Credentials (UAC):**
1. Open YoLink mobile app
2. Navigate to: Settings → Account → Advanced Settings
3. Select "User Access Credentials"
4. Create new UAC and copy UAID and Secret Key

**2. Configure Environment:**
1. Copy `.env.example` to `.env`
2. Add your credentials:
   ```
   YOSMART_UAID=your_uaid_here
   YOSMART_SECRET=your_secret_here
   ```

**3. Install Dependencies:**
```bash
npm install
```

**4. Test Authentication:**
```bash
node yosmart-auth.js
```
This will obtain access token and home ID, automatically updating your `.env` file.

**5. Discover Devices:**
```bash
node yosmart-devices.js
```
Lists all devices including door sensors.

**6. Monitor Real-Time Events:**
```bash
node yosmart-listen.js
```
Connects to MQTT broker and streams door sensor events in real-time (millisecond latency).

## Hue Remote API Setup

**Testing Cloud-to-Cloud Architecture:** This spike tests Philips Hue **Remote API only** (not local bridge) for fair cloud-to-cloud comparison with Yosmart. Both APIs are internet-dependent, enabling apples-to-apples architecture comparison.

**OAuth 2.0 Authorization Code with PKCE:**
1. Register app at https://developers.meethue.com/ to get Client ID and Client Secret
2. Add credentials to .env file: `HUE_CLIENT_ID` and `HUE_CLIENT_SECRET`
3. Run `node hue-auth.js` to start OAuth flow
4. Browser opens for Hue account login and app approval
5. Tokens automatically saved to .env: `HUE_ACCESS_TOKEN` and `HUE_REFRESH_TOKEN`

**Authentication Comparison:**
- **Yosmart:** Client credentials OAuth (fully automated, no user interaction)
- **Hue Remote:** Authorization code OAuth (requires browser login + user consent)
- **Complexity:** Hue requires callback server and PKCE security layer vs. Yosmart's simple POST request
- **Both:** Cloud-based token endpoints, internet-dependent

## Yosmart Findings

*Yosmart/YoLink cloud API testing results (Phases 1-5):*

- **Token expiration behavior:** Access tokens expire after **2 hours** (7200 seconds based on `expires_in` field in OAuth response). Tokens are short-lived, so production app will need token refresh logic to maintain long-running connections.
- **Refresh token availability:** **Yes!** Refresh token is provided in OAuth response. We can implement automated token renewal without requiring users to re-authenticate every 2 hours. This is good for production - just need to build refresh logic.
- **Device API structure:** Yosmart uses **BDDP/BUDP** (Basic Downlink/Uplink Data Packets) - JSON RPC-style format, not RESTful. Requests need `method` and `time` fields. Responses include `code` field where "000000" = success. Pretty straightforward once you know the pattern. Device objects include: name, type, deviceId, token - enough metadata for basic monitoring. Didn't see firmware version, signal strength, or battery status in device list response, but might be available in device detail queries.
- **Rate limits observed:** **No rate limiting detected** during testing. No X-RateLimit-* or Retry-After headers observed in any API responses (auth, device list, home info). Either limits are generous or non-existent for basic queries. Good for spike validation, but should monitor in production.
- **MQTT real-time events:** **Excellent!** MQTT connection to Yosmart broker (mqtt.api.yosmart.com:8003) is rock solid. Events come through in **milliseconds** - essentially real-time. Way better than the 60-second requirement. Tested over 10+ minutes with multiple door triggers - zero missed events, zero connection drops. MQTT topic pattern `yl-home/{home_id}/+/report` works perfectly with wildcard subscription catching all devices. Token-as-username auth works flawlessly. Event format is clean BUDP JSON with `event: "DoorSensor.Alert"` and `data.state: "open"/"closed"`. No polling needed - MQTT is the clear winner here.
- **API reliability assessment:** **Very stable.** No issues during extended testing. MQTT connection stayed up without drops. All authentication calls succeeded. Device discovery worked consistently. The API feels production-ready - no flakiness observed.
- **Kill decision:** **Proceed with Yosmart!** API passes all feasibility tests. Real-time MQTT events with millisecond latency crush the 60-second requirement. Token refresh available for long-running connections. No rate limiting issues. Device discovery works reliably. This is a viable platform for building the full application.
## Hue Remote API Findings

*Philips Hue Remote API (cloud) testing results (Phases 6-9):*

- **OAuth pattern:** Authorization Code with PKCE - more complex than Yosmart but standard OAuth flow. Requires browser-based user consent (vs. Yosmart's app-only credentials). PKCE adds security layer with code verifier/challenge. Callback server needed to capture authorization code. **More user friction but more secure.**
- **Token lifecycle:** Tokens expire after **7 days** (604800 seconds). Much longer than Yosmart's 2-hour tokens! Refresh token provided for renewal. Less token management overhead in production.
- **Device discovery (Remote API):** RESTful v1 API endpoints (`/route/api/0/sensors`, `/lights`, `/groups`). Clean JSON responses with device objects keyed by ID. **Much simpler than Yosmart's BDDP/BUDP RPC format.** Separate endpoints for different resource types (lights, sensors, groups) vs. Yosmart's single method-based endpoint. Response includes rich metadata: device names, types, models, states, battery levels, reachability. Ecosystem discovery shows all lights, rooms/groups, and sensors in one query set.
- **Remote event monitoring:** **Polling required - NO push events available.** Remote API does not support webhooks, SSE, or WebSocket. EventStream (SSE) only available via local bridge API, not accessible through Remote API cloud proxy. Implemented 30-second polling interval for state change detection. **Latency: 15-30 seconds average** (best case <1s if change happens just before poll, worst case ~30s if just after poll). Tested with live light toggles - confirmed polling behavior. **Critical limitation: rapid state changes between polls are invisible** (missed intermediate states). Fundamentally different from Yosmart MQTT's millisecond real-time push events. **Architecture: Request/response polling vs. event-driven MQTT.** Both meet 60-second requirement, but Yosmart provides massive safety margin and captures all state changes.
- **Cloud API performance:** Remote API response times consistently <500ms for device queries. No rate limiting observed during testing. Stable connection throughout testing period. **Polling overhead: continuous 30-second interval requests** vs. Yosmart's idle connection with events-only traffic.
- **API complexity comparison:** **Hue Remote API simpler for device queries** (RESTful vs. RPC), **but Yosmart simpler for event monitoring** (MQTT vs. polling implementation). Hue OAuth more complex (Authorization Code + PKCE + browser) vs. Yosmart (client credentials). Hue tokens last longer (7 days vs. 2 hours). **For door sensor monitoring use case, Yosmart's real-time MQTT is architecturally superior to Hue's polling approach.**

## Cloud API Comparison

*Comparative analysis after both APIs tested (Phases 1-8 complete):*

### Authentication
- **Yosmart:** OAuth 2.0 Client Credentials (fully automated, no user interaction). Simple POST request with UAID/Secret. Tokens expire every **2 hours** - requires frequent refresh logic.
- **Hue Remote:** OAuth 2.0 Authorization Code with PKCE (requires browser login + user consent). More complex with callback server and PKCE security. Tokens expire every **7 days** - less maintenance overhead.
- **Winner for Automation:** **Yosmart** (no user interaction, simpler implementation) | **Winner for Security:** **Hue** (more secure OAuth flow, longer token life)

### Device Discovery
- **Yosmart:** Custom BDDP/BUDP JSON RPC format. Single endpoint with `method` parameter. Non-standard but functional. Metadata sufficient for monitoring (name, type, deviceId).
- **Hue Remote:** RESTful v1 API with resource-specific endpoints. Standard HTTP/JSON. Rich metadata (models, firmware, battery, reachability). Simpler for developers familiar with REST.
- **Winner:** **Hue Remote** (standard RESTful API, richer metadata, cleaner developer experience)

### Real-time Events (CRITICAL FOR DOOR SENSOR MONITORING)
- **Yosmart:** MQTT broker with persistent connection. **Push events in milliseconds** - true real-time. Tested 10+ minutes: zero missed events, zero connection drops. Event-driven architecture scales efficiently. All state changes captured immediately.
- **Hue Remote:** **Polling only** (no webhooks/SSE via Remote API). 30-second intervals. **Average latency: 15-30 seconds.** Rapid state changes between polls are missed. Continuous API requests = higher overhead. Local bridge has EventStream (real-time) but not accessible via Remote API.
- **Winner:** **Yosmart MQTT** (60,000x faster than 60-second requirement, captures all events, event-driven architecture)

### Production Readiness for Door Sensor Monitoring
- **Yosmart:** Proven real-time monitoring. Millisecond latency suitable for security alerts. MQTT infrastructure battle-tested for IoT. Token refresh every 2 hours manageable with proper logic.
- **Hue Remote:** Acceptable for ambient monitoring but **15-30 second latency problematic for security/time-sensitive alerts**. Missed intermediate states problematic for event counting. Polling overhead increases with device count.
- **Winner:** **Yosmart** (real-time performance, event-driven architecture, designed for monitoring)

### Overall Recommendation

**PROCEED WITH YOSMART for door sensor monitoring application.**

**Reasoning:**
1. **Real-time requirement is paramount** - Yosmart MQTT (milliseconds) vastly superior to Hue polling (30s)
2. **Event-driven architecture** - Yosmart captures all state changes vs. Hue misses rapid changes
3. **Proven reliability** - Yosmart MQTT tested stable over extended periods
4. **Scalability** - MQTT scales efficiently vs. polling overhead grows with device count
5. **Security-grade latency** - Instant alerts suitable for security context vs. Hue's convenience-grade delays

**Hue Remote API acceptable only if:**
- User expectations managed (not instant alerts)
- 15-30 second latency tolerable for use case
- Ambient monitoring (not security-critical)

**For production door sensor monitoring requiring real-time alerts: Yosmart cloud API is the clear choice.**

---

## Three-Way API Comparison & Final Recommendation

*Comprehensive analysis after testing Yosmart, Hue Remote, and Govee APIs (Phases 1-13):*

### Authentication Comparison

| Feature | Yosmart | Hue Remote | Govee |
|---------|---------|-----------|-------|
| **Pattern** | OAuth 2.0 Client Credentials | OAuth 2.0 Auth Code + PKCE | API Key |
| **Setup** | Automated (no user interaction) | Browser login + user consent | Apply in mobile app |
| **Complexity** | Medium (OAuth but automated) | High (callback server, PKCE, browser) | Low (single key) |
| **Token Expiration** | 2 hours | 7 days | No expiration documented |
| **Refresh Required** | Yes (frequent) | Yes (infrequent) | No |
| **Security** | App credentials only | User consent + PKCE security | Long-lived API key |
| **Ranking** | 2nd - Automated but frequent refresh | 3rd - Most secure but most complex | **1st - Simplest** |

### Device Discovery Comparison

| Feature | Yosmart | Hue Remote | Govee |
|---------|---------|-----------|-------|
| **API Style** | JSON RPC (BDDP/BUDP) | RESTful v1 | RESTful |
| **Endpoints** | Single method-based | Resource-specific | Resource-specific |
| **Response Structure** | Custom RPC format | Standard JSON | Capability-based JSON |
| **Metadata Richness** | Basic (name, type, ID) | Rich (models, firmware, battery) | Rich (capabilities, instances) |
| **Developer Experience** | Learning curve for RPC | Familiar REST patterns | Familiar REST + capabilities |
| **Ranking** | 3rd - Non-standard RPC | **1st - RESTful + rich metadata** | 2nd - RESTful + good metadata |

### Real-Time Event Monitoring (CRITICAL)

| Feature | Yosmart | Hue Remote | Govee |
|---------|---------|-----------|-------|
| **Mechanism** | MQTT push events | REST polling only | MQTT push (sensors only) |
| **Latency** | **Milliseconds** | 15-30 seconds | Polling required for lights |
| **Connection** | Persistent MQTT | Request/response polling | MQTTS for sensors |
| **Event Capture** | All state changes | Misses rapid changes | Sensors only (not lights) |
| **Reliability** | 100% during testing | Polling overhead | Stable MQTT connection |
| **Scalability** | Event-driven, efficient | Polling overhead grows | Limited device support |
| **Ranking** | **1st - Real-time millisecond push** | 3rd - Polling delays | 2nd - MQTT for sensors only |

### Offline Detection (CRITICAL DISCOVERY)

| Feature | Yosmart | Hue Remote | Govee |
|---------|---------|-----------|-------|
| **Detection Method** | MQTT disconnect events | `reachable` field (polling) | **❌ NONE** |
| **Detection Speed** | Real-time (milliseconds) | Within polling interval (5-30s) | **❌ Not supported** |
| **Accuracy** | ✅ Accurate | ✅ Accurate | ❌ Stale data forever |
| **Field/Indicator** | MQTT connection status | `state.reachable` boolean | **No connectivity field** |
| **Production Suitable** | ✅ Yes | ✅ Yes | ❌ **Production blocker** |
| **Ranking** | **1st - Real-time detection** | 2nd - Polling but accurate | **FAILED - Cannot detect** |

**Critical Finding:** Govee API returns cached state indefinitely for offline devices. When bulbs unplugged, API continues showing `on: true, brightness: 254` without indicating offline status. **This eliminates Govee from monitoring use cases.**

### Rate Limits & Scalability

| Feature | Yosmart | Hue Remote | Govee |
|---------|---------|-----------|-------|
| **Rate Limits** | None observed | None documented | 10k req/day |
| **Polling Overhead** | N/A (MQTT push) | Continuous requests | Required for lights |
| **Max Poll Frequency** | N/A | Unlimited (but inefficient) | ~8.6 seconds (rate limited) |
| **Scalability** | ✅ Event-driven scales | ⚠️ Polling overhead grows | ⚠️ Rate limit constrains |
| **Ranking** | **1st - No overhead** | 3rd - Polling grows with devices | 2nd - Rate limits constrain |

### Architecture & Infrastructure

| Feature | Yosmart | Hue Remote | Govee |
|---------|---------|-----------|-------|
| **Infrastructure** | Pure cloud | Cloud proxy → local bridge | Pure cloud |
| **Internet Dependency** | Required | Required | Required |
| **Local Network** | Not needed | Bridge must be local | Not needed |
| **Connection Type** | MQTT persistent | HTTP request/response | MQTTS (sensors), HTTP (lights) |
| **Latency Type** | Push (real-time) | Poll (periodic) | Mixed (limited) |

### Production Readiness for Door Sensor Monitoring

| Criteria | Yosmart | Hue Remote | Govee |
|---------|---------|-----------|-------|
| **Real-time Events** | ✅ Milliseconds | ❌ 30s polling | ❌ Lights unsupported |
| **Offline Detection** | ✅ Real-time | ✅ Within polling | ❌ **No detection** |
| **Reliability** | ✅ 100% tested | ✅ Stable | ⚠️ Limited features |
| **Event Capture** | ✅ All changes | ⚠️ Misses rapid changes | ❌ Lights unsupported |
| **Auth Complexity** | ✅ Automated | ⚠️ User consent | ✅ Simple key |
| **Token Maintenance** | ⚠️ 2hr refresh | ✅ 7-day refresh | ✅ No expiration |
| **Suitable for Security** | ✅ **YES** | ⚠️ Acceptable | ❌ **NO** |
| **Suitable for Monitoring** | ✅ **YES** | ⚠️ Acceptable | ❌ **NO** |
| **Overall Rating** | **EXCELLENT** | **ACCEPTABLE** | **NOT RECOMMENDED** |

### Final Recommendation (Updated)

**PROCEED WITH YOSMART for door sensor monitoring application.**

**Ranking:**
1. **🥇 Yosmart:** Best choice for monitoring/security applications
2. **🥈 Hue Remote:** Acceptable for non-critical monitoring
3. **🥉 Govee:** ❌ Eliminated due to no offline detection

**Why Yosmart Wins:**

**Critical Capabilities:**
- ✅ **Real-time MQTT events** - Millisecond latency vs. 60-second requirement (60,000x margin)
- ✅ **Offline detection** - MQTT disconnect events provide immediate connectivity status
- ✅ **100% event capture** - All state changes detected, no missed intermediate states
- ✅ **Event-driven architecture** - Scales efficiently, no polling overhead
- ✅ **Proven reliability** - Stable MQTT connection throughout extended testing

**Trade-offs Accepted:**
- ⚠️ 2-hour token expiration requires refresh logic (manageable)
- ⚠️ Custom BDDP/BUDP RPC format has learning curve (documented)

**Why Not Hue Remote:**
- ❌ Polling-only architecture with 15-30 second average latency
- ❌ Rapid state changes missed between polls
- ❌ Polling overhead grows with device count
- ✅ **Acceptable if:** Non-security use case, 30s latency tolerable, offline detection via `reachable` field sufficient

**Why Not Govee:**
- ❌ **CRITICAL BLOCKER:** No offline detection capability whatsoever
- ❌ Returns stale cached data indefinitely for offline devices
- ❌ Cannot monitor device connectivity status
- ❌ Lights don't support MQTT push events
- ❌ **Unsuitable for:** Security monitoring, alerting systems, connectivity tracking

**Production Decision:**

**For door sensor monitoring requiring:**
- Real-time alerts (security context)
- Offline/connectivity detection
- All event capture (no missed states)
- Scalable architecture

**→ Yosmart cloud API is the clear and only viable choice.**

Hue acceptable only for ambient monitoring where 30s delays tolerable. Govee eliminated due to fundamental inability to detect offline devices.
## Govee Remote API Setup

**Testing Third Cloud API:** Adding Govee Remote API to comparison for comprehensive evaluation of cloud-based sensor monitoring options.

**Simple API Key Authentication:**
1. Open Govee Home mobile app
2. Navigate to: Settings → Apply for API Key
3. Submit developer application (approval may take time)
4. Copy generated API key
5. Add to .env file: `GOVEE_API_KEY=your_api_key_here`

**MQTT Event Connection Parameters:**
- **Host:** mqtt.openapi.govee.com
- **Port:** 8883 (MQTTS - MQTT over TLS)
- **Username:** Your API key
- **Password:** Your API key (same as username)
- **Topic:** GA/{your_api_key}

**API Endpoints:**
- **Device Discovery:** GET https://openapi.api.govee.com/router/api/v1/user/devices
- **Rate Limit:** 10,000 requests/account/day

**Authentication Comparison:**
- **Yosmart:** OAuth client credentials (automated, 2hr tokens)
- **Hue Remote:** OAuth Authorization Code+PKCE (browser consent, 7-day tokens)
- **Govee:** Simple API key (no OAuth, long-lived, apply in app)
- **Simplicity:** Govee wins (single API key, no expiration, no refresh logic)

## Govee Remote API Findings

*Govee cloud API testing results (Phases 10-12):*

- **Authentication:** Simple API key obtained from Govee Home app. No OAuth complexity, no documented expiration. Clean header-based auth (`Govee-API-Key`). **Simplest of all three APIs tested.**
- **Device Discovery:** RESTful GET to `/router/api/v1/user/devices` endpoint. Response returns capability-based device model with detailed feature descriptions. Clean JSON array structure (vs Yosmart's RPC, similar to Hue REST). Tested successfully with 2 lights discovered (LED Strip M1 H61E1, Bulb H8015). Rate limit: 10,000 req/day documented.
- **API Design:** Standard REST patterns. Capability model provides rich metadata (device types, feature instances, parameters). More intuitive than Yosmart BDDP/BUDP, comparable to Hue REST design. Good developer experience.
- **MQTT Connection:** ✅ Successfully established MQTTS connection to mqtt.openapi.govee.com:8883. Stable broker, no connection drops. Topic pattern GA/{api_key} works correctly.
- **MQTT Events - Critical Limitation:** ❌ **Lights do NOT send push events via MQTT.** Only sensors with `devices.capabilities.event` send MQTT messages. Govee lights are control-only devices (can send commands, cannot receive events). Architecture similar to Hue: control via API, no real-time state push for lights.
- **REST Polling Alternative:** Implemented REST polling via POST `/router/api/v1/device/state` to query device status. Works for retrieving current state at user-defined intervals (tested at 5-second polling).
- **CRITICAL LIMITATION - No Offline Detection:** ❌ **Govee API returns stale cached state indefinitely for offline devices.** No `reachable`, `online`, `connected`, or similar connectivity field exists in API responses. When devices are unplugged or lose power, API continues returning last known state (e.g., `on: true, brightness: 254`) without indicating device is offline. **Production blocker for monitoring applications.**
- **Offline Detection Comparison Test:** Created comparative test against Hue Remote API to validate offline detection capability:
  - **Govee:** ❌ No connectivity status field, stale data returned forever
  - **Hue:** ✅ `reachable` field updates within polling interval (5-30s), accurately detects OFFLINE→ONLINE and ONLINE→OFFLINE transitions
  - **Yosmart:** ✅ MQTT disconnect events indicate offline status in real-time (milliseconds)
- **Rate Limits:** 10k requests/day limit constrains aggressive polling (every 8.6 seconds max if continuously polling). Must balance monitoring frequency with rate limit.
- **Production Viability Assessment:** ❌ **NOT RECOMMENDED for monitoring applications.** Cannot detect when devices go offline, making it unsuitable for alerting, security monitoring, or any scenario requiring connectivity status. Only suitable for simple control applications (turn lights on/off) where connectivity monitoring is not required.