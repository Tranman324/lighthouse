// Hue Remote API OAuth 2.0 Authorization Code Flow with PKCE
// Obtains access and refresh tokens for cloud API access

import 'dotenv/config';
import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';

// OAuth endpoints
const AUTH_URL = 'https://api.meethue.com/v2/oauth2/authorize';
const TOKEN_URL = 'https://api.meethue.com/v2/oauth2/token';
const CALLBACK_URL = 'http://localhost:3000/callback';
const PORT = 3000;

// Generate PKCE code verifier and challenge
function generatePKCE() {
  // Code verifier: random 43-128 character string
  const verifier = crypto.randomBytes(32).toString('base64url');
  
  // Code challenge: SHA256 hash of verifier, base64url encoded
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  
  return { verifier, challenge };
}

// Build authorization URL for user consent
function buildAuthorizationURL(clientId, codeChallenge) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: CALLBACK_URL,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'sensors', // Scope for sensor access
  });
  
  return `${AUTH_URL}?${params.toString()}`;
}

// Exchange authorization code for tokens
async function exchangeCodeForTokens(code, verifier, clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: CALLBACK_URL,
    code_verifier: verifier,
    client_id: clientId,
    client_secret: clientSecret,
  });
  
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${error}`);
  }
  
  return await response.json();
}

// Start OAuth flow
async function authenticate() {
  const clientId = process.env.HUE_CLIENT_ID;
  const clientSecret = process.env.HUE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.error('❌ Missing credentials!');
    console.error('Please set HUE_CLIENT_ID and HUE_CLIENT_SECRET in .env file');
    console.error('Get these from: https://developers.meethue.com/');
    process.exit(1);
  }
  
  // Generate PKCE parameters
  const { verifier, challenge } = generatePKCE();
  const authUrl = buildAuthorizationURL(clientId, challenge);
  
  console.log('🔐 Starting Hue Remote API OAuth flow...\n');
  console.log('📋 Step 1: Authorize the application');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n👆 Click the link above or copy/paste into your browser');
  console.log('   Log in to your Philips Hue account and approve the app\n');
  console.log('⏳ Waiting for callback on http://localhost:3000/callback...\n');
  
  // Start callback server
  return new Promise((resolve, reject) => {
    let codeProcessed = false; // Prevent double processing
    
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      
      // Ignore favicon requests
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      
      if (url.pathname === '/callback') {
        // Prevent processing the same code twice
        if (codeProcessed) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Already processed</h1><p>You can close this window.</p>');
          return;
        }
        
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        
        if (error) {
          codeProcessed = true;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authorization Failed</h1><p>Error: ${error}</p>`);
          server.close();
          reject(new Error(`Authorization failed: ${error}`));
          return;
        }
        
        if (!code) {
          codeProcessed = true;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Missing Code</h1><p>No authorization code received</p>');
          server.close();
          reject(new Error('No authorization code in callback'));
          return;
        }
        
        // Mark as processed before async operations
        codeProcessed = true;
        
        try {
          console.log('✅ Authorization code received!');
          console.log('🔄 Exchanging code for access token...\n');
          
          // Exchange code for tokens
          const tokens = await exchangeCodeForTokens(code, verifier, clientId, clientSecret);
          
          // Success response to browser
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <h1>✅ Authorization Complete!</h1>
            <p>Access token obtained successfully.</p>
            <p>You can close this window and return to the terminal.</p>
          `);
          
          server.close();
          resolve(tokens);
          
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Token Exchange Failed</h1><p>${error.message}</p>`);
          server.close();
          reject(error);
        }
      }
    });
    
    server.listen(PORT, () => {
      console.log(`🌐 Callback server listening on port ${PORT}...`);
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timeout - no callback received after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

// Main execution
try {
  const tokens = await authenticate();
  
  console.log('✅ OAuth flow complete!\n');
  console.log('Token details:');
  console.log(`  Access Token: ${tokens.access_token.substring(0, 20)}...`);
  console.log(`  Refresh Token: ${tokens.refresh_token ? tokens.refresh_token.substring(0, 20) + '...' : 'Not provided'}`);
  console.log(`  Token Type: ${tokens.token_type}`);
  console.log(`  Expires In: ${tokens.expires_in ? tokens.expires_in + ' seconds' : 'Unknown'}`);
  
  // Persist tokens to .env
  const envLine = `\nHUE_ACCESS_TOKEN=${tokens.access_token}`;
  const refreshLine = tokens.refresh_token ? `\nHUE_REFRESH_TOKEN=${tokens.refresh_token}` : '';
  
  fs.appendFileSync('.env', envLine + refreshLine);
  
  console.log('\n💾 Tokens saved to .env file');
  console.log(`📅 Completed: ${new Date().toISOString()}`);
  
} catch (error) {
  console.error('\n❌ Authentication failed:', error.message);
  process.exit(1);
}
