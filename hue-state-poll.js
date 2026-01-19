// Hue Remote API Device State Polling
// Polls device state at regular intervals to test offline detection

import 'dotenv/config';

const HUE_API_BASE = 'https://api.meethue.com';
const POLL_INTERVAL = 5000; // 5 seconds (for testing)

// Store previous state for change detection
const previousStates = {};

async function getDeviceState(accessToken) {
  try {
    console.log(`\n🔍 Requesting state from Hue Remote API...`);
    
    // Query lights endpoint (v1 API)
    const response = await fetch(`${HUE_API_BASE}/route/api/0/lights`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    const rawText = await response.text();
    console.log(`📥 RAW RESPONSE (${response.status}):\n${rawText.substring(0, 500)}...\n`);
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication failed - check your HUE_ACCESS_TOKEN');
      }
      throw new Error(`API request failed (${response.status}): ${rawText}`);
    }
    
    const data = JSON.parse(rawText);
    
    console.log(`📊 PARSED DATA (keys):`);
    console.log(`   Light IDs found: ${Object.keys(data).join(', ')}`);
    console.log('');
    
    return data;
    
  } catch (error) {
    throw error;
  }
}

function detectChanges(lightId, lightData) {
  const timestamp = new Date().toISOString();
  const deviceKey = `${lightData.name} (ID: ${lightId})`;
  
  if (!previousStates[lightId]) {
    // First poll - store state
    previousStates[lightId] = {
      state: JSON.parse(JSON.stringify(lightData.state)),
      reachable: lightData.state.reachable
    };
    console.log(`[${timestamp}] Initial state captured for ${deviceKey}`);
    console.log(`   Reachable: ${lightData.state.reachable ? '✅ YES' : '❌ NO'}`);
    console.log(`   On: ${lightData.state.on ? 'YES' : 'NO'}`);
    console.log(`   Brightness: ${lightData.state.bri || 'N/A'}`);
    return;
  }
  
  const prev = previousStates[lightId];
  const changes = [];
  
  // Check reachability change (CRITICAL for offline detection)
  if (prev.reachable !== lightData.state.reachable) {
    changes.push({
      property: 'reachable',
      previousValue: prev.reachable,
      currentValue: lightData.state.reachable
    });
  }
  
  // Check on/off change
  if (prev.state.on !== lightData.state.on) {
    changes.push({
      property: 'on',
      previousValue: prev.state.on,
      currentValue: lightData.state.on
    });
  }
  
  // Check brightness change (if light was/is on)
  if (prev.state.bri !== lightData.state.bri) {
    changes.push({
      property: 'brightness',
      previousValue: prev.state.bri,
      currentValue: lightData.state.bri
    });
  }
  
  // Log changes
  if (changes.length > 0) {
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`[${timestamp}] STATE CHANGE DETECTED`);
    console.log(`Device: ${deviceKey}`);
    
    changes.forEach(change => {
      if (change.property === 'reachable') {
        console.log(`  🔌 CONNECTIVITY CHANGE:`);
        console.log(`     Before: ${change.previousValue ? '✅ ONLINE' : '❌ OFFLINE'}`);
        console.log(`     After:  ${change.currentValue ? '✅ ONLINE' : '❌ OFFLINE'}`);
      } else {
        console.log(`  ${change.property}:`);
        console.log(`     Before: ${change.previousValue}`);
        console.log(`     After:  ${change.currentValue}`);
      }
    });
    
    console.log(`═══════════════════════════════════════════════════════\n`);
  }
  
  // Update stored state
  previousStates[lightId] = {
    state: JSON.parse(JSON.stringify(lightData.state)),
    reachable: lightData.state.reachable
  };
}

async function pollDevices(accessToken) {
  const timestamp = new Date().toISOString();
  
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`[${timestamp}] POLLING HUE REMOTE API`);
  console.log(`═══════════════════════════════════════════════════════`);
  
  try {
    const lights = await getDeviceState(accessToken);
    
    const lightIds = Object.keys(lights);
    console.log(`✅ Retrieved ${lightIds.length} light(s)\n`);
    
    for (const lightId of lightIds) {
      const light = lights[lightId];
      console.log(`▶ Checking: ${light.name} (ID: ${lightId})`);
      console.log(`   Type: ${light.type}`);
      console.log(`   Model: ${light.modelid}`);
      console.log(`   Reachable: ${light.state.reachable ? '✅ YES' : '❌ NO'}`);
      console.log(`   On: ${light.state.on ? 'YES' : 'NO'}`);
      console.log(`   Brightness: ${light.state.bri || 'N/A'}`);
      
      detectChanges(lightId, light);
    }
    
  } catch (error) {
    console.error(`\n❌ Error polling devices:`);
    console.error(`   Message: ${error.message}`);
  }
  
  console.log(`\n═══════════════════════════════════════════════════════\n`);
}

async function startPolling() {
  const accessToken = process.env.HUE_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.error('❌ Missing HUE_ACCESS_TOKEN!');
    console.error('Run node hue-auth.js first to obtain access token');
    process.exit(1);
  }
  
  console.log('🔦 Hue Remote API State Polling Test');
  console.log('════════════════════════════════════════════════════════');
  console.log(`📊 Polling interval: ${POLL_INTERVAL / 1000} seconds`);
  console.log(`🎯 Testing: Can Hue detect when bulbs are unplugged?`);
  console.log(`🔑 Key field: "reachable" (true = online, false = offline)`);
  console.log('════════════════════════════════════════════════════════');
  console.log('\n🎧 Monitoring for state changes... (Ctrl+C to stop)\n');
  
  // Initial poll
  await pollDevices(accessToken);
  
  // Start polling loop
  setInterval(async () => {
    await pollDevices(accessToken);
  }, POLL_INTERVAL);
}

// Start polling
startPolling().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
