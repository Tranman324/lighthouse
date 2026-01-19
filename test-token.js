import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const accessToken = process.env.YOSMART_ACCESS_TOKEN;

if (!accessToken) {
  console.error('Error: YOSMART_ACCESS_TOKEN not found in .env file');
  process.exit(1);
}

console.log('Testing token validity with Home.getGeneralInfo API call...');

// Construct BDDP (Basic Downlink Data Packet)
const bddpRequest = {
  method: 'Home.getGeneralInfo',
  time: Date.now() // Current timestamp in milliseconds
};

// Make API call to validate token
const response = await fetch('https://api.yosmart.com/open/yolink/v2/api', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(bddpRequest)
});

const responseData = await response.json();

console.log('Response Status:', response.status);
console.log('Response Data:', JSON.stringify(responseData, null, 2));

// Check BUDP response code
if (responseData.code === '000000') {
  console.log('\n✓ Token is VALID - Authentication successful!');
  console.log('Home ID:', responseData.data?.id);
} else {
  console.error('\n✗ Token validation failed');
  console.error('Error code:', responseData.code);
  process.exit(1);
}
