// Govee Remote API Device Discovery
// Retrieves all devices and filters for sensors with event capabilities

import 'dotenv/config';

const GOVEE_API_BASE = 'https://openapi.api.govee.com';

async function getDevices() {
  const apiKey = process.env.GOVEE_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Missing GOVEE_API_KEY!');
    console.error('Get API key from Govee Home app: Settings → Apply for API Key');
    console.error('Then add to .env file: GOVEE_API_KEY=your_key_here');
    process.exit(1);
  }
  
  try {
    console.log('🔍 Querying Govee Remote API for devices...\n');
    
    // GET /router/api/v1/user/devices
    const response = await fetch(`${GOVEE_API_BASE}/router/api/v1/user/devices`, {
      method: 'GET',
      headers: {
        'Govee-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('📋 Response details:', error);
      
      if (response.status === 401) {
        throw new Error('Authentication failed - check your GOVEE_API_KEY');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded (10,000 requests/day)');
      } else {
        throw new Error(`API request failed (${response.status})`);
      }
    }
    
    const data = await response.json();
    
    if (data.code !== 200) {
      throw new Error(`API error: ${data.message || 'Unknown error'}`);
    }
    
    console.log(`✅ API Response: ${data.message}`);
    console.log(`📊 Total devices found: ${data.data.length}\n`);
    
    processDevices(data.data);
    
  } catch (error) {
    console.error('❌ Device discovery failed:', error.message);
    process.exit(1);
  }
}

function processDevices(devices) {
  // Categorize devices by type
  const sensors = [];
  const lights = [];
  const appliances = [];
  const other = [];
  
  devices.forEach(device => {
    if (device.type === 'devices.types.sensor') {
      sensors.push(device);
    } else if (device.type === 'devices.types.light') {
      lights.push(device);
    } else if (['devices.types.air_purifier', 'devices.types.heater', 
                'devices.types.humidifier', 'devices.types.dehumidifier',
                'devices.types.ice_maker', 'devices.types.aroma_diffuser'].includes(device.type)) {
      appliances.push(device);
    } else {
      other.push(device);
    }
  });
  
  // Display summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('📱 DEVICE SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🌡️  Sensors:    ${sensors.length}`);
  console.log(`💡 Lights:     ${lights.length}`);
  console.log(`🏠 Appliances: ${appliances.length}`);
  console.log(`❓ Other:      ${other.length}`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Display sensors in detail (focus of this spike)
  if (sensors.length > 0) {
    console.log('🌡️  SENSORS (Focus for event monitoring):');
    console.log('═══════════════════════════════════════════════════════');
    sensors.forEach((device, index) => {
      console.log(`\n[${index + 1}] ${device.deviceName || 'Unnamed Device'}`);
      console.log(`    SKU: ${device.sku}`);
      console.log(`    Device ID: ${device.device}`);
      
      // Check for event capabilities
      const eventCapabilities = device.capabilities?.filter(cap => 
        cap.type === 'devices.capabilities.event'
      ) || [];
      
      if (eventCapabilities.length > 0) {
        console.log(`    ✅ Event Support: YES`);
        console.log(`    📡 MQTT Events:`);
        eventCapabilities.forEach(cap => {
          console.log(`       - ${cap.instance}`);
        });
      } else {
        console.log(`    ❌ Event Support: NO (polling required)`);
      }
      
      // Show other capabilities
      const otherCaps = device.capabilities?.filter(cap => 
        cap.type !== 'devices.capabilities.event'
      ) || [];
      
      if (otherCaps.length > 0) {
        console.log(`    🔧 Other Capabilities: ${otherCaps.length}`);
        otherCaps.forEach(cap => {
          console.log(`       - ${cap.instance} (${cap.type})`);
        });
      }
    });
    console.log('\n═══════════════════════════════════════════════════════');
  } else {
    console.log('⚠️  No sensors found in your Govee account');
    console.log('   Add sensors in Govee Home app to test event monitoring');
  }
  
  // Display lights summary (less detail)
  if (lights.length > 0) {
    console.log('\n💡 LIGHTS:');
    console.log('═══════════════════════════════════════════════════════');
    lights.forEach((device, index) => {
      console.log(`[${index + 1}] ${device.deviceName || device.sku} (${device.sku})`);
    });
    console.log('═══════════════════════════════════════════════════════');
  }
  
  // Display appliances summary
  if (appliances.length > 0) {
    console.log('\n🏠 APPLIANCES:');
    console.log('═══════════════════════════════════════════════════════');
    appliances.forEach((device, index) => {
      console.log(`[${index + 1}] ${device.deviceName || device.sku} (${device.sku})`);
    });
    console.log('═══════════════════════════════════════════════════════');
  }
  
  // Important note for Phase 12 testing
  const eventCapableSensors = sensors.filter(s => 
    s.capabilities?.some(cap => cap.type === 'devices.capabilities.event')
  );
  
  console.log('\n📝 PHASE 12 READINESS:');
  console.log('═══════════════════════════════════════════════════════');
  if (eventCapableSensors.length > 0) {
    console.log(`✅ ${eventCapableSensors.length} sensor(s) with MQTT event support found`);
    console.log('   Ready for Phase 12 MQTT event monitoring testing');
  } else if (sensors.length > 0) {
    console.log('⚠️  Sensors found but none support MQTT events');
    console.log('   Phase 12 will test MQTT connection only (no sensor events)');
  } else {
    console.log('❌ No sensors in account');
    console.log('   Phase 12 MQTT testing limited without event-capable sensors');
  }
  console.log('═══════════════════════════════════════════════════════\n');
}

// Run device discovery
getDevices();
