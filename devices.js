import dotenv from 'dotenv';

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

// Construct BDDP (Basic Downlink Data Packet) for device list request
const bddpRequest = {
  method: 'Home.getDeviceList',
  time: Date.now() // Current Unix timestamp in milliseconds
};

console.log('✓ BDDP request constructed');

// Execute API request to retrieve device list
console.log('Fetching device list from Yosmart API...');

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

// Extract devices array from response data
const devices = responseData.data?.devices;

if (!devices || !Array.isArray(devices)) {
  console.error('Error: No devices array in response');
  console.error('Response data:', JSON.stringify(responseData, null, 2));
  process.exit(1);
}

console.log(`✓ Successfully retrieved ${devices.length} device(s)`);

// Filter for door sensor devices
// Door sensor type identifier is typically "DoorSensor" or similar
const doorSensors = devices.filter(device => 
  device.type && device.type.toLowerCase().includes('door')
);

console.log(`\n=== Door Sensors Found: ${doorSensors.length} ===\n`);

if (doorSensors.length === 0) {
  console.log('No door sensors found in account.');
  console.log('\nAll devices:');
  devices.forEach((device, index) => {
    console.log(`  ${index + 1}. ${device.name} (Type: ${device.type})`);
  });
} else {
  // Output door sensor details in readable format
  doorSensors.forEach((sensor, index) => {
    console.log(`Door Sensor #${index + 1}:`);
    console.log(`  Name:      ${sensor.name}`);
    console.log(`  Type:      ${sensor.type}`);
    console.log(`  Device ID: ${sensor.deviceId}`);
    console.log(`  Token:     ${sensor.token}`);
    console.log('');
  });
  
  console.log('These device details can be used for:');
  console.log('  - Phase 4: MQTT event monitoring (deviceId for filtering)');
  console.log('  - Phase 5: Polling fallback (deviceId and token for state queries)');
}
