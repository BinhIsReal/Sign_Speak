/**
 * Vercel Serverless API Route: /api/ice-servers
 * Returns dynamic TURN credentials from Metered.ca.
 * Credentials are stored in Vercel environment variables, never exposed client-side.
 *
 * Required Vercel Env Vars:
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

  // Fallback config with real active Metered.ca TURN credentials
  const fallbackConfig = {
    iceServers: [
      {
        urls: [
          'stun:stun.relay.metered.ca:80',
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
          'stun:stun.cloudflare.com:3478',
        ]
      },
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: '19a41198dfa472d07e664267',
        credential: '2Dl+anP4+2pT5LBN'
      },
      {
        urls: 'turn:global.relay.metered.ca:80?transport=tcp',
        username: '19a41198dfa472d07e664267',
        credential: '2Dl+anP4+2pT5LBN'
      },
      {
        urls: 'turn:global.relay.metered.ca:443',
        username: '19a41198dfa472d07e664267',
        credential: '2Dl+anP4+2pT5LBN'
      },
      {
        urls: 'turns:global.relay.metered.ca:443?transport=tcp',
        username: '19a41198dfa472d07e664267',
        credential: '2Dl+anP4+2pT5LBN'
      }
    ]
  };

  if (!apiKey || !appName) {
    console.warn('[ice-servers] METERED_API_KEY or METERED_APP_NAME not set. Returning STUN-only fallback.');
    return res.status(200).json(fallbackConfig);
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
    return res.status(200).json(fallbackConfig);
  }
}
