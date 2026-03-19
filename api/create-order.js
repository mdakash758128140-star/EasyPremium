// api/create-order.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Only allow POST requests
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });

  const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
  const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
  const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

  const { productSlug, amount, paymentCurrency, reference, faceValue, firebaseOrderId } = req.body;

  if (!productSlug || !amount || !paymentCurrency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  try {
    let paymentMethod = 'UNKNOWN';
    let phone = '', txid = '', userId = '', email = '', admin = '' ;
    
    if (reference) {
      const referenceParts = reference.split('|');
      paymentMethod = referenceParts[0] || 'UNKNOWN';
      
      referenceParts.forEach(part => {
        if (part.startsWith('Phone:')) phone = part.replace('Phone:', '');
        if (part.startsWith('TXID:')) txid = part.replace('TXID:', '');
        if (part.startsWith('UserID:')) userId = part.replace('UserID:', '');
        if (part.startsWith('Email:')) email = part.replace('Email:', '');
        if (part.startsWith('Admin:')) admin = part.replace('Admin:', '');
      });
    }

    const finalOrderId = firebaseOrderId || 'REL' + Math.random().toString(36).substring(2, 15).toUpperCase();
    const currentTime = new Date().toISOString();
    
    const formattedDate = new Date(currentTime).toLocaleDateString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const formattedPrice = `${amountInt} ${paymentCurrency}`;
    const platformName = productSlug.includes('variable') ? 'Rewarble Visa Variable USD' : productSlug;

    const items = [{
      productSlug,
      amount: 1
    }];

    if (faceValue !== undefined && faceValue !== null) {
      const faceValueNum = parseFloat(faceValue);
      if (!isNaN(faceValueNum) && faceValueNum > 0) {
        items[0].faceValue = faceValueNum;
      }
    }

    const relogradeReference = JSON.stringify({
      firebaseOrderId: finalOrderId,
      paymentMethod,
      phone,
      txid,
      userId,
      email,
      admin,
      timestamp: currentTime
    });

    const requestBody = {
      items,
      paymentCurrency: paymentCurrency.toLowerCase(),
      reference: relogradeReference
    };

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

    const relogradeData = await response.json();

    const orderData = {
      OrderId: relogradeData.trx || finalOrderId,
      PaymentMethods: paymentMethod,
      PaymentNumber: phone || 'N/A',
      PaymentTrxID: txid || 'N/A',
      Time: currentTime,
      email,
      platformId: productSlug,
      uid: userId || 'guest',
      amount: amountInt,
      currency: paymentCurrency,
      faceValue: faceValue || null,
      status: 'pending'
    };

    const jsonString = JSON.stringify(orderData);
    const base64Data = Buffer.from(jsonString).toString('base64');
    
    const orderLink = `https://www.easy-premium.com/Checking.html?data=${encodeURIComponent(base64Data)}`;

    // ✅ ইমেইল পাঠানোর ফাংশন – এখানে সামান্য পরিবর্তন করা হয়েছে (অতিরিক্ত তথ্য যোগ)
    async function sendEmailWithLink() {
      if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
        console.log('❌ EmailJS credentials missing');
        return false;
      }

      if (!email) {
        console.log('❌ No email provided');
        return false;
      }

      try {
        const emailjsUrl = 'https://api.emailjs.com/api/v1.0/email/send';
        
        // ⭐ নিচে টেমপ্লেট প্যারামিটারগুলো আপডেট করা হয়েছে (সঠিক তথ্য সহ)
        const templateParams = {
          to_email: email,
          to_name: userId || 'Valued Customer',
          order_id: relogradeData.trx || finalOrderId,       // Relograde অর্ডার আইডি (সঠিক)
          platform: platformName,
          order_date: formattedDate,
          payment_link: orderLink,
          payment_method: paymentMethod,                     // পেমেন্ট পদ্ধতি
          payment_number: phone || 'N/A',                    // পেমেন্ট নম্বর
          transaction_id: txid || 'N/A',                     // ট্রানজেকশন আইডি
          user_id: userId || 'guest',                         // ইউজার আইডি
          status: 'pending',                                  // স্ট্যাটাস
          amount: formattedPrice,                             // মূল্য (যেমন: "983 USD")
          face_value: faceValue ? `$${faceValue}` : 'N/A',    // ফেস ভ্যালু (যদি থাকে)
          from_name: 'Easy Premium',
          reply_to: 'support@easy-premium.com'
        };

        console.log('📧 Sending email with params:', templateParams);

        const emailResponse = await fetch(emailjsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: templateParams,
            accessToken: EMAILJS_PRIVATE_KEY
          })
        });

        const responseText = await emailResponse.text();
        console.log('📨 EmailJS response:', responseText);
        
        if (!emailResponse.ok) {
          console.error('❌ EmailJS error:', responseText);
          return false;
        }

        return true;
      } catch (emailError) {
        console.error('❌ Email error:', emailError);
        return false;
      }
    }

    let emailSent = false;
    if (email) {
      emailSent = await sendEmailWithLink();
    }

    return res.status(200).json({
      success: true,
      trx: finalOrderId,
      link: orderLink,
      emailSent,
      relogradeResponse: relogradeData,
      orderData: {
        orderId: finalOrderId,
        paymentMethod,
        paymentNumber: phone,
        transactionId: txid,
        time: currentTime,
        email,
        platformId: productSlug,
        faceValue: faceValue || null
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    return res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message 
    });
  }
}
