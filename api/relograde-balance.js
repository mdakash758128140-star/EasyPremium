// api/relograde-balance.js
// Fetch Relograde account balance

const RELOGRADE_API_URL = 'https://connect.relograde.com/api/1.02';
const RELOGRADE_API_KEY = process.env.RELOGRADE_API_KEY;

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!RELOGRADE_API_KEY) {
        console.error('❌ RELOGRADE_API_KEY not configured');
        return res.status(500).json({ success: false, error: 'API key missing' });
    }

    try {
        // Call Relograde account balance endpoint
        // Adjust the endpoint if Relograde uses a different path.
        // For example: `/account/balance` might be correct.
        const url = `${RELOGRADE_API_URL}/account/balance`;
        const options = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${RELOGRADE_API_KEY}`,
                'Accept': 'application/json'
            }
        };

        console.log(`📤 Fetching Relograde balance from ${url}`);
        const response = await fetch(url, options);
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || `API error: ${response.status}`);
        }

        // The actual field containing the balance may differ.
        // Inspect your Relograde API response and adjust accordingly.
        // Common field names: `balance`, `amount`, `availableBalance`, etc.
        const balance = result.balance || result.amount || result.availableBalance || 0;

        console.log(`✅ Balance fetched: ${balance} USD`);

        return res.status(200).json({
            success: true,
            balance: parseFloat(balance)
        });
    } catch (error) {
        console.error('❌ Balance fetch error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch balance'
        });
    }
}
