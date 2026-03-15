// api/create-order.js
export default async function handler(req, res) {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // প্রি-ফ্লাইট OPTIONS অনুরোধ হ্যান্ডেল
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

  const { cardType, amount, currency } = req.body;

  // পণ্যের স্লাগ (আপনার প্রকৃত স্লাগ দিন)
  const productSlug = cardType === 'visa' 
    ? 'rewarble-ww-usd-5'   // ভিসার জন্য স্লাগ
    : 'rewarble-ww-usd-5';  // মাস্টারকার্ডের জন্য স্লাগ (প্রয়োজনে পরিবর্তন)

  try {
    const requestBody = {
      items: [
        {
          productSlug: productSlug,
          amount: parseInt(amount)
        }
      ],
      paymentCurrency: currency.toLowerCase(),
      reference: `order_${Date.now()}`
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
    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
