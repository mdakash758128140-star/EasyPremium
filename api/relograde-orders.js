// api/relograde-orders.js
export default async function handler(req, res) {
  // CORS হেডার (ফ্রন্টএন্ড থেকে কল করার অনুমতি দেবে)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS প্রি-ফ্লাইট অনুরোধ হ্যান্ডেল করুন
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // শুধুমাত্র GET অনুরোধ অনুমোদিত
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });
  }

  try {
    // Relograde API-তে Find All Orders এন্ডপয়েন্টে কল
    const response = await fetch('https://connect.relograde.com/api/1.02/order', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Relograde API responded with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    // সফল রেসপন্স ফেরত (পুরো ডেটা)
    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error fetching orders:', error.message);
    res.status(500).json({ error: error.message });
  }
}
