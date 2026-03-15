// api/create-order.js
export default async function handler(req, res) {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS প্রি-ফ্লাইট হ্যান্ডেল
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // শুধুমাত্র POST অনুমোদিত
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });
  }

  // ফ্রন্টএন্ড থেকে আসা ডেটা
  const { productSlug, amount, paymentCurrency, reference } = req.body;

  // বেসিক ভ্যালিডেশন
  if (!productSlug || !amount || !paymentCurrency) {
    return res.status(400).json({ 
      error: 'Missing required fields: productSlug, amount, paymentCurrency' 
    });
  }

  try {
    // Relograde API-র জন্য সঠিক পেলোড
    const requestBody = {
      items: [
        {
          productSlug: productSlug,
          amount: parseInt(amount)          // amount integer হতে হবে
        }
      ],
      paymentCurrency: paymentCurrency.toLowerCase(),  // ছোট হাতের
      reference: reference || `order_${Date.now()}`
    };

    console.log('Sending to Relograde:', JSON.stringify(requestBody));

    const response = await fetch('https://connect.relograde.com/api/1.02/order', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Relograde API responded with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('Relograde response:', data);

    // সফল রেসপন্স (পুরো ডেটা ফেরত)
    res.status(200).json(data);
  } catch (error) {
    console.error('Error creating order:', error.message);
    res.status(500).json({ error: error.message });
  }
}
