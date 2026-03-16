export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured in Vercel' });
  }

  try {
    // ✅ সঠিক endpoint: প্যারামিটার সহ
    const response = await fetch('https://connect.relograde.com/api/1.02/order?limit=100', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Relograde API error response:', errorText);
      return res.status(response.status).json({ 
        error: `Relograde API responded with status ${response.status}`,
        details: errorText.substring(0, 200)
      });
    }

    const result = await response.json();
    console.log('Relograde API response structure:', Object.keys(result));
    
    // ✅ রেসপন্স ফরম্যাট চেক
    let orders = [];
    if (Array.isArray(result)) {
      orders = result;
    } else if (result.data && Array.isArray(result.data)) {
      orders = result.data;
    } else if (result.orders && Array.isArray(result.orders)) {
      orders = result.orders;
    } else {
      // যদি কিছু না মিলে, পুরো অবজেক্টকে অ্যারে হিসেবে পাঠাই
      orders = [result];
    }
    
    res.status(200).json({ 
      success: true,
      count: orders.length,
      data: orders 
    });
    
  } catch (error) {
    console.error('Error fetching orders:', error.message);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
