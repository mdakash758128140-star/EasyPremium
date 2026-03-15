// api/webhook.js
export default async function handler(req, res) {
  // শুধুমাত্র POST মেথড অনুমোদিত
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      status: 'error', 
      message: 'Method not allowed. Only POST requests are accepted.' 
    });
  }

  try {
    // হেডার থেকে API কী যাচাই (ঐচ্ছিক কিন্তু সুপারিশকৃত)
    const authHeader = req.headers.authorization;
    const expectedApiKey = '8ef43d4b-37f9-4ceb-baa3-177b4e3832e7'; // আপনার API কী
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Unauthorized. Missing or invalid Authorization header.' 
      });
    }
    
    const apiKey = authHeader.split(' ')[1];
    if (apiKey !== expectedApiKey) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Unauthorized. Invalid API key.' 
      });
    }

    // বডি থেকে ডেটা গ্রহণ
    const orderData = req.body;
    
    // ডেটা যাচাই
    if (!orderData || Object.keys(orderData).length === 0) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Bad Request. Request body is empty.' 
      });
    }

    // এখানে আপনার কাস্টম লজিক লিখুন (যেমন ডাটাবেস সেভ, ইমেইল নোটিফিকেশন)
    console.log('✅ Webhook received successfully:', {
      timestamp: new Date().toISOString(),
      orderId: orderData.orderId || 'N/A',
      status: orderData.status || 'N/A',
      data: orderData
    });

    // সফল রেসপন্স
    return res.status(200).json({
      status: 'success',
      message: 'Webhook received successfully',
      receivedAt: new Date().toISOString()
    });

  } catch (error) {
    // ত্রুটি হ্যান্ডলিং
    console.error('❌ Webhook error:', error.message);
    
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error.message
    });
  }
}
