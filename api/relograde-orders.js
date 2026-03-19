// api/relograde-orders.js
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
    const { trx } = req.query; // URL থেকে trx প্যারামিটার নেওয়া

    let url = 'https://connect.relograde.com/api/1.02/order';
    if (trx) {
      // নির্দিষ্ট অর্ডার খুঁজতে trx ফিল্টার ব্যবহার
      url += `?trx=${encodeURIComponent(trx)}`;
    } else {
      // কোনো trx না দিলে সর্বশেষ ৫০টি অর্ডার দেখানো (প্রশাসনিক কাজে)
      url += '?limit=50';
    }

    const response = await fetch(url, {
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

    // রেসপন্স ফরম্যাট চেক
    let orders = [];
    if (Array.isArray(result)) {
      orders = result;
    } else if (result.data && Array.isArray(result.data)) {
      orders = result.data;
    } else if (result.orders && Array.isArray(result.orders)) {
      orders = result.orders;
    } else {
      orders = [result];
    }

    // যদি trx দেওয়া থাকে, তবে একটি অর্ডার আশা করছি, তাই প্রথম আইটেম পাঠানো যেতে পারে
    if (trx) {
      if (orders.length === 0) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      return res.status(200).json({ success: true, data: orders[0] });
    }

    // trx না থাকলে পুরো তালিকা
    res.status(200).json({ success: true, count: orders.length, data: orders });

  } catch (error) {
    console.error('Error fetching orders:', error.message);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
