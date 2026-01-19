import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables from .env file
dotenv.config();

// Extract UAC credentials from environment
const YOSMART_UAID = process.env.YOSMART_UAID;
const YOSMART_SECRET = process.env.YOSMART_SECRET;

// Validate credentials exist (fail-fast approach)
if (!YOSMART_UAID) {
  console.error('Error: YOSMART_UAID is missing from .env file');
  console.error('Please add your UAID from YoLink app > Account > Advanced Settings > Personal Access Credentials');
  process.exit(1);
}

if (!YOSMART_SECRET) {
  console.error('Error: YOSMART_SECRET is missing from .env file');
  console.error('Please add your Secret Key from the same UAC in YoLink app');
  process.exit(1);
}

console.log('✓ Credentials loaded successfully');

// OAuth 2.0 client_credentials flow configuration
const TOKEN_ENDPOINT = 'https://api.yosmart.com/open/yolink/token';

// Construct OAuth request body parameters
const requestBody = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: YOSMART_UAID,
  client_secret: YOSMART_SECRET
});

console.log('✓ OAuth request constructed');

// Execute OAuth token request
console.log('Requesting access token from Yosmart API...');

const response = await fetch(TOKEN_ENDPOINT, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: requestBody.toString()
});

console.log(`✓ HTTP request completed (Status: ${response.status})`);

// Parse response body
const responseData = await response.json();

// Check for HTTP errors
if (!response.ok) {
  console.error(`Error: HTTP ${response.status} - ${response.statusText}`);
  console.error('Response body:', JSON.stringify(responseData, null, 2));
  process.exit(1);
}

// Check for API-level errors
if (responseData.error) {
  console.error('Error: OAuth request failed');
  console.error('API Error:', responseData.error);
  if (responseData.error_description) {
    console.error('Description:', responseData.error_description);
  }
  console.error('Full response:', JSON.stringify(responseData, null, 2));
  process.exit(1);
}

// Extract access token
const accessToken = responseData.access_token;

if (!accessToken) {
  console.error('Error: No access_token in response');
  console.error('Response body:', JSON.stringify(responseData, null, 2));
  process.exit(1);
}


// Persist token to .env file for subsequent scripts
fs.appendFileSync('.env', `\nYOSMART_ACCESS_TOKEN=${accessToken}\n`);

// Log success with ISO timestamp
const timestamp = new Date().toISOString();
console.log(`[${timestamp}] Successfully obtained and saved access token`);
console.log('✓ Access token obtained successfully');
