// Govee Device State Polling
// Polls device state at regular intervals (similar to Hue Remote polling)

import 'dotenv/config';

const GOVEE_API_BASE = 'https://openapi.api.govee.com';
const POLL_INTERVAL = 5000; // 5 seconds (for testing - faster than Hue's 30s)

// Store previous state for change detection
const previousStates = {};

async function getDeviceState(apiKey, sku, device) {
  try {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    console.log(`\n🔍 Requesting state for ${sku} / ${device.substring(0, 20)}...`);
    
    const response = await fetch(`${GOVEE_API_BASE}/router/api/v1/device/state`, {
      method: 'POST',
      headers: {
        'Govee-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId: requestId,
        payload: {
          sku: sku,
          device: device
        }
      })
    });
    
    const rawText = await response.text();
    console.log(`📥 RAW RESPONSE (${response.status}):\n${rawText}\n`);
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded (10,000 requests/day)');
      } else if (response.status === 401) {
        throw new Error('Authentication failed - check your GOVEE_API_KEY');
      }
      throw new Error(`API request failed (${response.status}): ${rawText}`);
    }
    
    const data = JSON.parse(rawText);
    
    console.log(`📊 PARSED DATA:`);
    console.log(JSON.stringify(data, null, 2));
    console.log('');
    
    if (data.code !== 200) {
      throw new Error(`API error (code ${data.code}): ${data.message || 'Unknown error'}`);
    }
    
    return data.payload;
    
  } catch (error) {
    throw error;
  }
}

function detectChanges(deviceKey, currentState, isOnline = true) {
  const timestamp = new Date().toISOString();
  
  if (!previousStates[deviceKey]) {
    // First poll - store state, don't log as change
    previousStates[deviceKey] = {
      state: currentState ? JSON.parse(JSON.stringify(currentState)) : null,
      online: isOnline
    };
    console.log(`[${timestamp}] Initial state captured for ${deviceKey} (${isOnline ? 'ONLINE' : 'OFFLINE'})`);
    return;
  }
  
  const prev = previousStates[deviceKey];
  const changes = [];
  
  // Check connectivity change
  if (prev.online !== isOnline) {
    changes.push({
      instance: 'connectivity',
      previousValue: prev.online ? 'ONLINE' : 'OFFLINE',
      currentValue: isOnline ? 'ONLINE' : 'OFFLINE'
    });
  }
  
  // If device went offline, that's the only change that matters
  if (!isOnline) {
    if (changes.length > 0) {
      console.log(`\n═══════════════════════════════════════════════════════`);
      console.log(`[${timestamp}] DEVICE OFFLINE DETECTED`);
      console.log(`Device: ${deviceKey}`);
      console.log(`  Status: ONLINE → OFFLINE`);
      console.log(`  ⚠️  Last known state: ${JSON.stringify(prev.state?.capabilities?.[0]?.state || 'unknown')}`);
      console.log(`═══════════════════════════════════════════════════════\n`);
    }
    
    // Update stored state
    previousStates[deviceKey] = {
      state: prev.state, // Keep last known state
      online: false
    };
    return;
  }
  
  // If device came back online
  if (prev.online === false && isOnline) {
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`[${timestamp}] DEVICE BACK ONLINE`);
    console.log(`Device: ${deviceKey}`);
    console.log(`  Status: OFFLINE → ONLINE`);
    console.log(`  Current state: ${JSON.stringify(currentState?.capabilities?.[0]?.state || 'unknown')}`);
    console.log(`═══════════════════════════════════════════════════════\n`);
  }
  
  // Compare capabilities (only if device is online)
  if (currentState?.capabilities && prev.state?.capabilities && isOnline) {
    currentState.capabilities.forEach((current, index) => {
      const previous = prev.state.capabilities[index];
      
      if (!previous) return;
      
      // Check if state changed
      if (JSON.stringify(current.state) !== JSON.stringify(previous.state)) {
        changes.push({
          instance: current.instance,
          previousValue: previous.state,
          currentValue: current.state
        });
      }
    });
  }
  
  // Log capability changes
  const capabilityChanges = changes.filter(c => c.instance !== 'connectivity');
  if (capabilityChanges.length > 0) {
    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`[${timestamp}] STATE CHANGE DETECTED`);
    console.log(`Device: ${deviceKey}`);
    capabilityChanges.forEach(change => {
      console.log(`  ${change.instance}:`);
      console.log(`    Before: ${JSON.stringify(change.previousValue)}`);
      console.log(`    After:  ${JSON.stringify(change.currentValue)}`);
    });
    console.log(`═══════════════════════════════════════════════════════\n`);
  }
  
  // Update stored state
  previousStates[deviceKey] = {
    state: currentState ? JSON.parse(JSON.stringify(currentState)) : prev.state,
    online: isOnline
  };
}

async function pollDevices(apiKey, devices) {
  const timestamp = new Date().toISOString();
  
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`[${timestamp}] POLLING ${devices.length} DEVICE(S)`);
  console.log(`═══════════════════════════════════════════════════════`);
  
  for (const device of devices) {
    const deviceKey = `${device.deviceName} (${device.sku})`;
    
    console.log(`\n▶ Checking: ${deviceKey}`);
    
    try {
      const state = await getDeviceState(apiKey, device.sku, device.device);
      
      console.log(`✅ State received for ${deviceKey}`);
      
      // Check if device has valid state data
      const hasCapabilities = state && state.capabilities && state.capabilities.length > 0;
      
      console.log(`   Has capabilities: ${hasCapabilities}`);
      console.log(`   Capabilities count: ${state?.capabilities?.length || 0}`);
      
      // CRITICAL: Assume if no capabilities or empty, device is offline
      const isOnline = hasCapabilities;
      
      console.log(`   ⚡ Device status: ${isOnline ? 'ONLINE' : 'OFFLINE (no capabilities returned)'}`);
      
      detectChanges(deviceKey, state, isOnline);
      
    } catch (error) {
      console.error(`\n❌ Error polling ${deviceKey}:`);
      console.error(`   Message: ${error.message}`);
      
      // Assume device offline on any error
      console.log(`   ⚡ Treating as OFFLINE due to error`);
      detectChanges(deviceKey, null, false);
    }
  }
  
  console.log(`\n═══════════════════════════════════════════════════════\n`);
}

async function startPolling() {
  const apiKey = process.env.GOVEE_API_KEY;
  
  if (!apiKey) {
    console.error('❌ Missing GOVEE_API_KEY!');
    console.error('Get API key from Govee Home app: Settings → Apply for API Key');
    process.exit(1);
  }
  
  console.log('🔍 Fetching device list...\n');
  
  // Get devices first
  const devicesResponse = await fetch(`${GOVEE_API_BASE}/router/api/v1/user/devices`, {
    method: 'GET',
    headers: {
      'Govee-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
  });
  
  if (!devicesResponse.ok) {
    console.error('❌ Failed to fetch devices');
    process.exit(1);
  }
  
  const devicesData = await devicesResponse.json();
  
  if (devicesData.code !== 200 || !devicesData.data || devicesData.data.length === 0) {
    console.error('❌ No devices found');
    process.exit(1);
  }
  
  // Focus on lights (your devices)
  const lights = devicesData.data.filter(d => d.type === 'devices.types.light');
  
  if (lights.length === 0) {
    console.error('❌ No lights found to monitor');
    process.exit(1);
  }
  
  console.log(`✅ Found ${lights.length} light(s) to monitor:`);
  lights.forEach(light => {
    console.log(`   - ${light.deviceName || 'Unnamed'} (${light.sku})`);
  });
  
  console.log(`\n📊 Polling interval: ${POLL_INTERVAL / 1000} seconds (matching Hue Remote API)`);
  console.log(`⚠️  Rate limit: 10,000 requests/day = ${Math.floor(10000 / lights.length / 24)} polls/hour/device`);
  console.log(`\n🎧 Monitoring for state changes... (Ctrl+C to stop)\n`);
  
  // Initial poll
  await pollDevices(apiKey, lights);
  
  // Start polling loop
  setInterval(async () => {
    await pollDevices(apiKey, lights);
  }, POLL_INTERVAL);
}

// Start polling
startPolling().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
