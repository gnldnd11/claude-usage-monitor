'use strict';
// Independent OAuth sign-in so the panel has its OWN token (its own rate-limit budget),
// instead of competing with Claude Code for the shared one. Same flow claude-rate-monitor
// uses. Every step logs to the output channel so a failure is diagnosable, not a blind "failed".
const vscode = require('vscode');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTH_URL = 'https://claude.com/cai/oauth/authorize';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const SCOPES = 'user:profile user:inference';
const SECRET_KEY = 'claude-usage-crab-oauth-token';

class AuthManager {
  constructor(secrets, log) {
    this.secrets = secrets;
    this.log = log;
    this.token = null;
  }
  _l(m) { if (this.log) this.log.appendLine('[' + new Date().toLocaleTimeString() + '] sign-in: ' + m); }

  async initialize() {
    const stored = await this.secrets.get(SECRET_KEY);
    if (stored) { try { this.token = JSON.parse(stored); return true; } catch (e) { return false; } }
    return false;
  }
  isLoggedIn() { return !!(this.token && this.token.access_token); }
  getAccessToken() { return this.token ? this.token.access_token : null; }
  async logout() { this.token = null; await this.secrets.delete(SECRET_KEY); }

  // Refresh the access token before it expires so one sign-in lasts indefinitely.
  async ensureFresh() {
    if (!this.token) return false;
    if (this.token.expires_at && Date.now() > this.token.expires_at - 5 * 60000) return await this.refresh();
    return true;
  }

  refresh() {
    return new Promise((resolve) => {
      if (!this.token || !this.token.refresh_token) { resolve(false); return; }
      const body = JSON.stringify({ grant_type: 'refresh_token', refresh_token: this.token.refresh_token, client_id: CLIENT_ID });
      const parsed = new URL(TOKEN_URL);
      const req = https.request({
        hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (e) {}
          if (json && json.access_token) {
            this.token = {
              access_token: json.access_token,
              refresh_token: json.refresh_token || this.token.refresh_token,
              expires_at: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined
            };
            this.secrets.store(SECRET_KEY, JSON.stringify(this.token));
            this._l('token refreshed (status ' + res.statusCode + ')');
            resolve(true);
          } else {
            this._l('token refresh failed (status ' + res.statusCode + ') — sign in again');
            this.token = null; // force re-sign-in
            resolve(false);
          }
        });
      });
      req.on('error', (e) => { this._l('token refresh error: ' + e.message); resolve(false); });
      req.write(body); req.end();
    });
  }

  login() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    return new Promise((resolveRaw) => {
      let timeout, settled = false;
      const resolve = (v) => { if (settled) return; settled = true; clearTimeout(timeout); resolveRaw(v); };
      const server = http.createServer(async (req, res) => {
        this._l('callback hit: ' + req.url);
        if (!req.url || !req.url.startsWith('/callback')) { res.writeHead(404); res.end(); return; }
        const parsed = new URL(req.url, 'http://localhost');
        const code = parsed.searchParams.get('code');
        const returnedState = parsed.searchParams.get('state');
        this._l('callback params: code=' + (code ? 'present' : 'MISSING') + ' state=' + (returnedState === state ? 'match' : 'MISMATCH'));
        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h2>Sign-in failed</h2><p>Invalid response. Close this tab.</p>');
          server.close(); resolve(false); return;
        }
        try {
          const port = server.address().port;
          this._l('exchanging code for token...');
          const token = await this.exchangeCode(code, codeVerifier, 'http://localhost:' + port + '/callback', state);
          this.token = token;
          await this.secrets.store(SECRET_KEY, JSON.stringify(token));
          this._l('token stored OK');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h2>Signed in</h2><p>Close this tab and return to VS Code.</p>');
          server.close(); resolve(true);
        } catch (err) {
          this._l('token exchange FAILED: ' + (err && err.message ? err.message : String(err)));
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end('<h2>Sign-in failed</h2><p>' + (err && err.message ? err.message : String(err)) + '</p>');
          server.close(); resolve(false);
        }
      });

      server.on('error', (e) => { this._l('callback server error: ' + e.message); resolve(false); });
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const params = new URLSearchParams({
          code: 'true', client_id: CLIENT_ID, response_type: 'code',
          redirect_uri: 'http://localhost:' + port + '/callback', scope: SCOPES,
          code_challenge: codeChallenge, code_challenge_method: 'S256', state: state
        });
        const authUrl = AUTH_URL + '?' + params.toString();
        this._l('callback server listening on port ' + port + '; opening browser');
        this._l('auth url: ' + authUrl);
        vscode.env.openExternal(vscode.Uri.parse(authUrl));
      });
      timeout = setTimeout(() => { this._l('timed out after 180s waiting for callback'); try { server.close(); } catch (e) {} resolve(false); }, 180000);
    });
  }

  exchangeCode(code, codeVerifier, redirectUri, state) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        grant_type: 'authorization_code', client_id: CLIENT_ID, code: code,
        code_verifier: codeVerifier, redirect_uri: redirectUri, state: state
      });
      const parsed = new URL(TOKEN_URL);
      const req = https.request({
        hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          this._l('token endpoint status ' + res.statusCode);
          try {
            const json = JSON.parse(data);
            if (json.access_token) {
              resolve({ access_token: json.access_token, refresh_token: json.refresh_token,
                expires_at: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined });
            } else {
              reject(new Error(json.error_description || json.error || ('no access_token (status ' + res.statusCode + ', body ' + data.slice(0, 120) + ')')));
            }
          } catch (e) { reject(new Error('bad token response (status ' + res.statusCode + '): ' + data.slice(0, 120))); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = { AuthManager };
