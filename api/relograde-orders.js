// api/relograde-orders.js
export default async function handler(req, res) {
  // CORS হেডার (ঐচ্ছিক)
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.8ef43d4b-37f9-4ceb-baa3-177b4e3832e7;
  if (!apiKey) {
    return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });
  }

  try {
    // 🔴 এখানে সঠিক এন্ডপয়েন্ট বসান
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
    res.status(200).json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
