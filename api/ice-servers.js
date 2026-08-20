/**
 * Vercel Serverless API Route: /api/ice-servers
 * Returns dynamic TURN credentials from Metered.ca (Free 50GB/month WebRTC TURN).
 * When METERED_APP_NAME and METERED_API_KEY are configured in Vercel Environment Variables,
 * it returns high-speed worldwide TURN relays (Singapore, Tokyo, US, EU) for cross-network P2P traversal.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.METERED_API_KEY || '00eeb792619481b2bccdab2ef10c9c257545';
  const appName = process.env.METERED_APP_NAME || 'sigbspeak';

  // Comprehensive global STUN servers list
  const defaultStunServers = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
        'stun:stun.services.mozilla.com:3478',
        'stun:stun.nextcloud.com:443',
        'stun:global.stun.twilio.com:3478'
      ]
    }
  ];

  // Static fallback Metered TURN credentials in case REST API is unreachable
  const staticTurnFallback = [
    ...defaultStunServers,
    {
      urls: 'stun:stun.relay.metered.ca:80'
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
  ];

  try {
    const meteredUrl = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`;
    const response = await fetch(meteredUrl, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      throw new Error(`Metered API responded with status: ${response.status}`);
    }

    const turnIceServers = await response.json();

    if (!Array.isArray(turnIceServers) || turnIceServers.length === 0) {
      throw new Error('Metered API returned empty ICE servers array');
    }

    // Merge standard STUN servers with Metered dynamic TURN servers
    const combinedServers = [...defaultStunServers, ...turnIceServers];

    console.log(`[ice-servers] Successfully fetched ${turnIceServers.length} TURN entries from Metered.ca`);
    return res.status(200).json({
      iceServers: combinedServers,
      hasTurnRelay: true
    });

  } catch (error) {
    console.warn('[ice-servers] REST API fetch failed, returning static fallback TURN servers:', error.message);
    return res.status(200).json({
      iceServers: staticTurnFallback,
      hasTurnRelay: true,
      fallback: true
    });
  }
}
