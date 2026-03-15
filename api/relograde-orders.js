// api/relograde-orders.js
export default async function handler(req, res) {
  // CORS হেডার (ঐচ্ছিক, ফ্রন্টএন্ড একই ডোমেইনে থাকলে প্রয়োজন নাও হতে পারে)
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // শুধুমাত্র GET অনুরোধ অনুমোদিত
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🔑 Vercel Environment Variable থেকে API কী নিন (সবচেয়ে নিরাপদ)
  const apiKey = process.env.RELOGRADE_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured in Vercel' });
  }

  try {
    // 📌 Relograde API-র সঠিক এন্ডপয়েন্ট (ডকুমেন্টেশন অনুযায়ী)
    const response = await fetch('https://connect.relograde.com/api/1.02/order', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    // রেসপন্স ঠিক না থাকলে এরর থ্রো করুন
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Relograde API responded with status ${response.status}: ${errorText}`);
    }

    // সফল রেসপন্স JSON আকারে পাঠান
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error fetching Relograde orders:', error.message);
    res.status(500).json({ error: error.message });
  }
}
