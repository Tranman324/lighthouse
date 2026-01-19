import dotenv from 'dotenv';
import mqtt from 'mqtt';

// Load environment variables from .env file
dotenv.config();

// Extract MQTT credentials from environment
const YOSMART_ACCESS_TOKEN = process.env.YOSMART_ACCESS_TOKEN;
const YOSMART_HOME_ID = process.env.YOSMART_HOME_ID;

// Validate credentials exist (fail-fast approach)
if (!YOSMART_ACCESS_TOKEN) {
  console.error('Error: YOSMART_ACCESS_TOKEN not found in .env file');
  console.error('Please run auth.js first to obtain an access token');
  process.exit(1);
}

if (!YOSMART_HOME_ID) {
  console.error('Error: YOSMART_HOME_ID not found in .env file');
  console.error('Please run home.js first to obtain the home ID');
  process.exit(1);
}

console.log('✓ MQTT credentials loaded successfully');
console.log(`  Home ID: ${YOSMART_HOME_ID}`);

// Create MQTT client with Yosmart broker configuration
console.log('Creating MQTT client...');

const client = mqtt.connect({
  host: 'mqtt.api.yosmart.com',
  port: 8003,
  protocol: 'mqtt',
  username: YOSMART_ACCESS_TOKEN,
  password: undefined // No password per Yosmart specification
});

console.log('✓ MQTT client created');

// Register connection event handler
client.on('connect', () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Connected to Yosmart MQTT broker`);
  
  // Subscribe to device events after successful connection
  const topic = `yl-home/${YOSMART_HOME_ID}/+/report`;
  
  client.subscribe(topic, (err) => {
    if (err) {
      console.error('Error subscribing to topic:', err);
      process.exit(1);
    }
    console.log(`✓ Subscribed to topic: ${topic}`);
    console.log('Listening for door sensor events...');
  });
});

// Register message event handler
client.on('message', (topic, payload) => {
  // Parse payload buffer as JSON
  try {
    const payloadString = payload.toString();
    const message = JSON.parse(payloadString);
    
    // Filter for door sensor events - check the 'event' field
    const eventType = message.event;
    
    if (!eventType || !eventType.toLowerCase().includes('doorsensor')) {
      return; // Skip non-door-sensor events
    }
    
    // Extract device name (use deviceId since name not in MQTT message)
    const deviceId = message.deviceId || 'Unknown';
    const state = message.data?.state;
    
    // Format state for display
    let stateDisplay = 'UNKNOWN';
    if (state) {
      if (typeof state === 'string') {
        stateDisplay = state.toUpperCase();
      } else if (typeof state === 'object') {
        // State might be nested object with fields like 'open', 'closed', or 'state'
        stateDisplay = (state.state || state.open || state.closed || JSON.stringify(state)).toString().toUpperCase();
      } else {
        stateDisplay = state.toString().toUpperCase();
      }
    }
    
    // Log formatted door sensor event with ISO timestamp
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Door sensor ${deviceId} → ${stateDisplay}`);
    
  } catch (err) {
    console.error('Error parsing message payload:', err.message);
  }
});

// Register error event handler
client.on('error', (err) => {
  console.error('MQTT Error:', err.message);
  console.error('Error details:', err);
  process.exit(1);
});

// Register close/disconnect event handler
client.on('close', () => {
  console.error('MQTT connection closed');
  process.exit(1);
});
