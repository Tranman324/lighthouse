// Hue Remote API Device Discovery
// Retrieves devices and filters for contact/motion sensors

import 'dotenv/config';

const HUE_API_BASE = 'https://api.meethue.com';

async function getDevices() {
  const accessToken = process.env.HUE_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.error('❌ Missing HUE_ACCESS_TOKEN!');
    console.error('Run node hue-auth.js first to obtain access token');
    process.exit(1);
  }
  
  try {
    console.log('🔍 Querying Hue Remote API for devices...\n');
    
    // First, get the bridge/whitelist info
    // Remote API requires bridge selection first
    const bridgesResponse = await fetch(`${HUE_API_BASE}/route/api/0/config`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!bridgesResponse.ok) {
      // Try alternative endpoint structure for Remote API
      console.log('⚠️  Trying alternative Remote API endpoint...\n');
      
      // Query using the v2 resource endpoint
      const response = await fetch(`${HUE_API_BASE}/route/clip/v2/resource`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error('📋 Response details:', error);
        throw new Error(`API request failed (${response.status}): Check token scope - may need 'all' scope instead of just 'sensors'`);
      }
      
      const data = await response.json();
      processResourceData(data);
      return;
    }
    
    // If we got bridge config, use v1 API pattern
    const bridgeData = await bridgesResponse.json();
    console.log('📡 Bridge config retrieved\n');
    
    // Get all resource types
    const [sensorsResponse, lightsResponse, groupsResponse] = await Promise.all([
      fetch(`${HUE_API_BASE}/route/api/0/sensors`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }),
      fetch(`${HUE_API_BASE}/route/api/0/lights`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }),
      fetch(`${HUE_API_BASE}/route/api/0/groups`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }),
    ]);
    
    const sensors = await sensorsResponse.json();
    const lights = await lightsResponse.json();
    const groups = await groupsResponse.json();
    
    // Display lights
    const lightArray = Object.entries(lights);
    console.log(`💡 Lights: ${lightArray.length}\n`);
    lightArray.forEach(([id, light]) => {
      console.log(`Light ${id}:`);
      console.log(`  Name:       ${light.name}`);
      console.log(`  Type:       ${light.type}`);
      console.log(`  Model:      ${light.modelid}`);
      console.log(`  On:         ${light.state?.on}`);
      console.log(`  Brightness: ${light.state?.bri}`);
      console.log(`  Reachable:  ${light.state?.reachable}`);
      console.log('');
    });
    
    // Display groups/rooms
    const groupArray = Object.entries(groups);
    console.log(`🏠 Rooms/Groups: ${groupArray.length}\n`);
    groupArray.forEach(([id, group]) => {
      console.log(`Group ${id}:`);
      console.log(`  Name:   ${group.name}`);
      console.log(`  Type:   ${group.type}`);
      console.log(`  Lights: ${group.lights?.join(', ')}`);
      console.log('');
    });
    
    // Display sensors
    const sensorArray = Object.entries(sensors);
    console.log(`🎯 Sensors: ${sensorArray.length}\n`);
    
    // Filter for relevant sensor types (ZLL = Zigbee Light Link)
    const relevantSensors = sensorArray.filter(([id, sensor]) => 
      sensor.type?.includes('ZLLPresence') || // Motion sensors
      sensor.type?.includes('ZLLLightLevel') || // Light sensors (part of motion sensor)
      sensor.type?.includes('ZLLTemperature') || // Temperature sensors
      sensor.type?.includes('Contact') || // Contact sensors (rare)
      sensor.type?.includes('OpenClose') // Open/close sensors
    );
    
    if (relevantSensors.length === 0) {
      console.log('⚠️  No motion or contact sensors found');
    } else {
      console.log(`📍 Relevant sensors for monitoring: ${relevantSensors.length}\n`);
      
      relevantSensors.forEach(([id, sensor], index) => {
        console.log(`Sensor ${index + 1}:`);
        console.log(`  ID:        ${id}`);
        console.log(`  Name:      ${sensor.name}`);
        console.log(`  Type:      ${sensor.type}`);
        console.log(`  Model:     ${sensor.modelid}`);
        
        // Display current state
        if (sensor.state) {
          if (sensor.state.presence !== undefined) {
            console.log(`  Presence:  ${sensor.state.presence ? 'Detected' : 'Clear'}`);
          }
          if (sensor.state.temperature !== undefined) {
            console.log(`  Temp:      ${sensor.state.temperature / 100}°C`);
          }
          if (sensor.state.lightlevel !== undefined) {
            console.log(`  Light:     ${sensor.state.lightlevel} lux`);
          }
          if (sensor.state.open !== undefined) {
            console.log(`  State:     ${sensor.state.open ? 'OPEN' : 'CLOSED'}`);
          }
          if (sensor.state.lastupdated) {
            console.log(`  Updated:   ${sensor.state.lastupdated}`);
          }
        }
        
        console.log(`  Reachable: ${sensor.config?.reachable}`);
        console.log(`  Battery:   ${sensor.config?.battery}%`);
        console.log('');
      });
    }
    
    console.log('\n📊 Summary:');
    console.log(`  Lights:  ${lightArray.length}`);
    console.log(`  Groups:  ${groupArray.length}`);
    console.log(`  Sensors: ${sensorArray.length} (${relevantSensors.length} relevant for monitoring)`);
    console.log('\n💡 Hue focuses on lighting - sensors are optional accessories');
    console.log('   For comparison: Yosmart found 4 door sensors in Phase 3');
    
  } catch (error) {
    console.error('\n❌ Device discovery failed:', error.message);
    
    if (error.message.includes('403')) {
      console.error('\n💡 Troubleshooting:');
      console.error('   - Token may have expired (check expiration from hue-auth.js output)');
      console.error('   - May need broader OAuth scope (try re-running hue-auth.js)');
      console.error('   - Remote API access may require additional permissions');
    }
    
    process.exit(1);
  }
}

// Helper function for v2 API response
function processResourceData(data) {
  const sensors = data.data?.filter(resource => 
    resource.type === 'motion' || 
    resource.type === 'contact' ||
    resource.type === 'device_power' ||
    resource.type === 'zigbee_connectivity'
  ) || [];
  
  const devices = data.data?.filter(resource => resource.type === 'device') || [];
  
  console.log(`🎯 Found ${sensors.length} sensors\n`);
  
  if (sensors.length === 0) {
    console.log('⚠️  No contact or motion sensors found');
    return;
  }
  
  sensors.forEach((sensor, index) => {
    console.log(`Sensor ${index + 1}:`);
    console.log(`  ID:      ${sensor.id}`);
    console.log(`  Type:    ${sensor.type}`);
    
    if (sensor.owner?.rid) {
      const device = devices.find(d => d.id === sensor.owner.rid);
      if (device) {
        console.log(`  Name:    ${device.metadata?.name || 'Unknown'}`);
      }
    }
    
    if (sensor.motion) {
      console.log(`  Motion:  ${sensor.motion.motion ? 'Detected' : 'Clear'}`);
    }
    
    console.log('');
  });
}

getDevices();

// Helper function for v2 API response
