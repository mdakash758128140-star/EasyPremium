// api/create-order.js
export default async function handler(req, res) {
  // CORS হেডার (ঐচ্ছিক)
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // শুধুমাত্র POST অনুরোধ অনুমোদিত
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });
  }

  // ফ্রন্টএন্ড থেকে পাঠানো ডেটা
  const { cardType, amount, currency } = req.body;

  // বেসিক ভ্যালিডেশন
  if (!cardType || !amount || !currency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Relograde API-তে অর্ডার তৈরি
    const response = await fetch('https://connect.relograde.com/api/1.02/order', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: cardType,      // 'visa' বা 'mastercard'
        amount: amount,
        currency: currency
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Relograde API responded with status ${response.status}: ${errorText}`);
    }

    const orderData = await response.json();
    
    // সফল রেসপন্স ফেরত
    res.status(200).json(orderData);
  } catch (error) {
    console.error('❌ Error creating order:', error.message);
    res.status(500).json({ error: error.message });
  }
}
