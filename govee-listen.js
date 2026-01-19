// Govee Remote API MQTT Event Monitoring
// Connects to Govee MQTTS broker to receive device events

import 'dotenv/config';
import mqtt from 'mqtt';

const GOVEE_BROKER = 'mqtts://mqtt.openapi.govee.com:8883';

async function connectMQTT() {
  const apiKey = process.env.GOVEE_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Missing GOVEE_API_KEY!');
    console.error('Get API key from Govee Home app: Settings → Apply for API Key');
    process.exit(1);
  }
  
  console.log('🔌 Connecting to Govee MQTT broker...');
  console.log(`   Host: mqtt.openapi.govee.com:8883 (MQTTS)`);  
  console.log(`   Topic: GA/${apiKey.substring(0, 8)}...\n`);
  
  // Govee MQTT unique pattern: API key for BOTH username and password
  const options = {
    username: apiKey,
    password: apiKey,  // Same as username (Govee pattern)
    clean: true,
  };
  
  const client = mqtt.connect(GOVEE_BROKER, options);
  
  // Connection established
  client.on('connect', () => {
    const timestamp = new Date().toISOString();
    console.log(`✅ [${timestamp}] Connected to Govee MQTT broker`);
    
    // Subscribe to account topic (receives all device events)
    const topic = `GA/${apiKey}`;
    client.subscribe(topic, (err) => {
      if (err) {
        console.error('❌ Subscription failed:', err.message);
        process.exit(1);
      }
      console.log(`📡 Subscribed to topic: GA/${apiKey.substring(0, 8)}...`);
      console.log('\n🎧 Listening for events... (Ctrl+C to stop)\n');
    });
  });
  
  // Message received
  client.on('message', (topic, message) => {
    const timestamp = new Date().toISOString();
    const rawMessage = message.toString();
    
    // Always print raw data first
    console.log(`═══════════════════════════════════════════════════════`);
    console.log(`[${timestamp}] RAW MESSAGE RECEIVED`);
    console.log(`Topic: ${topic}`);
    console.log(`Length: ${rawMessage.length} bytes`);
    console.log(`Raw Data:\n${rawMessage}`);
    console.log(`═══════════════════════════════════════════════════════`);
    
    // Try to parse and format
    try {
      const event = JSON.parse(rawMessage);
      
      console.log(`\n📦 PARSED EVENT:`);
      console.log(`   Device: ${event.deviceName || event.device || 'Unknown'}`);
      console.log(`   SKU: ${event.sku || 'N/A'}`);
      
      // Process capabilities/events
      if (event.capabilities && event.capabilities.length > 0) {
        console.log(`   Capabilities (${event.capabilities.length}):`);
        event.capabilities.forEach(cap => {
          console.log(`      - ${cap.type}: ${cap.instance}`);
          if (cap.type === 'devices.capabilities.event') {
            console.log(`        📡 Event capability detected!`);
            if (cap.state && cap.state.length > 0) {
              cap.state.forEach(s => {
                console.log(`          → ${s.name}: ${s.value} ${s.message ? '(' + s.message + ')' : ''}`);
              });
            }
          }
        });
      }
      
      // Show full JSON structure for debugging
      console.log(`\n🔍 FULL JSON STRUCTURE:`);
      console.log(JSON.stringify(event, null, 2));
      
    } catch (error) {
      console.error(`\n⚠️  JSON Parse Error: ${error.message}`);
      console.log(`   Message is not valid JSON or has unexpected format`);
    }
    
    console.log(`\n`);
  });
  
  // Error handling
  client.on('error', (error) => {
    console.error('❌ MQTT error:', error.message);
    process.exit(1);
  });
  
  // Connection closed
  client.on('close', () => {
    const timestamp = new Date().toISOString();
    console.log(`⚠️  [${timestamp}] Connection closed`);
  });
  
  // Reconnecting
  client.on('reconnect', () => {
    const timestamp = new Date().toISOString();
    console.log(`🔄 [${timestamp}] Reconnecting...`);
  });
}

// Start MQTT monitoring
connectMQTT();
