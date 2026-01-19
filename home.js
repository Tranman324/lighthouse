import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables from .env file
dotenv.config();

// Extract access token from environment
const YOSMART_ACCESS_TOKEN = process.env.YOSMART_ACCESS_TOKEN;

// Validate token exists (fail-fast approach)
if (!YOSMART_ACCESS_TOKEN) {
  console.error('Error: YOSMART_ACCESS_TOKEN not found in .env file');
  console.error('Please run auth.js first to obtain an access token');
  process.exit(1);
}

console.log('✓ Access token loaded successfully');

// Construct BDDP (Basic Downlink Data Packet) for home info request
const bddpRequest = {
  method: 'Home.getGeneralInfo',
  time: Date.now() // Current Unix timestamp in milliseconds
};

console.log('✓ BDDP request constructed');

// Execute API request to retrieve home information
console.log('Fetching home info from Yosmart API...');

const response = await fetch('https://api.yosmart.com/open/yolink/v2/api', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${YOSMART_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(bddpRequest)
});

console.log(`✓ API request completed (Status: ${response.status})`);

// Parse BUDP (Basic Uplink Data Packet) response
const responseData = await response.json();

// Check for HTTP errors
if (!response.ok) {
  console.error(`Error: HTTP ${response.status} - ${response.statusText}`);
  console.error('Response body:', JSON.stringify(responseData, null, 2));
  process.exit(1);
}

// Check BUDP success code (Yosmart uses "000000" for success)
if (responseData.code !== '000000') {
  console.error('Error: API request failed');
  console.error('Error code:', responseData.code);
  console.error('Description:', responseData.desc || 'No description');
  console.error('Full response:', JSON.stringify(responseData, null, 2));
  process.exit(1);
}

// Extract home_id from response data
const homeId = responseData.data?.id;

if (!homeId) {
  console.error('Error: No home ID in response');
  console.error('Response data:', JSON.stringify(responseData, null, 2));
  process.exit(1);
}

console.log(`✓ Home ID retrieved: ${homeId}`);

// Persist home_id to .env file for Phase 4 MQTT usage
fs.appendFileSync('.env', `\nYOSMART_HOME_ID=${homeId}\n`);

// Log success with ISO timestamp
const timestamp = new Date().toISOString();
console.log(`[${timestamp}] Successfully retrieved and saved home_id to .env`);
console.log('\nThis home_id will be used in Phase 4 for MQTT topic construction:');
console.log(`  Topic pattern: yl-home/${homeId}/+/report`);
