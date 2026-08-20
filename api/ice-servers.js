/**
 * Vercel Serverless API Route: /api/ice-servers
 * Returns dynamic TURN credentials from Metered.ca.
 * Falls back to Open Relay Project (free, always-available TURN) if Metered is not configured.
 *
 * Required Vercel Env Vars (optional — fallback is used if not set):
 *   METERED_API_KEY   - Your Metered.ca API key
 *   METERED_APP_NAME  - Your Metered.ca app name (e.g. "sign-speak")
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.METERED_API_KEY;
  const appName = process.env.METERED_APP_NAME;

  /**
   * Open Relay Project — completely free TURN server, no signup needed.
   * Credentials: openrelayproject / openrelayproject
   * Suitable for production apps with moderate usage.
   */
  const openRelayFallback = {
    iceServers: [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
          'stun:stun.cloudflare.com:3478',
          'stun:openrelay.metered.ca:80',
        ]
      },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:80?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turns:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  };

  if (!apiKey || !appName) {
    console.log('[ice-servers] METERED env vars not set — returning Open Relay fallback.');
    return res.status(200).json(openRelayFallback);
  }

  try {
    const meteredUrl = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`;
    const response = await fetch(meteredUrl, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      throw new Error(`Metered API responded with status: ${response.status}`);
    }

    const iceServers = await response.json();

    if (!Array.isArray(iceServers) || iceServers.length === 0) {
      throw new Error('Metered API returned empty ICE servers array');
    }

    console.log(`[ice-servers] Returning ${iceServers.length} ICE server entries from Metered.ca`);
    return res.status(200).json({ iceServers });

  } catch (error) {
    console.error('[ice-servers] Failed to fetch from Metered.ca:', error.message);
    return res.status(200).json(openRelayFallback);
  }
}
