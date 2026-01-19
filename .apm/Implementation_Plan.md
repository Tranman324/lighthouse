# Yosmart API Feasibility Spike – Implementation Plan

**Memory Strategy:** Dynamic-MD (directory structure with Markdown logs)
**Last Modification:** Initial plan creation by Setup Agent
**Project Overview:** Minimal Node.js spike validating Yosmart/YoLink door sensor API integration feasibility. Tests OAuth authentication, device discovery, and MQTT real-time event detection with 60-second latency requirement. Kill-decision criteria: if API proves too restrictive (poor latency, harsh rate limits, unreliable MQTT), pivot before building full application.

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

