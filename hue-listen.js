// Hue Remote API Event Monitoring
// Polls for device state changes (Remote API doesn't support push events)

import 'dotenv/config';

const HUE_API_BASE = 'https://api.meethue.com';
const POLL_INTERVAL = 30000; // 30 seconds - balance between responsiveness and API load

// Track previous states for change detection
const previousStates = {
  lights: {},
  sensors: {},
};

async function pollDeviceStates(accessToken) {
  try {
    // Query all device endpoints in parallel
    const [sensorsResponse, lightsResponse] = await Promise.all([
      fetch(`${HUE_API_BASE}/route/api/0/sensors`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }),
      fetch(`${HUE_API_BASE}/route/api/0/lights`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }),
    ]);
    
    if (!sensorsResponse.ok || !lightsResponse.ok) {
      throw new Error(`API request failed: Sensors ${sensorsResponse.status}, Lights ${lightsResponse.status}`);
    }
    
    const sensors = await sensorsResponse.json();
    const lights = await lightsResponse.json();
    
    // Check for light state changes
    Object.entries(lights).forEach(([id, light]) => {
      const prevLight = previousStates.lights[id];
      
      if (prevLight) {
        // Check on/off state change
        if (light.state?.on !== prevLight.state?.on) {
          console.log(`[${new Date().toISOString()}] Light "${light.name}" → ${light.state.on ? 'ON' : 'OFF'}`);
        }
        
        // Check brightness change (significant threshold to avoid noise)
        if (light.state?.bri !== undefined && prevLight.state?.bri !== undefined) {
          const brightnessDiff = Math.abs(light.state.bri - prevLight.state.bri);
          if (brightnessDiff > 20) { // Only log significant changes
            console.log(`[${new Date().toISOString()}] Light "${light.name}" brightness → ${light.state.bri}/254`);
          }
        }
        
        // Check reachability change
        if (light.state?.reachable !== prevLight.state?.reachable) {
          console.log(`[${new Date().toISOString()}] Light "${light.name}" reachability → ${light.state.reachable ? 'ONLINE' : 'OFFLINE'}`);
        }
      }
      
      // Store current state
      previousStates.lights[id] = JSON.parse(JSON.stringify(light));
    });
    
    // Check for sensor state changes
    Object.entries(sensors).forEach(([id, sensor]) => {
      const prevSensor = previousStates.sensors[id];
      
      if (prevSensor) {
        // Motion sensor presence change
        if (sensor.state?.presence !== undefined && sensor.state.presence !== prevSensor.state?.presence) {
          console.log(`[${new Date().toISOString()}] Sensor "${sensor.name}" motion → ${sensor.state.presence ? 'DETECTED' : 'CLEAR'}`);
        }
        
        // Contact sensor state change (open/close)
        if (sensor.state?.open !== undefined && sensor.state.open !== prevSensor.state?.open) {
          console.log(`[${new Date().toISOString()}] Sensor "${sensor.name}" → ${sensor.state.open ? 'OPEN' : 'CLOSED'}`);
        }
        
        // Temperature change (only log significant changes)
        if (sensor.state?.temperature !== undefined && prevSensor.state?.temperature !== undefined) {
          const tempDiff = Math.abs(sensor.state.temperature - prevSensor.state.temperature);
          if (tempDiff >= 100) { // 1°C difference (values in 0.01°C units)
            console.log(`[${new Date().toISOString()}] Sensor "${sensor.name}" temperature → ${sensor.state.temperature / 100}°C`);
          }
        }
        
        // Battery level change
        if (sensor.config?.battery !== undefined && sensor.config.battery !== prevSensor.config?.battery) {
          console.log(`[${new Date().toISOString()}] Sensor "${sensor.name}" battery → ${sensor.config.battery}%`);
        }
        
        // Reachability change
        if (sensor.config?.reachable !== prevSensor.config?.reachable) {
          console.log(`[${new Date().toISOString()}] Sensor "${sensor.name}" reachability → ${sensor.config.reachable ? 'ONLINE' : 'OFFLINE'}`);
        }
      }
      
      // Store current state
      previousStates.sensors[id] = JSON.parse(JSON.stringify(sensor));
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Polling error:`, error.message);
  }
}

async function startMonitoring() {
  const accessToken = process.env.HUE_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.error('❌ Missing HUE_ACCESS_TOKEN!');
    console.error('Run node hue-auth.js first to obtain access token');
    process.exit(1);
  }
  
  console.log('🔍 Starting Hue Remote API event monitoring...\n');
  console.log(`⚠️  Note: Hue Remote API does NOT support push events (webhooks/SSE)`);
  console.log(`   Using polling approach with ${POLL_INTERVAL / 1000}s interval\n`);
  console.log(`📊 This introduces ${POLL_INTERVAL / 1000}s minimum latency vs. Yosmart MQTT (milliseconds)\n`);
  console.log('🎯 Monitoring all lights and sensors for state changes...\n');
  console.log('Press Ctrl+C to stop monitoring\n');
  
  // Initial poll to populate previous states (don't log changes)
  try {
    const [sensorsResponse, lightsResponse] = await Promise.all([
      fetch(`${HUE_API_BASE}/route/api/0/sensors`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }),
      fetch(`${HUE_API_BASE}/route/api/0/lights`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      }),
    ]);
    
    const sensors = await sensorsResponse.json();
    const lights = await lightsResponse.json();
    
    Object.entries(lights).forEach(([id, light]) => {
      previousStates.lights[id] = JSON.parse(JSON.stringify(light));
    });
    
    Object.entries(sensors).forEach(([id, sensor]) => {
      previousStates.sensors[id] = JSON.parse(JSON.stringify(sensor));
    });
    
    console.log(`✅ Initial state captured: ${Object.keys(lights).length} lights, ${Object.keys(sensors).length} sensors\n`);
    console.log('--- Event Log ---\n');
    
  } catch (error) {
    console.error('❌ Failed to initialize:', error.message);
    process.exit(1);
  }
  
  // Start polling loop
  setInterval(() => pollDeviceStates(accessToken), POLL_INTERVAL);
}

startMonitoring();
