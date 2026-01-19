# Door Sensor API Comparison – Implementation Plan

**Memory Strategy:** Dynamic-MD (directory structure with Markdown logs)
**Last Modification:** 2026-01-18 - Extended to include Govee Remote API comparison (Phases 10-13 added)
**Project Overview:** Comparative feasibility spike validating three door sensor API integration options: Yosmart/YoLink (cloud MQTT), Philips Hue Remote API (cloud polling), and Govee Remote API (cloud MQTT events). Tests authentication, device discovery, and real-time event detection with 60-second latency requirement. **Phases 1-5:** Yosmart validation COMPLETE (millisecond MQTT latency, PROCEED). **Phases 6-9:** Hue Remote API COMPLETE (30s polling latency). **Phases 10-13:** Govee Remote API testing.

---

## Phase 1: Project Setup & Environment Configuration

### Task 1.1 – Initialize Node.js project with package.json │ Agent_Setup
- **Objective:** Create foundational Node.js project structure with package.json configured for ES modules and spike dependencies (dotenv for environment variables, mqtt for real-time event monitoring).
- **Output:** Valid package.json file ready for npm install, specifying project metadata, ES module support, required dependencies, and Node.js version constraint.
- **Guidance:** Use minimal spike configuration - no build tools, test frameworks, or production dependencies. Keep package.json simple for feasibility testing focus.

**Subtasks:**
- Create package.json with project name "yosmart-spike", version "1.0.0", and type "module" for ES module support enabling top-level await and cleaner import syntax
- Add dependencies: "dotenv" (latest stable version) for .env file loading, "mqtt" (latest stable version) for MQTT client implementation
- Set engines field to "node": ">=20.x" to specify Node.js LTS version requirement, ensuring compatibility with modern JavaScript features

### Task 1.2 – Create .env template file │ Agent_Setup
- **Objective:** Provide .env.example template documenting required Yosmart API credentials that users must manually create in YoLink mobile app.
- **Output:** .env.example file with YOSMART_UAID and YOSMART_SECRET placeholders and clear inline comments explaining credential source, enabling users to quickly set up authentication.
- **Guidance:** Template serves as documentation for manual credential setup - actual .env file will be created by user copying .env.example and populated with real credentials from YoLink app.

**Subtasks:**
- Create .env.example file with YOSMART_UAID placeholder variable and inline comment: "# UAID from YoLink app > Account > Advanced Settings > Personal Access Credentials" to guide credential retrieval
- Add YOSMART_SECRET placeholder variable with inline comment: "# Secret Key from same UAC (User Access Credential) in YoLink app" to complete authentication credential template

### Task 1.3 – Create basic README.md structure │ Agent_Setup
- **Objective:** Establish README.md documentation scaffold with project description, setup instructions placeholder, and findings template to be populated during spike execution.
- **Output:** README.md file with three sections: project title and description explaining spike purpose, Setup section placeholder for later population with detailed instructions, and Findings section template with bullet points for token behavior, MQTT viability, rate limits, and kill-decision factors.
- **Guidance:** README serves dual purpose: setup reference for repeatability and findings documentation for go/no-go decision. Keep "notes to future self" informal tone per user preference.

**Subtasks:**
- Create README.md with h1 title "Yosmart API Feasibility Spike" and brief description paragraph explaining this validates Yosmart door sensor integration before full application development, focusing on OAuth flow, device discovery, and real-time event detection
- Add "## Setup" h2 section with placeholder text indicating UAC creation steps and script execution instructions will be added as spike progresses and actual workflow is validated
- Add "## Findings" h2 section template with bullet point placeholders: token expiration behavior, refresh token availability, MQTT vs polling comparison, rate limits observed, and API reliability assessment - to be filled during Phases 2-5 testing

---

## Phase 2: Authentication & Token Acquisition

### Task 2.1 – Implement auth.js with UAC token acquisition │ Agent_Auth
- **Objective:** Create auth.js script implementing OAuth 2.0 client_credentials flow against Yosmart API endpoint, obtaining access_token required for all subsequent API calls and persisting it to .env file for seamless workflow automation.
- **Output:** Functional auth.js script that loads UAC credentials from .env, executes token request to Yosmart OAuth endpoint, handles success/error responses, appends YOSMART_ACCESS_TOKEN to .env file, and logs completion timestamp - enabling one-command authentication for entire spike.
- **Guidance:** Use minimal error handling (log and crash per spike requirements) - no retry logic or sophisticated error recovery. Token written to .env eliminates manual copy-paste between scripts. Script validates credentials exist before attempting request to fail fast on configuration issues.

**Subtasks:**
1. **Environment Setup:** Load YOSMART_UAID and YOSMART_SECRET from .env file using dotenv.config(), validate both variables exist with truthy check, exit with clear error message if either missing to prevent confusing API errors downstream.
2. **OAuth Request Construction:** Construct OAuth 2.0 client_credentials token request as form-urlencoded POST to `https://api.yosmart.com/open/yolink/token` with body parameters: `grant_type=client_credentials`, `client_id=${UAID}`, `client_secret=${SECRET}` following Yosmart OAuth specification.
3. **HTTP Request Execution:** Send POST request with header `Content-Type: application/x-www-form-urlencoded` using native fetch or lightweight HTTP library, ensuring proper form encoding of credentials.
4. **Response Handling:** Parse JSON response body, check for HTTP and API-level errors, extract `access_token` field from successful response, log full error response and exit on failure (minimal error handling per spike approach).
5. **Token Persistence:** Append `YOSMART_ACCESS_TOKEN=<token_value>` to .env file using fs.appendFileSync to persist token for subsequent scripts, log success message with ISO timestamp confirming token acquisition and persistence.

### Task 2.2 – Test token validity and document expiration behavior │ Agent_Auth
- **Objective:** Validate auth.js successfully obtains working access_token by executing manual API test call, observe token response metadata for expiration information, and document token lifecycle behavior in README findings to inform production implementation decisions.
- **Output:** Confirmed working authentication flow with access_token persisted in .env, initial README.md Findings section populated with token lifespan details (if provided by API), refresh token availability assessment, and any observed expiration behavior.
- **Guidance:** Manual testing workflow (run script, test with curl/Postman) appropriate for spike - no automated tests needed. Focus on observing and documenting API behavior: does response include expires_in field, refresh_token, or other lifecycle metadata? This informs whether production app needs token refresh logic or can treat tokens as long-lived. Depends on: Task 2.1 Output.

**Subtasks:**
1. **Script Execution:** Run `node auth.js` from project root and verify successful execution with no errors, confirming access_token is appended to .env file without issues.
2. **Token Validation:** Test obtained access_token validity by making manual API call to Yosmart `Home.getGeneralInfo` endpoint using curl or Postman with `Authorization: Bearer <token>` header, confirming authentication succeeds and API returns valid response (not authentication error).
3. **Expiration Metadata Analysis:** Examine auth.js response body for token lifecycle fields: look for `expires_in` (seconds until expiration), `refresh_token` (for token renewal), or other expiration metadata in OAuth response JSON - this determines production token management strategy.
4. **Documentation:** Add findings to README.md "## Findings" section: document token lifespan if `expires_in` present (e.g., "Token expires after X seconds/hours/days"), note whether `refresh_token` provided for renewal, describe any expiration behavior observed during testing (e.g., "No expiration metadata - tokens appear long-lived").

---

## Phase 3: Device Discovery & Identification

### Task 3.1 – Implement device list fetch and door sensor identification │ Agent_Auth
- **Objective:** Create script calling Yosmart Home.getDeviceList API to retrieve all devices under authenticated account, filter response for door sensor device types, and output door sensor details (deviceId, token, name, type) needed for Phase 4 MQTT subscription and optional Phase 5 polling.
- **Output:** Working device list script that loads access_token from .env, constructs/sends BDDP (Basic Downlink Data Packet) request to Yosmart API, parses BUDP (Basic Uplink Data Packet) response for success, filters devices array for door sensor types, and outputs formatted console list of door sensors with deviceId, device token, name, and type for manual reference during testing.
- **Guidance:** Yosmart uses JSON RPC-style BDDP/BUDP packet format (not RESTful). BDDP requires `method` and `time` fields. BUDP response includes `code` field ("000000" = success) and `data` object. Door sensor device type names must be identified from API documentation or response observation - likely "DoorSensor" or similar type string. Script output provides device details for Phase 5 polling if needed. Depends on: Task 2.1 Output.

**Subtasks:**
1. **Authentication Loading:** Load YOSMART_ACCESS_TOKEN from .env file using dotenv, validate token exists (exit with error if missing), preparing Bearer token authentication for API request.
2. **BDDP Construction:** Construct Basic Downlink Data Packet as JSON object with required fields: `method: "Home.getDeviceList"` (API method to invoke), `time: <current_timestamp_milliseconds>` (current Unix timestamp in milliseconds per Yosmart protocol).
3. **API Request:** POST BDDP JSON to `https://api.yosmart.com/open/yolink/v2/api` endpoint with headers: `Authorization: Bearer ${token}` for authentication, `Content-Type: application/json` for JSON body encoding.
4. **BUDP Response Parsing:** Parse response as JSON (Basic Uplink Data Packet), check `code` field equals "000000" indicating success (log error and exit if non-success code), extract `data.devices` array containing device objects.
5. **Door Sensor Filtering:** Filter `devices` array for door sensor device types - check `type` field for door sensor identifier (consult Yosmart API docs or examine response for exact type string like "DoorSensor", "YS3604", etc.), output filtered devices with deviceId, token, name, and type fields formatted for readability.

### Task 3.2 – Retrieve home_id for MQTT topic construction │ Agent_Auth
- **Objective:** Call Yosmart Home.getGeneralInfo API to obtain home_id value required for constructing MQTT topic subscription pattern `yl-home/{home_id}/+/report` in Phase 4, persisting home_id to .env for listen.js automation.
- **Output:** Working home info script that constructs BDDP request for Home.getGeneralInfo, sends authenticated API call, extracts home_id from BUDP response data.id field, and appends YOSMART_HOME_ID to .env file for seamless Phase 4 MQTT setup.
- **Guidance:** Similar BDDP/BUDP pattern as Task 3.1 but simpler response structure (single id field vs. array filtering). Home_id is account-level identifier used in MQTT topic path. Writing to .env eliminates manual copy-paste for listen.js. Depends on: Task 2.1 Output.

**Subtasks:**
1. **BDDP Construction:** Construct Basic Downlink Data Packet JSON with `method: "Home.getGeneralInfo"` to retrieve account-level home information, `time: <current_timestamp_milliseconds>` for protocol compliance, using access_token from .env (loaded via dotenv).
2. **API Request:** POST BDDP to `https://api.yosmart.com/open/yolink/v2/api` with same authentication and content-type headers as Task 3.1 (`Authorization: Bearer ${token}`, `Content-Type: application/json`).
3. **Response Parsing:** Parse BUDP response JSON, validate `code` field equals "000000" success status, extract `data.id` field containing home_id string value.
4. **Home ID Persistence:** Append `YOSMART_HOME_ID=<home_id_value>` to .env file using fs.appendFileSync, making home_id available for Phase 4 listen.js MQTT topic construction without manual configuration.

### Task 3.3 – Test device API and document findings │ Agent_Auth
- **Objective:** Execute device list and home info scripts from Tasks 3.1 and 3.2 to validate end-to-end device discovery workflow, verify outputs match physical device setup, and document Yosmart device API characteristics in README for production planning.
- **Output:** Confirmed working device discovery with console output showing expected door sensors matching actual hardware (names and locations validated), home_id successfully retrieved and persisted to .env, README Findings section updated with device API observations: response structure notes, rate limit headers if present, available device metadata fields (firmware version, signal strength, battery level, etc.).
- **Guidance:** Manual validation appropriate for spike - run scripts, visually confirm outputs, note any API quirks or useful metadata. Device name/location matching confirms correct account and device pairing. Rate limit observation informs production API usage patterns. Metadata availability affects monitoring and diagnostic capabilities in full application. Depends on: Task 3.1 Output, Task 3.2 Output.

**Subtasks:**
1. **Device List Validation:** Run device list script from Task 3.1, review console output showing door sensors, cross-reference device names and types with physical door sensors in YoLink app/hardware setup to confirm correct device identification and account access.
2. **Home ID Validation:** Run home info script from Task 3.2, verify home_id value is output to console and successfully appended to .env file (check .env contents), confirming MQTT topic construction prerequisites are met.
3. **API Characteristics Documentation:** Document in README.md Findings section: Yosmart device API response structure observations (BDDP/BUDP format, field naming conventions), any HTTP rate limit headers observed in responses (X-RateLimit-*, Retry-After, etc.), device metadata fields available in response (version, signal strength, battery status, lastSeen timestamp, etc.) - informing production monitoring and diagnostic capabilities.

---

## Phase 4: MQTT Event Monitoring

### Task 4.1 – Implement listen.js with MQTT client setup and connection │ Agent_Events
- **Objective:** Create listen.js script establishing persistent MQTT connection to Yosmart broker using mqtt package, authenticating with access_token, subscribing to device event topic with wildcard pattern for all home devices, and handling connection lifecycle events (connect, error, disconnect) to validate real-time event infrastructure.
- **Output:** Functional long-running MQTT client script that loads credentials from .env (access_token and home_id), connects to mqtt://mqtt.api.yosmart.com:8003 using token-as-username authentication, subscribes to topic `yl-home/${home_id}/+/report` for all device events, logs connection success with timestamp, and exits on errors (minimal error handling per spike requirements).
- **Guidance:** MQTT authentication uses access_token as username (no password) per Yosmart specification. Topic wildcard `+` matches any device under home. Connection must stay alive for event receipt. Ad-hoc delegation note: If Yosmart MQTT documentation is unclear or contradictory during implementation, use .claude/commands/apm-7-delegate-research.md to verify topic structure and authentication format. Depends on: Task 2.1 Output by Agent_Auth, Task 3.2 Output by Agent_Auth.

**Subtasks:**
1. **Ad-Hoc Delegation:** If MQTT topic structure or authentication format in Yosmart documentation appears unclear, contradictory, or insufficient during implementation, delegate research to verify correct broker configuration, topic pattern syntax, and authentication mechanism before proceeding with implementation.
2. **Environment Loading:** Load YOSMART_ACCESS_TOKEN and YOSMART_HOME_ID from .env file using dotenv.config(), validate both variables exist (exit with clear error if either missing), preparing credentials for MQTT connection and topic construction.
3. **MQTT Client Creation:** Import mqtt package, create client instance with connection configuration object: `{ host: 'mqtt.api.yosmart.com', port: 8003, protocol: 'mqtt', username: <access_token_value>, password: undefined }` - token serves as username per Yosmart MQTT auth pattern.
4. **Connection Establishment:** Call client.connect() or equivalent (mqtt package API), register 'connect' event handler that logs successful connection message with ISO timestamp format (e.g., "[2026-01-18T14:32:07Z] Connected to Yosmart MQTT broker") for visibility.
5. **Topic Subscription:** In connect event handler after successful connection, subscribe to topic `yl-home/${home_id}/+/report` where `+` wildcard matches all devices under specified home_id, enabling receipt of door sensor state change events and any other device reports.
6. **Error Handling:** Register 'error' and 'close' event handlers on MQTT client - log error details or disconnection message with context, then call process.exit(1) to terminate script (minimal error handling approach per spike requirements - fail fast for troubleshooting).

### Task 4.2 – Implement door sensor event parsing and console logging │ Agent_Events
- **Objective:** Add MQTT message event handler to listen.js that receives incoming device events, parses BUDP-format JSON payloads, filters for door sensor events specifically, extracts open/closed state information, and outputs formatted timestamped console logs enabling visual latency verification and event detection validation.
- **Output:** Enhanced listen.js with 'message' event handler that processes MQTT payloads, identifies door sensor device types from event data, extracts state field (open/closed/alert status), and logs formatted output: `[${ISO_timestamp}] Door sensor "${device_name}" → ${STATE}` (e.g., "[2026-01-18T14:32:07Z] Door sensor "Front Door" → OPEN") - providing clear, timestamped event visibility for manual latency testing.
- **Guidance:** MQTT message payloads from Yosmart likely follow BUDP (Basic Uplink Data Packet) JSON structure with device type, state, and metadata fields. Exact payload schema must be determined from API documentation or initial message observation. Device filtering uses type field (same door sensor types from Task 3.1). State field name and values (open/closed or numeric codes) require documentation reference or testing observation. Timestamp format matches user's requested ISO format for manual latency comparison. Depends on: Task 4.1 Output.

**Subtasks:**
1. **Message Handler Registration:** Add MQTT client 'message' event listener that receives two parameters: `topic` (string - specific device topic that triggered) and `payload` (buffer - raw message data), enabling processing of all subscribed device events.
2. **Payload Parsing:** Convert payload buffer to string, parse as JSON to extract BUDP message structure - consult Yosmart documentation for exact event message format, likely includes fields: method/event type, device type, device state object, timestamp, device identifiers (deviceId, name).
3. **Door Sensor Filtering:** Check parsed message for device type field matching door sensor types identified in Task 3.1 (e.g., type === "DoorSensor" or equivalent), skip processing non-door-sensor events to focus logging on relevant spike validation events.
4. **State Extraction and Logging:** Extract open/closed state from message state object (field name and value format per Yosmart BUDP event documentation - likely `state: "open"/"closed"` or numeric codes), format console output using template: `[${new Date().toISOString()}] Door sensor "${device_name_from_message}" → ${STATE_UPPERCASE}` for clear timestamped event visibility.

### Task 4.3 – Test event detection latency and document MQTT findings │ Agent_Events
- **Objective:** Execute listen.js to establish MQTT connection, physically trigger door sensors (open/close doors) while monitoring console output, measure event detection latency by comparing console timestamps to physical actions, assess reliability over multiple trigger events, and document comprehensive MQTT viability findings in README for kill-decision assessment.
- **Output:** Validated real-time event detection capability with observed latency measurements, confirmed MQTT connection reliability, README Findings section comprehensively updated with: MQTT connection success/failure status, average event latency observed (seconds from physical trigger to console log), whether 60-second requirement met, connection drop frequency if any, missed event counts, and overall MQTT viability recommendation for production use (primary approach vs. needs polling fallback).
- **Guidance:** Manual testing workflow matches spike validation approach - run script, physically interact with door sensors, observe console in real-time. Latency assessment is subjective (note "instant", "2-3 seconds", "10+ seconds") unless precise timing needed. Reliability testing requires multiple trigger events over several minutes to detect connection stability issues or missed events. This phase delivers primary kill-decision data point: if MQTT latency exceeds 60 seconds or reliability is poor, API may not be viable for real-time use case. Depends on: Task 4.2 Output.

**Subtasks:**
1. **Script Execution:** Run `node listen.js` from project root, verify MQTT connection succeeds with console log confirmation, keep script running in foreground for event monitoring during physical testing.
2. **Physical Testing:** Physically trigger door sensors multiple times (open and close doors, test multiple sensors if available), verify console logs appear for each state change event, confirm device names and states match physical actions taken.
3. **Latency Measurement:** Compare console log timestamps (ISO format) to approximate time when physical door trigger occurred (mental note or wall clock reference), assess whether events detected within 60-second requirement - note observed latency patterns (e.g., "consistently under 3 seconds", "10-15 second delay", "exceeded 60 seconds on some events").
4. **Reliability Testing:** Continue triggering door events over 5-10 minute period, monitor for MQTT connection drops (error logs or lost connectivity), count any missed events (physical triggers without corresponding console logs), assess overall connection stability for production viability.
5. **Comprehensive Documentation:** Update README.md Findings section with MQTT assessment: connection reliability status (stable/intermittent drops), average latency observed with specific examples, whether 60-second requirement consistently met, any missed event counts or patterns, connection drop frequency if applicable, overall MQTT viability recommendation (e.g., "MQTT reliable - use as primary", "Latency acceptable but connection unstable - needs reconnect logic", "Exceeded latency requirement - polling required").

---

## Phase 5: Fallback & Final Documentation

### Task 5.1 – Implement polling fallback (conditional - only if MQTT unreliable) │ Agent_Events
- **Objective:** [CONDITIONAL TASK - Implement only if Phase 4 MQTT proves unreliable or exceeds latency requirements] Create poll.js script implementing 30-second interval HTTP polling alternative for door sensor state monitoring, using Yosmart device state API to repeatedly query sensor status, detect state changes via comparison logic, and log events in same format as MQTT for direct comparison testing.
- **Output:** [If implemented] Functional poll.js script that loads access_token from .env, accepts deviceId and device token as command-line arguments (from Phase 3 device list output), establishes 30-second setInterval loop calling device state API, tracks previous state to detect open/closed transitions, logs only state changes (not every poll) using matching timestamp format: `[${ISO_timestamp}] Door sensor "${device_name}" → ${STATE}` - enabling latency and resource comparison against MQTT approach.
- **Guidance:** This task is optional fallback - skip if Phase 4 MQTT meets requirements. Polling implementation provides comparison data point: latency (polling interval delay vs. MQTT real-time), resource usage (continuous API calls vs. persistent MQTT connection), reliability trade-offs. Device state API method requires documentation lookup (likely `DoorSensor.getState` or similar per device type). State comparison logic prevents logging unchanged polls (only transitions matter). Command-line args for deviceId/token allow testing specific door sensor. Depends on: Task 3.1 Output by Agent_Auth.

**Subtasks:**
1. **Credential and Device Setup:** Load YOSMART_ACCESS_TOKEN from .env using dotenv, parse command-line arguments for deviceId and device token values (obtained from Task 3.1 device list script output), validate all required values exist before proceeding.
2. **Device State Fetch Implementation:** Implement async function that constructs BDDP packet for device state query (method likely `DoorSensor.getState` or type-specific equivalent - consult Yosmart API docs), includes `targetDevice: <deviceId>` and `token: <device_token>` fields per Yosmart device control pattern, POST to `https://api.yosmart.com/open/yolink/v2/api` with Bearer auth, parse BUDP response for current state.
3. **Polling Loop Setup:** Use setInterval with 30000ms (30 second) interval to repeatedly call state fetch function, maintaining persistent polling execution for continuous monitoring - this interval balances latency detection (reasonable frequency) with API rate limit concerns (not excessive request volume).
4. **State Change Detection:** Track previous state in variable outside interval function (persists across polls), compare current polled state to previous state each iteration, update previous state variable when change detected, skip logging when state unchanged (avoids console spam with redundant "still open" messages).
5. **Change Logging:** When state transition detected (open→closed or closed→open), log event using identical timestamp format as MQTT implementation: `[${new Date().toISOString()}] Door sensor "${device_name}" → ${NEW_STATE_UPPERCASE}` - enables direct latency comparison between polling (up to 30-second delay) and MQTT (real-time) approaches for kill-decision assessment.

### Task 5.2 – Finalize README with complete findings and kill-decision assessment │ Agent_Events
- **Objective:** Consolidate all testing observations from Phases 2-5 into comprehensive README Findings section, synthesize token behavior, device API characteristics, MQTT performance data, and optional polling comparison into coherent documentation, and provide kill-decision assessment framework with API viability recommendation based on measured latency, reliability, and rate limit observations.
- **Output:** Complete README.md with fully populated Findings section documenting: token lifecycle behavior (expiration, refresh availability), device API response structure and metadata, MQTT connection reliability and latency measurements, polling comparison if implemented (latency vs. MQTT, resource trade-offs), any rate limit constraints observed, notable API quirks or limitations discovered, and Kill Decision Assessment section with go/no-go recommendation based on whether API meets feasibility requirements (real-time event detection within 60 seconds, acceptable reliability, manageable rate limits).
- **Guidance:** Documentation should be "notes to future self" informal tone per user preference - not formal technical documentation. Synthesis focuses on kill-decision factors: does API support required functionality with acceptable performance? Comparison data (MQTT vs. polling if both tested) informs architecture decision for full application. Rate limit observations affect production scalability planning. Recommendation should be clear: "Proceed with Yosmart API" or "Pivot to alternative platform" with specific reasoning from testing findings. Depends on: all previous phase testing outputs by Agent_Auth and Agent_Events.

**Subtasks:**
1. **Token Behavior Consolidation:** Compile Phase 2 findings into README Findings section: document observed token expiration behavior (if expires_in field present, note duration; if absent, note tokens appear long-lived), confirm whether refresh_token provided (affects production token management strategy), summarize any token lifecycle quirks or manual re-authentication requirements observed during testing.
2. **Device API Documentation:** Consolidate Phase 3 observations: document Yosmart device API BDDP/BUDP format observations (any unusual patterns or field naming conventions), list useful device metadata fields available (firmware version, signal strength, battery status - affects production monitoring capabilities), note any rate limit headers or throttling behavior observed during device list calls (impacts production API usage patterns).
3. **MQTT Performance Analysis:** Compile Phase 4 MQTT testing results: document connection reliability assessment (stable/unstable, any drop patterns), specify average event latency observed with examples ("typically 2-3 seconds", "ranged 5-15 seconds"), clearly state whether 60-second requirement consistently met, note any missed events or connection issues, summarize overall MQTT viability (recommended for production, needs enhancements, or insufficient for requirements).
4. **Polling Comparison (if implemented):** If Task 5.1 polling fallback was implemented, add comparison analysis: contrast polling latency (up to 30-second delay) against MQTT real-time performance, discuss resource usage differences (continuous API calls vs. persistent connection), note reliability trade-offs (polling more predictable but delayed vs. MQTT real-time but connection-dependent), provide recommendation on primary approach based on testing observations.
5. **Kill Decision Assessment:** Add dedicated "## Kill Decision Assessment" section to README: summarize critical API restrictions discovered (latency issues, rate limits, reliability problems, missing features), evaluate whether observed API behavior supports required real-time door sensor monitoring use case with 60-second latency requirement, provide clear go/no-go recommendation ("Proceed: MQTT viable for real-time events" or "Pivot: API latency/reliability insufficient") with specific reasoning tied to testing findings - enabling informed decision on full application development investment.

---

## Phase 6: Hue Remote API Setup & OAuth Configuration

**NOTE:** Phase 6-9 use Hue Remote API (cloud-based) not local bridge - proper cloud-to-cloud comparison with Yosmart. Hue Remote API documentation: https://developers.meethue.com/develop/hue-api/remote-api-quick-start-guide/

### Task 6.1 – Register Hue developer app and document OAuth setup │ Agent_Setup  
- **Objective:** Create Hue developer account, register application in Hue developer portal to obtain Client ID and Client Secret, update .env.example template with Hue OAuth credentials, and document manual OAuth flow steps for obtaining access tokens via Hue Remote API.
- **Output:** Hue developer app registered with Client ID and Client Secret obtained, .env.example updated with HUE_CLIENT_ID and HUE_CLIENT_SECRET placeholders, README documentation added explaining Hue Remote API OAuth flow (authorization code grant with PKCE), noting this is cloud-to-cloud pattern matching Yosmart's approach for fair comparison.
- **Guidance:** Hue Remote API uses OAuth 2.0 Authorization Code with PKCE (similar pattern to Yosmart UAC but with user consent flow). Unlike Yosmart's client_credentials, Hue requires user authorization via browser redirect. App registration at https://developers.meethue.com/. Document that this task is manual setup (no script), preparing credentials for Task 6.2 automated token acquisition. Cloud API eliminates local bridge dependency, enabling remote monitoring like Yosmart.

**Subtasks:**
- Guide User through Hue developer account creation and app registration at https://developers.meethue.com/, obtaining Client ID and Client Secret
- Update .env.example with HUE_CLIENT_ID and HUE_CLIENT_SECRET placeholders with inline comments explaining Hue developer portal source
- Document README setup section with Hue OAuth overview: authorization code with PKCE flow, callback URL requirements, scope needed for sensor access
- Note architectural difference from Phases 1-5: cloud-based remote API vs Yosmart cloud API (both internet-dependent, good for comparison)

### Task 6.2 – Implement Hue OAuth token acquisition with PKCE │ Agent_Auth
- **Objective:** Create hue-auth.js implementing OAuth 2.0 Authorization Code flow with PKCE to obtain Hue Remote API access tokens, handling browser-based user authorization and token exchange, persisting access_token and refresh_token to .env for subsequent remote API calls.
- **Output:** Functional hue-auth.js that generates PKCE code challenge, constructs authorization URL for user consent, handles callback with authorization code, exchanges code for access_token/refresh_token via Hue token endpoint, appends HUE_ACCESS_TOKEN and HUE_REFRESH_TOKEN to .env, and logs completion - establishing cloud API credentials comparable to Yosmart's OAuth pattern.
- **Guidance:** Hue Remote API OAuth differs from Yosmart: authorization code (user consent) vs client_credentials (app-only). Requires callback URL handling - use localhost callback or manual code paste for spike simplicity. PKCE adds security layer. Token endpoint: https://api.meethue.com/oauth2/token. Access tokens likely short-lived with refresh capability (similar lifecycle to Yosmart). Depends on: Task 6.1 Output.

**Subtasks:**
1. **Environment Setup:** Load HUE_CLIENT_ID and HUE_CLIENT_SECRET from .env, validate both exist, generate PKCE code verifier and code challenge (SHA256 hash, base64url encoded) for secure authorization flow.
2. **Authorization URL Construction:** Build authorization URL: https://api.meethue.com/oauth2/authorize with parameters: client_id, response_type=code, redirect_uri (localhost or manual), code_challenge, code_challenge_method=S256, scope (sensor access permissions).
3. **User Authorization:** Display authorization URL, instruct User to open in browser for Hue account login and app consent, handle callback to capture authorization code (localhost server or manual paste).
4. **Token Exchange:** POST to https://api.meethue.com/oauth2/token with: authorization code, code_verifier (PKCE), client_id, client_secret, grant_type=authorization_code, redirect_uri, parse response for access_token and refresh_token.
5. **Token Persistence:** Append HUE_ACCESS_TOKEN and HUE_REFRESH_TOKEN to .env using fs.appendFileSync, log success with ISO timestamp and token metadata (expires_in if present), enabling remote API access for Phases 7-9.

### Task 6.3 – Update README with Hue Remote API setup and findings template │ Agent_Setup
- **Objective:** Extend README with Hue Remote API setup section documenting OAuth flow and create comparative findings template for Hue cloud API observations, enabling side-by-side comparison with Yosmart cloud API findings from Phases 1-5.
- **Output:** README updated with "## Hue Remote API Setup" section explaining developer app registration and OAuth token acquisition steps, plus "### Hue Remote API Findings" subsection with bullet point placeholders for OAuth pattern, token lifecycle, device API characteristics, event monitoring performance - mirroring Yosmart findings structure for easy comparison.
- **Guidance:** Maintain informal tone. Emphasize cloud-to-cloud comparison (both APIs internet-dependent, no local hardware). Setup section references Task 6.1 manual registration and Task 6.2 hue-auth.js OAuth script. Findings template prepares for documenting: OAuth complexity vs Yosmart UAC, token expiration patterns, remote API latency vs local options, overall cloud API viability.

**Subtasks:**
- Add "## Hue Remote API Setup" section documenting app registration process, OAuth flow with PKCE, and hue-auth.js usage for token acquisition  
- Expand Findings with "### Hue Remote API Findings" containing placeholders: OAuth pattern (authorization code vs client_credentials), token lifecycle (expiration, refresh), device discovery observations TBD, remote event monitoring TBD
- Add "### Cloud API Comparison" placeholder noting comparative analysis will follow after both cloud APIs tested (Yosmart vs Hue Remote)

---

## Phase 7: Hue Remote Device Discovery

### Task 7.1 – Implement Hue Remote API device list and contact sensor identification │ Agent_Auth
- **Objective:** Create hue-devices.js calling Hue Remote API to retrieve user's devices via cloud endpoint, filter for contact/motion sensors (Hue sensor types), output sensor details needed for Phase 8 event monitoring, comparing remote API device discovery pattern against Yosmart's cloud device API from Phase 3.
- **Output:** Functional hue-devices.js loading HUE_ACCESS_TOKEN from .env, querying Hue Remote API devices endpoint (https://api.meethue.com/route/api/{username}/sensors or equivalent remote endpoint), parsing response for contact/motion sensor types, outputting formatted list with sensor IDs, names, types, and current states for comparison with Yosmart's 4 door sensors.
- **Guidance:** Hue Remote API uses different endpoints than local bridge API - research current remote API documentation for correct device/sensor endpoints (may require username/whitelist ID from OAuth response). Sensor types in Hue: "ZLLPresence" (motion), "ZLLLightLevel", potential contact sensor types. Remote API may have different data structure than local bridge /clip/v2/resource pattern. Document API responsiveness (cloud roundtrip latency vs Yosmart cloud API). Depends on: Task 6.2 Output.

**Subtasks:**
1. **Authentication Loading:** Load HUE_ACCESS_TOKEN from .env, validate exists, prepare Authorization Bearer header for remote API requests to https://api.meethue.com endpoints.
2. **Remote API Device Query:** Research Hue Remote API documentation for correct devices/sensors endpoint, construct GET request with Bearer token auth, handle any additional authentication requirements (whitelist username, bridge selection if multi-bridge account).
3. **Sensor Type Filtering:** Parse response JSON, identify Hue sensor type fields for contact/motion sensors (consult Hue docs for exact type strings), filter for door/window relevant sensors, extract sensor metadata.
4. **State Retrieval:** Extract current sensor states from response (presence, contact status), note state format and field structure for Phase 8 event correlation.
5. **Formatted Output:** Display sensor list with IDs, names, types, states in readable format, compare sensor count and metadata richness vs Yosmart device API, note any remote API limitations vs local bridge capabilities.

### Task 7.2 – Test Hue Remote device API and document findings │ Agent_Auth
- **Objective:** Execute hue-devices.js to validate remote cloud device discovery, verify sensors match User's physical Hue hardware, document Hue Remote API characteristics comparing cloud-to-cloud patterns with Yosmart device API observations from Phase 3.
- **Output:** Validated device discovery with sensors confirmed against physical setup, README updated with Hue Remote API device observations: endpoint structure, response format, available metadata, cloud API latency vs Yosmart, any rate limiting or authentication complexities encountered.
- **Guidance:** Manual validation matching Phase 3 pattern. Key comparison: both cloud APIs but different architectures (Hue OAuth user-centric vs Yosmart UAC device-centric). Document response speed, data richness, API ergonomics. Depends on: Task 7.1 Output.

**Subtasks:**
1. **Device List Validation:** Run hue-devices.js, verify sensor output matches User's physical Hue sensors, confirm cloud API access working correctly.
2. **API Characteristics Documentation:** Update README with Hue Remote API observations: endpoint patterns, authentication headers, response structure vs Yosmart BDDP/BUDP, metadata availability, cloud API responsiveness.
3. **Comparative Notes:** Document cloud-to-cloud comparison points: Hue OAuth complexity vs Yosmart UAC simplicity, remote API latency observations, rate limiting if any, overall developer experience vs Yosmart device API.

---

## Phase 8: Hue Remote Event Monitoring

### Task 8.1 – Research Hue Remote API event/polling options and implement monitoring │ Agent_Events
- **Objective:** Research Hue Remote API capabilities for real-time sensor event monitoring or efficient polling, implement hue-listen.js using best available approach (webhooks, SSE if available, or optimized polling), establishing event detection mechanism comparable to Yosmart MQTT for latency testing.
- **Output:** Functional hue-listen.js implementing optimal event monitoring strategy available via Hue Remote API - whether push notifications, webhook subscriptions, or polling loop - loading credentials from .env, monitoring for contact/motion sensor state changes, logging events with ISO timestamps matching Phase 4 format for latency comparison.
- **Guidance:** CRITICAL RESEARCH TASK: Hue Remote API event capabilities may differ significantly from local bridge EventStream. Remote API might offer: webhooks/callbacks, long-polling, or require standard polling. This fundamentally impacts latency comparison vs Yosmart MQTT. If only polling available, implement 30-second interval matching Phase 5 consideration. If push/webhook available, implement for fair real-time comparison. Document what's possible via remote API vs local limitations. Depends on: Task 6.2 Output by Agent_Auth.

**Subtasks:**
1. **Cross-Agent Integration:** Read .env for HUE_ACCESS_TOKEN, review hue-auth.js OAuth pattern, understand cloud API authentication requirements.
2. **Event Capability Research:** Research Hue Remote API documentation for sensor event monitoring options: webhooks, SSE, WebSocket, or polling-only. Document findings on what's available via cloud API.
3. **Implementation Strategy Selection:** Based on research, implement best available approach: if push/webhook available use for real-time comparison, if polling-only implement 30-second interval with state change detection.
4. **Event Detection Implementation:** Monitor for sensor state changes (contact open/close, motion detected), parse event/state data, extract sensor identification and new state values.
5. **Formatted Logging:** Output events matching Phase 4 format: `[${ISO_timestamp}] ${sensor_type} "${sensor_name}" → ${STATE}` enabling direct latency comparison with Yosmart MQTT performance.

### Task 8.2 – Test Hue Remote event latency and document findings │ Agent_Events  
- **Objective:** Execute hue-listen.js to test event detection via Hue Remote API, measure latency through physical sensor triggers, assess reliability, document comprehensive findings comparing Hue Remote cloud API event capabilities against Yosmart MQTT cloud performance from Phase 4.
- **Output:** Validated event monitoring with latency measurements, connection/polling reliability assessment, README updated with Hue Remote API event findings: monitoring approach used (push vs polling), observed latency with examples, 60-second requirement assessment, cloud API event viability vs Yosmart MQTT comparison.
- **Guidance:** Testing mirrors Phase 4 but expectations differ based on Task 8.1 implementation. If polling-only, latency will be 30+ seconds (polling interval) vs Yosmart's milliseconds - document this limitation. If push/webhook available, compare real-time performance. Key finding: does Hue Remote API match Yosmart real-time capability or require polling compromise? This drives final recommendation. Depends on: Task 8.1 Output.

**Subtasks:**
1. **Script Execution:** Run hue-listen.js, verify monitoring active (push connection or polling loop), keep running for physical testing.
2. **Physical Testing:** Trigger Hue sensors multiple times, verify console logs appear, note any delays between physical action and log appearance.
3. **Latency Measurement:** Compare timestamps to physical triggers, assess vs 60-second requirement, document whether latency matches Yosmart performance or shows polling delays.
4. **Reliability Assessment:** Monitor over 5-10 minutes, note any missed events, connection issues if push-based, or polling consistency.
5. **Comprehensive Documentation:** Update README with Hue Remote findings: event monitoring approach (push vs poll), latency measurements, 60-second requirement met or not, comparison with Yosmart MQTT millisecond performance, remote API event viability assessment.

---

## Phase 9: Comparative Analysis & Final Recommendation

### Task 9.1 – Create cloud API comparative analysis and final recommendation │ Agent_Events
- **Objective:** Synthesize findings from both cloud APIs (Yosmart and Hue Remote) into comprehensive comparative analysis, evaluating OAuth patterns, device discovery, event monitoring capabilities, delivering clear recommendation on which cloud API to use for door sensor monitoring application based on measured performance, developer experience, and architectural trade-offs.
- **Output:** README with "## Cloud API Comparison & Recommendation" section providing side-by-side analysis across authentication (UAC vs OAuth PKCE), device APIs (BDDP/BUDP vs REST), event monitoring (MQTT vs Hue approach), latency performance, implementation complexity, and clear final recommendation with reasoning - completing comparative feasibility spike.
- **Guidance:** Synthesize all phases. Compare: OAuth complexity (Yosmart UAC simple vs Hue authorization code complex), event latency (Yosmart MQTT milliseconds vs Hue Remote approach - critical differentiator), API architectures, developer ergonomics. Recommendation should weigh real-time performance heavily given 60-second requirement. If Hue Remote requires polling (30+ second latency), Yosmart likely winner. If both offer real-time, compare complexity vs performance trade-offs. Depends on: Phase 4 Task 4.3 (Yosmart), Phase 8 Task 8.2 (Hue Remote).

**Subtasks:**
1. **Authentication Comparison:** Compare Yosmart UAC (simple client_credentials, 2-hour tokens) vs Hue OAuth (authorization code with PKCE, user consent, browser flow), assess setup complexity and security patterns.
2. **Event Monitoring Comparison:** CRITICAL COMPARISON: Yosmart MQTT (millisecond latency, 100% reliability) vs Hue Remote approach (push if available or polling delay), document latency measurements side-by-side, evaluate which meets 60-second requirement better.
3. **Device API Comparison:** Contrast BDDP/BUDP (Yosmart) vs REST (Hue), cloud API response times, metadata availability, developer experience differences.
4. **Implementation Complexity:** Compare overall development friction: authentication flows, error handling patterns, documentation quality, debugging ease observed during spike.
5. **Final Recommendation:** Synthesize into clear decision: state recommended API with specific reasoning (likely "Recommend Yosmart: millisecond MQTT vastly superior to Hue Remote polling/latency" OR "Recommend Hue: comparable real-time performance with benefits X/Y" if push available), document decision rationale for production implementation.

### Task 7.1 – Implement Hue device list fetch and contact sensor identification │ Agent_Auth
- **Objective:** Create hue-devices.js script calling Hue API v2 resource endpoint to retrieve all devices, filter response for contact sensors (door/window sensors in Hue ecosystem), and output sensor details (id, name, type, services) needed for Phase 9 EventStream filtering.
- **Output:** Functional hue-devices.js that loads HUE_BRIDGE_IP and HUE_API_KEY from .env, constructs GET request to bridge's /clip/v2/resource endpoint (Hue v2 RESTful pattern), parses response JSON for device objects with type "contact" or service type "contact", filters for contact sensors, and outputs formatted console list showing: device ID, name, service IDs (for event correlation), and current state - providing door sensor inventory for comparison with Yosmart's 4 sensors.
- **Guidance:** Hue API v2 uses RESTful pattern with /clip/v2/resource endpoints (vastly different from Yosmart's BDDP/BUDP JSON-RPC). Resources include devices, services, and grouped_lights - contact sensors appear as device type "contact" or have associated "contact" service. Device objects reference services by ID - services contain actual state data. Response structure more nested than Yosmart. May need to query /clip/v2/resource/device and /clip/v2/resource/contact separately to correlate. Depends on: Task 6.2 Output.

**Subtasks:**
1. **Authentication Loading:** Load HUE_BRIDGE_IP and HUE_API_KEY from .env using dotenv, validate both exist, exit with error if missing, prepare local bridge endpoint URL and authentication header for API calls.
2. **Device Resource Query:** Construct GET request to http://<bridge-ip>/clip/v2/resource/device endpoint with header "hue-application-key: <api_key>" (Hue v2 auth pattern), send request to retrieve all devices on bridge.
3. **Contact Sensor Filtering:** Parse response JSON data array, filter device objects for type field matching "contact" or similar contact sensor identifier (consult Hue v2 docs for exact device type strings), extract device metadata including services array (references service IDs providing state data).
4. **Service State Correlation:** For each contact sensor device, query associated contact service endpoint /clip/v2/resource/contact/<service_id> to retrieve current state (contact_report with state: "contact"/"no_contact"), correlate service state with parent device for complete sensor picture.
5. **Formatted Output:** Output console list showing each contact sensor with: device ID, device name, service ID(s), current contact state, device type - structured for manual reference during Phase 9 event testing, comparing sensor count and metadata richness against Yosmart's device API.

### Task 7.2 – Test Hue device API and document findings │ Agent_Auth
- **Objective:** Execute hue-devices.js to validate device discovery workflow, verify outputs match physical Hue contact sensors in user's setup, and document Hue device API characteristics in README for comparison with Yosmart's device API patterns observed in Phase 3.
- **Output:** Confirmed working Hue device discovery with console output showing expected contact sensors matching actual hardware, README "Hue API Findings" section updated with device API observations: RESTful vs JSON-RPC comparison, resource/service architecture notes, available sensor metadata fields, and any rate limiting or local bridge performance characteristics observed during testing.
- **Guidance:** Manual validation workflow matching Phase 3 Task 3.3 pattern - run script, verify outputs, document observations. Key comparison points: RESTful architecture vs BDDP/BUDP, resource/service separation vs flat device objects, local bridge response speed vs cloud API latency, metadata richness (firmware, battery, connectivity). Depends on: Task 7.1 Output.

**Subtasks:**
1. **Device List Validation:** Run `node hue-devices.js` from workspace root, review console output showing contact sensors, cross-reference device names with User's physical Hue contact sensors to confirm correct identification and bridge access.
2. **API Characteristics Documentation:** Update README "Hue API Findings" section with device API observations: note RESTful /clip/v2/resource pattern vs Yosmart BDDP/BUDP, describe resource/service architecture and ID correlation pattern, document available metadata fields (battery, connectivity, tamper, temperature if multi-sensor), compare response structure complexity vs Yosmart's simpler device objects.
3. **Performance Notes:** Document local bridge API response characteristics: latency of device queries (local network speed vs Yosmart cloud roundtrip), any rate limiting observed (local bridge typically more permissive than cloud APIs), overall API responsiveness for comparison with Yosmart's device discovery performance from Phase 3.

---

## Phase 8: Hue EventStream Real-Time Monitoring

### Task 8.1 – Implement hue-listen.js with EventStream (SSE) client setup │ Agent_Events
- **Objective:** Create hue-listen.js script establishing Server-Sent Events (SSE) connection to Hue Bridge EventStream endpoint for real-time device updates, subscribing to all events and handling connection lifecycle, validating Hue's push notification infrastructure distinct from Yosmart's MQTT pattern.
- **Output:** Functional long-running hue-listen.js that loads credentials from .env, creates EventSource client connecting to http://<bridge-ip>/eventstream/clip/v2 with hue-application-key authentication, registers event handlers (onopen, onmessage, onerror), logs connection success with timestamp, and remains running to receive real-time contact sensor events - establishing EventStream foundation for latency testing in Task 8.2.
- **Guidance:** Hue EventStream uses Server-Sent Events (SSE/EventSource) not MQTT - fundamentally different real-time protocol. EventSource is HTTP-based unidirectional push (server → client), simpler than MQTT bidirectional messaging. Use eventsource npm package for Node.js SSE client. EventStream endpoint provides all bridge events (lights, sensors, buttons) - filtering happens in message handler. Connection stays open for continuous push updates. Depends on: Task 6.2 Output by Agent_Auth.

**Subtasks:**
1. **Cross-Agent Integration Steps:** Read .env for HUE_BRIDGE_IP and HUE_API_KEY (from Task 6.2 by Agent_Auth), review hue-auth.js to understand API key format and authentication pattern, validate understanding of local bridge communication model vs Yosmart cloud MQTT.
2. **Environment Loading:** Import dotenv and eventsource package, load HUE_BRIDGE_IP and HUE_API_KEY from .env, validate both credentials exist with clear error messages indicating how to obtain (run hue-auth.js) if missing.
3. **EventSource Client Creation:** Construct EventStream endpoint URL: http://<bridge-ip>/eventstream/clip/v2, create EventSource instance with URL and headers object containing "hue-application-key: <api_key>" for authentication, EventSource handles connection management automatically.
4. **Connection Establishment:** Register 'open' event handler (EventSource uses 'open' not 'connect') that logs successful connection message with ISO timestamp format matching Phase 4 MQTT logging style for consistency.
5. **Error Handling:** Register 'error' event handler that logs error details with context, then exits with process.exit(1) (minimal error handling per spike approach), maintains fail-fast troubleshooting pattern consistent with Yosmart scripts.

### Task 8.2 – Implement contact sensor event parsing and console logging │ Agent_Events
- **Objective:** Add EventStream message event handler to hue-listen.js that parses incoming JSON events, filters for contact sensor updates specifically, extracts contact/no-contact state changes, and outputs formatted timestamped console logs matching Phase 4 MQTT logging style for direct latency comparison.
- **Output:** Enhanced hue-listen.js with 'message' event handler that parses SSE data payload as JSON, identifies contact sensor events by checking resource type and service type fields, extracts contact_report state ("contact"/"no_contact"), and logs formatted output: `[${ISO_timestamp}] Contact sensor "${sensor_name}" → ${STATE_UPPERCASE}` enabling visual latency verification against Yosmart's MQTT millisecond performance.
- **Guidance:** Hue EventStream messages contain array of update objects with type, id, and data fields. Contact sensor events have type "update" referencing contact resource with contact_report containing state. May need to correlate resource IDs with device names from Task 7.1 discovery. Event format more verbose than Yosmart MQTT - nested data structure. Maintain logging format consistency with Phase 4 for easy comparison. Depends on: Task 8.1 Output.

**Subtasks:**
1. **Message Handler Registration:** Add 'message' event listener to EventSource client (receives event parameter with data property containing JSON string), positioned after connection handler setup.
2. **Payload Parsing:** Parse event.data as JSON (SSE sends data as string), extract array of event objects from parsed message, wrap in try-catch for JSON parsing errors with error logging.
3. **Contact Sensor Filtering:** Iterate through event objects array, check each object's type field for "update" and owner.rtype field for "contact" (indicates contact sensor resource update), filter out non-contact-sensor events (lights, buttons, temperature, etc.).
4. **State Extraction and Logging:** For contact sensor events, extract contact_report.state from data field ("contact" = closed, "no_contact" = open in Hue terminology - opposite naming from typical open/closed), map to clear state labels (CLOSED/OPEN), extract device name from metadata or use resource ID, format output: `[${new Date().toISOString()}] Contact sensor "${name}" → ${STATE}` matching Phase 4 logging style for comparison.

### Task 8.3 – Test EventStream latency and document Hue findings │ Agent_Events
- **Objective:** Execute hue-listen.js to test real-time event detection, measure latency through physical contact sensor triggers, assess connection reliability, and document comprehensive Hue EventStream findings in README for direct comparison with Yosmart MQTT performance validated in Phase 4.
- **Output:** Validated real-time EventStream event detection with observed latency measurements, connection reliability assessment, README "Hue API Findings" section updated with EventStream performance: connection stability, average event latency with examples, whether 60-second requirement met, comparison notes contrasting EventStream vs MQTT patterns, and overall Hue viability assessment preparing for Phase 10 comparative decision.
- **Guidance:** Testing workflow mirrors Phase 4 Task 4.3 - run script, physically trigger sensors, observe console logs, assess latency and reliability. Key comparison points: EventStream (SSE) vs MQTT latency, local bridge vs cloud infrastructure impact on speed, HTTP-based push vs MQTT protocol efficiency. Document whether Hue matches Yosmart's millisecond performance or shows different characteristics. Depends on: Task 8.2 Output.

**Subtasks:**
1. **Script Execution:** Instruct User to run `node hue-listen.js`, verify EventStream connection succeeds with console confirmation, keep script running for event monitoring during physical testing.
2. **Physical Testing:** Instruct User to physically trigger Hue contact sensors multiple times (open/close doors or windows), verify console logs appear for each state change, confirm device names and states match physical actions taken.
3. **Latency Measurement:** Instruct User to compare console log timestamps to approximate physical trigger time (same methodology as Phase 4), assess whether events detected within 60-second requirement, note observed latency patterns and specific examples from User feedback for documentation.
4. **Reliability Testing:** Continue triggering sensor events over 5-10 minute period, monitor for EventStream connection drops or reconnection patterns, count any missed events (physical triggers without corresponding logs), assess local bridge stability vs Yosmart cloud MQTT reliability.
5. **Comprehensive Documentation:** Update README "Hue API Findings" section with EventStream assessment: connection reliability (stable/intermittent patterns), average latency observed with specific examples, whether 60-second requirement met, EventStream vs MQTT comparison notes (protocol differences, performance characteristics), local vs cloud architecture impact on reliability, overall Hue viability for real-time monitoring.

---

## Phase 9: Comparative Analysis & Final Recommendation

### Task 9.1 – Create comparative analysis and final recommendation │ Agent_Events
- **Objective:** Synthesize all testing findings from both APIs into comprehensive comparative analysis section in README, evaluating Yosmart vs Hue across authentication, device discovery, real-time events, and architecture, delivering clear recommendation on which API to use for full application development based on measured performance, reliability, and implementation complexity.
- **Output:** README.md with new "## API Comparison & Recommendation" section providing side-by-side analysis of Yosmart and Hue across key dimensions (authentication complexity, event latency, connection reliability, API architecture, local vs cloud trade-offs), synthesizing findings from all phases, and presenting clear final recommendation with specific reasoning tied to testing observations - completing comparative feasibility spike with actionable decision guidance.
- **Guidance:** This task synthesizes work across all previous phases by both Agent_Auth and Agent_Events. Compare: authentication patterns (OAuth vs button press, token lifecycle), device APIs (BDDP/BUDP vs RESTful, cloud vs local), real-time events (MQTT vs EventStream, observed latencies, reliability), implementation complexity, and architectural implications (internet dependency, local network requirements). Recommendation should consider both technical performance and practical deployment constraints. Depends on: Phase 4 Task 4.3 Output by Agent_Events (Yosmart findings), Phase 8 Task 8.3 Output by Agent_Events (Hue findings).

**Subtasks:**
1. **Authentication Comparison:** Create comparison table or structured text comparing Yosmart OAuth (UAC generation, 2-hour tokens, refresh capability, internet-dependent) vs Hue button press (physical access required, long-lived keys, local-only, no expiration), assess setup complexity and security trade-offs.
2. **Real-Time Events Comparison:** Compare MQTT (Yosmart) vs EventStream (Hue) performance based on Phase 4 and Phase 8 testing: document observed latencies side-by-side, compare connection reliability patterns, contrast protocol characteristics (MQTT bidirectional vs SSE unidirectional, standardization, tooling support), evaluate which met 60-second requirement better.
3. **Architecture Comparison:** Contrast cloud-based (Yosmart) vs local bridge (Hue) architectures: internet dependency vs local network requirement, response latency implications, rate limiting observations (cloud stricter vs local permissive), privacy/security considerations (data leaves network vs stays local), deployment complexity for production.
4. **Implementation Complexity Assessment:** Compare developer experience and implementation effort observed during spike: API documentation quality, SDK/library availability, error handling patterns, debugging ease, authentication flows, overall development friction encountered.
5. **Final Recommendation:** Synthesize all comparison points into clear recommendation section: state which API to proceed with for full application, provide specific reasoning tied to testing findings (e.g., "Recommend Yosmart: millisecond MQTT latency matches Hue, but cloud architecture eliminates local network dependency" OR "Recommend Hue: local bridge matches real-time performance without internet dependency"), note any conditions or caveats, document decision rationale for future reference.

---

## Phase 10: Govee Remote API Setup

### Task 10.1 – Research Govee API authentication and obtain API key │ Agent_Setup
- **Objective:** Research Govee developer documentation for authentication mechanism, guide user through Govee Home app API key generation, document API key authentication pattern, and update .env.example with GOVEE_API_KEY placeholder.
- **Output:** Understanding of Govee API key-based authentication (simpler than Yosmart OAuth or Hue Authorization Code), user guidance for generating API key in Govee Home app (Settings → Apply for API Key), .env.example updated with GOVEE_API_KEY placeholder, documentation of API key usage pattern (header: "Govee-API-Key"), and initial assessment of auth simplicity compared to Yosmart/Hue.
- **Guidance:** Govee uses simple API key authentication (no OAuth flows) - apply in Govee Home mobile app at Settings → Apply for API Key → Submit information. API key serves as both username and password for MQTT. Simpler than Yosmart client_credentials OAuth or Hue Authorization Code+PKCE. Key appears long-lived with no documented expiration (contrast to Yosmart 2hr, Hue 7-day tokens). Rate limit: 10,000 requests/account/day.

**Subtasks:**
1. **Documentation Research:** Review Govee developer docs at https://developer.govee.com/docs/getting-started and https://developer.govee.com/reference/apply-you-govee-api-key, document authentication pattern (API key in "Govee-API-Key" HTTP header), note simplicity compared to OAuth flows from Phases 2 and 6.
2. **User Guidance Creation:** Document API key generation steps in README: open Govee Home app, navigate to Settings → Apply for API Key, submit developer application, wait for approval (if required), copy generated API key - provide clear step-by-step for user.
3. **Environment Template:** Update .env.example with `GOVEE_API_KEY=your_api_key_here` and comment explaining where to obtain: "# Get from Govee Home app: Settings → Apply for API Key", preparing for Phase 11 device discovery.
4. **Authentication Analysis:** Document Govee auth characteristics for later comparison: no expiration metadata (appears long-lived), single API key for all operations (simpler than token refresh), rate limit 10,000 req/day (document for production considerations), no OAuth complexity vs Yosmart/Hue patterns.

### Task 10.2 – Update package.json for Govee dependencies │ Agent_Setup  
- **Objective:** Verify existing mqtt package supports Govee MQTTS requirements (TLS port 8883), confirm no additional dependencies needed beyond existing spike packages (dotenv, mqtt, eventsource).
- **Output:** Confirmation that existing package.json dependencies sufficient for Govee testing, no new npm installs required, validation that mqtt package supports MQTTS protocol needed for Govee broker connection.
- **Guidance:** Govee uses MQTTS (MQTT over TLS) to mqtt.openapi.govee.com:8883 - same mqtt npm package used for Yosmart supports TLS. No new dependencies needed. Simpler than Hue EventStream which required eventsource package addition in Phase 6.

**Subtasks:**
1. **Dependency Review:** Verify package.json already has mqtt package from Phase 1 setup, confirm mqtt package supports MQTTS protocol (TLS) needed for Govee connection.
2. **Documentation:** Note in implementation log that no new dependencies required - existing mqtt, dotenv packages sufficient for Govee API testing, maintaining minimal spike dependency footprint.

### Task 10.3 – Update README with Govee Remote API section │ Agent_Setup
- **Objective:** Add "Govee Remote API Setup" section to README documenting API key generation, MQTT connection parameters, and creating "Govee Remote API Findings" template section parallel to Yosmart and Hue sections for Phase 11-12 findings population.
- **Output:** README.md enhanced with Govee setup instructions (API key generation steps from Task 10.1), MQTT connection details (host: mqtt.openapi.govee.com, port: 8883, auth: API key as username/password), and empty "Govee Remote API Findings" section template with bullet point placeholders for authentication, device discovery, MQTT events, latency, and reliability observations.
- **Guidance:** Follow structure established in Phases 1 and 6 for Yosmart and Hue - parallel sections for each API being compared. Template prepares for comparative analysis in Phase 13.

**Subtasks:**
1. **Setup Section:** Add "## Govee Remote API Setup" section with subsections: API key generation (copy from Task 10.1 user guidance), MQTT connection parameters (host, port, username/password pattern using API key), topic pattern documentation (GA/{api_key}).
2. **Findings Template:** Create "## Govee Remote API Findings" section with placeholder bullets: "- **Authentication:** [API key simplicity, no expiration observed, rate limits]", "- **Device Discovery:** [REST endpoint observations, response structure]", "- **MQTT Events:** [Connection reliability, latency measurements]", "- **API Characteristics:** [developer experience, documentation quality]" - to be populated in Phases 11-12.

---

## Phase 11: Govee Device Discovery

### Task 11.1 – Implement govee-devices.js for device discovery │ Agent_Auth
- **Objective:** Create govee-devices.js script calling Govee GET /router/api/v1/user/devices endpoint to retrieve all devices under authenticated account, filter for sensor types (devices.types.sensor), identify devices with event capabilities (devices.capabilities.event), and output device list with SKU, device ID, name, and capabilities for Phase 12 MQTT subscription planning.
- **Output:** Functional govee-devices.js that loads GOVEE_API_KEY from .env, sends authenticated GET request to https://openapi.api.govee.com/router/api/v1/user/devices with "Govee-API-Key" header, parses JSON response, filters devices array for type "devices.types.sensor", identifies devices with "devices.capabilities.event" capability (indicates MQTT event support), and outputs formatted console list showing device details needed for monitoring.
- **Guidance:** Govee uses RESTful API (like Hue Remote, unlike Yosmart BDDP/BUDP). Response includes capabilities array describing device features - key insight for MQTT event filtering. Sensor types may include thermometer, contact sensors, presence sensors. Event capability indicates MQTT push event support (not all devices support events). Response structure more complex than Yosmart (detailed capability metadata) but RESTful pattern familiar from Hue Phase 7. Depends on: Task 10.1 Output.

**Subtasks:**
1. **Environment Loading:** Load GOVEE_API_KEY from .env using dotenv, validate key exists (exit with error message referencing Task 10.1 guidance if missing).
2. **API Request Construction:** Construct GET request to `https://openapi.api.govee.com/router/api/v1/user/devices` with headers: `Govee-API-Key: ${apiKey}`, `Content-Type: application/json`.
3. **Response Parsing:** Parse JSON response, validate `code` field equals 200 (success status), extract `data` array containing device objects, handle HTTP errors and API-level errors with logging.
4. **Sensor Filtering:** Filter devices array for sensor types - check `type` field equals "devices.types.sensor", optionally list other device types found (lights, appliances) for user awareness but focus on sensors.
5. **Event Capability Detection:** For each sensor, inspect `capabilities` array for objects with `type: "devices.capabilities.event"` indicating MQTT event support, note instance field value (e.g., "lackWaterEvent", "bodyAppearedEvent") which identifies specific event types, flag devices with event capability as MQTT-monitorable.
6. **Output Formatting:** Log formatted device list: SKU (model), device ID (unique identifier), deviceName (user-friendly name), capabilities summary (focusing on event instances if present), prepare device details for Phase 12 MQTT monitoring.

### Task 11.2 – Test Govee device API and document findings │ Agent_Auth
- **Objective:** Execute govee-devices.js to validate device discovery, verify output matches user's physical Govee hardware, assess whether user has event-capable sensors for Phase 12 testing, and document Govee device API characteristics in README comparing REST structure with Yosmart BDDP/BUDP and Hue patterns observed in previous phases.
- **Output:** Confirmed working device discovery with console output showing expected sensors, validation that user has event-capable devices for MQTT testing (if not, document limitation), README "Govee Remote API Findings" section updated with device API observations: RESTful design similarity to Hue, capabilities metadata richness vs Yosmart simplicity, response structure notes, rate limit handling (10k req/day).
- **Guidance:** Key question: does user have Govee sensors with event capability? If no event-capable devices, Phase 12 MQTT testing may be limited to connection validation without actual sensor events. Document API comparison: Govee REST vs Yosmart RPC vs Hue REST, capability-based device description vs simple device lists. Depends on: Task 11.1 Output.

**Subtasks:**
1. **Script Execution:** Run `node govee-devices.js`, review console output showing sensors and capabilities, verify device names match user's physical Govee devices.
2. **Event Capability Assessment:** Check console output for devices with event capabilities, confirm user has sensors supporting MQTT events (presence, contact, water level, etc.) needed for Phase 12 latency testing, document device types available.
3. **API Characteristics Documentation:** Update README "Govee Remote API Findings" section with device discovery observations: RESTful GET pattern (similar to Hue), capabilities array approach vs Yosmart simple device objects, metadata richness (SKU, instance parameters), developer experience notes (API clarity, response structure complexity).
4. **Comparison Notes:** Document how Govee device API compares to previously tested APIs: RESTful like Hue vs RPC-style like Yosmart, capability-based model provides detailed device feature descriptions, response verbosity trade-off (more metadata vs simpler parsing).

---

## Phase 12: Govee MQTT Event Monitoring

### Task 12.1 – Implement govee-listen.js with MQTTS connection │ Agent_Events
- **Objective:** Create govee-listen.js script establishing MQTTS (MQTT over TLS) connection to Govee broker at mqtt.openapi.govee.com:8883, authenticating with API key as username/password, subscribing to topic pattern GA/{api_key} for all device events, validating Govee's MQTT infrastructure comparable to Yosmart pattern.
- **Output:** Functional long-running govee-listen.js that loads GOVEE_API_KEY from .env, creates MQTT client connecting to mqtts://mqtt.openapi.govee.com:8883 with API key as both username and password (Govee pattern), subscribes to topic `GA/${apiKey}` to receive all account device events, logs connection success with timestamp, and remains running to receive real-time sensor events - establishing MQTT foundation for latency testing in Task 12.2.
- **Guidance:** Govee MQTT uses API key for both username AND password (unique pattern vs Yosmart token-as-username). MQTTS requires TLS (port 8883 not 1883). Topic pattern GA/{api_key} receives all events for all devices under account (simpler than Yosmart yl-home/{home_id}/+/report). Connection setup similar to Phase 4 Yosmart MQTT but different broker and auth. Depends on: Task 10.1 Output by Agent_Setup.

**Subtasks:**
1. **Cross-Agent Integration:** Read .env for GOVEE_API_KEY (from Task 10.1 by Agent_Setup), review Govee API documentation pattern from Phase 10, understand API key serves both username and password for MQTT auth.
2. **Environment Loading:** Import dotenv and mqtt package, load GOVEE_API_KEY from .env, validate key exists with error message indicating how to obtain (Govee Home app Settings) if missing.
3. **MQTTS Client Creation:** Construct Govee broker URL: `mqtts://mqtt.openapi.govee.com:8883` (note MQTTS protocol and TLS port), create MQTT client options object: `{ username: apiKey, password: apiKey, clean: true }` (API key for both fields per Govee pattern), call mqtt.connect() with URL and options.
4. **Connection Establishment:** Register 'connect' event handler that logs successful connection message with ISO timestamp format matching Phase 4 and Phase 8 logging style for consistency across all API tests.
5. **Topic Subscription:** Inside 'connect' handler, call `client.subscribe('GA/' + apiKey)` to subscribe to Govee topic pattern receiving all device events for account, log subscription confirmation.
6. **Error Handling:** Register 'error' event handler that logs error details with context, then exits with process.exit(1) (minimal error handling per spike approach), maintains fail-fast troubleshooting pattern consistent with previous scripts.

### Task 12.2 – Implement Govee event parsing and console logging │ Agent_Events
- **Objective:** Add MQTT message handler to govee-listen.js that parses incoming Govee event messages, filters for sensor event types (based on device capabilities from Phase 11), extracts state changes, and outputs formatted timestamped console logs matching Phase 4 and Phase 8 logging style for direct latency comparison across all three APIs.
- **Output:** Enhanced govee-listen.js with 'message' event handler that parses MQTT payload as JSON, identifies sensor events by checking sku/capabilities/instance fields, extracts state values from capabilities.state array, and logs formatted output: `[${ISO_timestamp}] ${deviceName} ${instance} → ${state_name} (${state_value})` enabling visual latency verification against Yosmart MQTT millisecond and Hue polling 30-second performance.
- **Guidance:** Govee MQTT messages contain device object with sku, device ID, deviceName, and capabilities array. Event capability objects have type, instance (event name like "bodyAppearedEvent"), and state array with name/value pairs. Format differs from Yosmart simple event/data structure. Maintain logging format consistency with Phase 4 and Phase 8 for easy three-way comparison. Depends on: Task 12.1 Output.

**Subtasks:**
1. **Message Handler Registration:** Add 'message' event listener to MQTT client (receives topic and message buffer parameters), positioned after connection handler setup.
2. **Payload Parsing:** Convert message buffer to string, parse as JSON to extract Govee event object, wrap in try-catch for JSON parsing errors with error logging.
3. **Event Structure Understanding:** Extract deviceName, sku, and capabilities array from parsed message, iterate through capabilities looking for type "devices.capabilities.event" entries indicating sensor events.
4. **State Extraction and Logging:** For each event capability, extract instance field (event type name), extract state array containing state changes (name/value pairs), format output: `[${new Date().toISOString()}] ${deviceName} ${instance} → ${state.name} (${state.value})` providing clear event identification, match logging style from Phase 4/8 for comparison consistency.

### Task 12.3 – Test Govee MQTT event monitoring latency and document findings │ Agent_Events
- **Objective:** Execute govee-listen.js for extended monitoring period, manually trigger sensor events if possible, measure observed latency from action to log detection, assess connection reliability, and document comprehensive Govee MQTT findings in README for three-way comparison with Yosmart MQTT (millisecond) and Hue polling (30-second) performance from previous phases.
- **Output:** Validated real-time MQTT event detection with observed latency measurements, connection reliability assessment over 5-10 minute period, README "Govee Remote API Findings" section updated with MQTT performance: connection stability, average event latency with examples, whether 60-second requirement met, comparison notes contrasting Govee MQTT vs Yosmart MQTT vs Hue polling patterns, and overall Govee viability assessment preparing for Phase 13 three-way comparative analysis.
- **Guidance:** Testing workflow mirrors Phase 4 (Yosmart MQTT) and Phase 8 (Hue EventStream) - run script, physically trigger sensors if accessible, observe console logs, assess latency and reliability. Key comparison points: Govee MQTT vs Yosmart MQTT (both real-time push, different brokers and auth patterns), Govee MQTT vs Hue polling (push vs poll latency difference). If user has event-capable sensors (presence, contact), trigger events manually. If not, document limitation but assess connection stability. Depends on: Task 12.2 Output.
- **Status:** ✅ **COMPLETE** (2026-01-19)

**Implementation Results:**
- **MQTTS Connection:** ✅ Successfully established connection to mqtt.openapi.govee.com:8883 using API key as username/password
- **Device Discovery:** Found 2 lights (LED Strip M1 H61E1, Bulb H8015), 0 sensors
- **MQTT Event Testing:** MQTT connection stable but **lights do not send push events** - only sensors with `devices.capabilities.event` send MQTT messages
- **Polling Alternative:** Created govee-state-poll.js to test REST polling approach for lights
- **Critical Finding - No Offline Detection:** 
  - Govee API returns **stale cached state indefinitely** for offline devices
  - No `reachable`, `online`, or `connected` field exists in API responses
  - Unplugged bulbs still show as online with last known state
  - **Production blocker:** Cannot detect when devices go offline for monitoring use cases
- **Hue Comparison Test:** Created hue-state-poll.js to test offline detection on Hue Remote API
  - Hue's `reachable` field **successfully detects** offline devices in real-time
  - Observed OFFLINE→ONLINE and ONLINE→OFFLINE transitions within 5-second polling
  - **Major differentiator:** Hue can reliably monitor device connectivity, Govee cannot

**Key Findings for Phase 13:**
1. **Govee MQTT:** Works for sensors only, not lights - architectural limitation
2. **Govee Polling:** Works but lacks connectivity status - critical limitation
3. **Offline Detection Capability:**
   - ❌ Govee: No connectivity field, returns stale data
   - ✅ Hue: `reachable` field updates in real-time
   - ✅ Yosmart: MQTT disconnect events indicate offline
4. **Production Impact:** Govee unsuitable for monitoring applications requiring offline detection

**Subtasks:**
1. **Script Execution:** Run `node govee-listen.js`, verify MQTTS connection succeeds with console confirmation, keep script running for event monitoring during physical testing.
2. **Physical Testing (if applicable):** If user has triggerable sensors (presence sensors, contact sensors), physically trigger events multiple times, verify console logs appear for each state change, confirm device names and states match physical actions - if no triggerable sensors, skip manual testing but continue monitoring for any ambient events.
3. **Latency Measurement:** Compare console log timestamps to approximate physical trigger time (same methodology as Phase 4 and Phase 8), assess whether events detected within 60-second requirement, note observed latency patterns and specific examples, compare to Yosmart MQTT millisecond and Hue 30-second polling performance.
4. **Reliability Testing:** Continue monitoring over 5-10 minute period, monitor for MQTTS connection drops or reconnection patterns, count any missed events (if manually triggering), assess Govee cloud MQTT broker stability vs Yosmart cloud MQTT and Hue local EventStream reliability patterns.
5. **Comprehensive Documentation:** Update README "Govee Remote API Findings" section with MQTT assessment: connection reliability (stable/drops/reconnection behavior), average latency observed with specific examples, whether 60-second requirement met, MQTT vs polling comparison notes (Govee vs Yosmart MQTT similarities, Govee vs Hue polling latency difference), cloud broker performance notes, overall Govee viability for real-time monitoring in three-API context.

---

## Phase 13: Final Three-Way Comparative Analysis

### Task 13.1 – Create three-way comparative analysis and final recommendation │ Agent_Final
- **Objective:** Synthesize all testing findings from Yosmart, Hue Remote, and Govee APIs into comprehensive three-way comparative analysis section in README, evaluating across authentication, device discovery, real-time events, API design, and architecture, delivering clear recommendation on which API(s) to consider for full application development based on measured performance, reliability, and implementation complexity across all three platforms.
- **Output:** README.md with updated "## Three-Way API Comparison & Recommendation" section providing side-by-side analysis of Yosmart, Hue Remote, and Govee across key dimensions: authentication patterns (OAuth client_creds vs Authorization Code+PKCE vs API key), event mechanisms (MQTT vs polling vs MQTT), observed latencies (millisecond vs 30-second vs millisecond), connection reliability, API design patterns (RPC vs REST vs REST), rate limits, and cloud vs local architecture trade-offs - synthesizing findings from all 12 phases with actionable decision guidance based on testing observations.
- **Guidance:** This task synthesizes work across all previous phases by Agent_Setup, Agent_Auth, Agent_Events, and Agent_Final. Three-way comparison matrix: **Yosmart** (OAuth client_creds, BDDP/BUDP RPC, MQTT millisecond, 2hr token, cloud) vs **Hue Remote** (OAuth Authorization Code+PKCE, REST, 30s polling, 7-day token, cloud proxy) vs **Govee** (API key, REST, MQTT with event capability, long-lived key, cloud). Recommendation should consider technical performance (latency, reliability), developer experience (auth complexity, API design), and practical constraints (token refresh, rate limits, sensor availability). Depends on: Phase 4 Task 4.3 (Yosmart MQTT), Phase 8 Task 8.2 (Hue polling), Phase 12 Task 12.3 (Govee MQTT).

**Subtasks:**
1. **Authentication Comparison Table:** Create three-column comparison: **Yosmart** (OAuth client_credentials, 2hr expiration, refresh token, automated flow) vs **Hue Remote** (OAuth Authorization Code+PKCE, 7-day expiration, browser consent, callback server) vs **Govee** (API key, no observed expiration, simple header auth, Govee Home app generation), assess setup complexity and maintenance burden for each.
2. **Real-Time Events Performance Matrix:** Compare event mechanisms and measured latencies: **Yosmart** (MQTT push, millisecond latency from Phase 4, 100% reliability) vs **Hue Remote** (polling only, 30-second latency from Phase 8, architectural limitation) vs **Govee** (MQTT push with event capability, observed latency from Phase 12, broker stability), document which APIs met 60-second requirement and by what margin.
3. **API Design Comparison:** Contrast architectural patterns: **Yosmart** (custom BDDP/BUDP RPC format, learning curve, consistent once mastered) vs **Hue Remote** (RESTful endpoints, standard patterns, rich metadata) vs **Govee** (RESTful with capability model, detailed feature descriptions, standard HTTP), assess developer experience and documentation quality observed during implementation.
4. **Rate Limits and Scalability:** Document observed/documented rate limits: **Yosmart** (none observed during spike) vs **Hue Remote** (polling overhead, 30s interval reduces load) vs **Govee** (10,000 req/day documented, MQTT reduces polling needs), assess production scalability implications for each platform.
5. **Architecture Trade-offs:** Compare infrastructure requirements: **Yosmart** (pure cloud, internet-dependent, no local setup) vs **Hue Remote** (cloud proxy to local bridge, internet-dependent, EventStream not available remotely) vs **Govee** (pure cloud, internet-dependent, no local setup), note implications for deployment, reliability, privacy.
6. **Final Recommendation:** Synthesize all comparison points into clear recommendation addressing user's door sensor monitoring use case: rank APIs by suitability (consider latency for security context, auth complexity for maintenance, API design for developer productivity), provide specific reasoning tied to testing findings (e.g., "Yosmart and Govee tie for real-time MQTT performance, but Yosmart wins on simpler auth vs Govee's long key approval" OR "Govee recommended: MQTT real-time like Yosmart, RESTful design like Hue, simple API key auth"), note conditions/caveats (sensor availability, token refresh requirements), document decision rationale for production planning.

