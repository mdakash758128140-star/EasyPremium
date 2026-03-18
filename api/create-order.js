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

  // Get API key from environment variables
  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });

  // EmailJS configuration
  const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
  const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
  const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

  // Extract data from request body
  const { productSlug, amount, paymentCurrency, reference, faceValue, firebaseOrderId, serviceCharge, adminNumber } = req.body;

  // Validate required fields
  if (!productSlug || !amount || !paymentCurrency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  try {
    // Parse reference to extract payment details
    let paymentMethod = 'UNKNOWN';
    let phone = '', txid = '', userId = '', email = '', refAdminNumber = '';
    
    if (reference) {
      const referenceParts = reference.split('|');
      paymentMethod = referenceParts[0] || 'UNKNOWN';
      
      referenceParts.forEach(part => {
        if (part.startsWith('Phone:')) phone = part.replace('Phone:', '');
        if (part.startsWith('TXID:')) txid = part.replace('TXID:', '');
        if (part.startsWith('UserID:')) userId = part.replace('UserID:', '');
        if (part.startsWith('Email:')) email = part.replace('Email:', '');
        if (part.startsWith('AdminNumber:')) refAdminNumber = part.replace('AdminNumber:', '');
      });
    }

    // ✅ এডমিন নম্বর নির্ধারণ
    const finalAdminNumber = adminNumber || refAdminNumber || '01785926770';

    // Use Firebase order ID if provided
    const finalOrderId = firebaseOrderId || 'REL' + Math.random().toString(36).substring(2, 15).toUpperCase();

    const currentTime = new Date().toISOString();
    
    // Format date for Bangladesh
    const formattedDate = new Date(currentTime).toLocaleDateString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // ✅ সার্ভিস চার্জ
    const serviceChargeInt = serviceCharge ? parseInt(serviceCharge) : 0;
    
    // ✅ মোট মূল্য
    const totalAmount = amountInt + serviceChargeInt;

    // Format price with currency - USD
    const formattedPrice = `${amountInt} USD`;
    const formattedServiceCharge = `${serviceChargeInt} USD`;
    const formattedTotalPrice = `${totalAmount} USD`;

    // Get platform name
    const platformName = productSlug.includes('variable') ? 'Rewarble Visa Variable USD' : productSlug;

    // Prepare data for Base64 encoding
    const orderData = {
      OrderId: finalOrderId,
      PaymentMethods: paymentMethod,
      PaymentNumber: phone || 'N/A',
      PaymentTrxID: txid || 'N/A',
      Time: currentTime,
      email: email,
      platformId: productSlug,
      platformName: platformName,
      uid: userId || 'guest',
      amount: amountInt,
      currency: 'USD',  // ✅ USD ব্যবহার করা হয়েছে
      serviceCharge: serviceChargeInt,
      totalAmount: totalAmount,
      faceValue: faceValue || null,
      status: 'pending',
      adminNumber: finalAdminNumber
    };

    // ✅ FIX: Relograde API-তে সবসময় amount: 1 পাঠাতে হবে (quantity)
    const items = [{
      productSlug,
      amount: 1  // ✅ quantity = 1
    }];

    // Add faceValue if provided and valid
    if (faceValue !== undefined && faceValue !== null) {
      const faceValueNum = parseFloat(faceValue);
      if (!isNaN(faceValueNum) && faceValueNum > 0) {
        items[0].faceValue = faceValueNum;
      }
    }

    // ✅ Create reference for Relograde API with all details
    const relogradeReference = JSON.stringify({
      firebaseOrderId: finalOrderId,
      paymentMethod: paymentMethod,
      phone: phone,
      txid: txid,
      userId: userId,
      email: email,
      timestamp: currentTime,
      actualAmount: amountInt,        // ✅ আসল মূল্য (614 USD)
      serviceCharge: serviceChargeInt,
      totalAmount: totalAmount,
      adminNumber: finalAdminNumber,
      quantity: 1
    });

    // Prepare request for Relograde API
    const requestBody = {
      items,
      paymentCurrency: paymentCurrency.toLowerCase(),
      reference: relogradeReference
    };

    // Call Relograde API
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

    // Convert order data to JSON and then to Base64
    const jsonString = JSON.stringify(orderData);
    const base64Data = Buffer.from(jsonString).toString('base64');
    
    // ✅ ফিক্সড লিংক
    const orderLink = `https://easy-premium.com/Checking.html?data=${encodeURIComponent(base64Data)}`;

    // ✅ ইমেইল পাঠানোর ফাংশন
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
        // EmailJS API endpoint
        const emailjsUrl = 'https://api.emailjs.com/api/v1.0/email/send';
        
        // ✅ টেমপ্লেট প্যারামিটার - USD সহ
        const templateParams = {
          to_email: email,
          to_name: userId || 'Valued Customer',
          order_id: finalOrderId,
          platform: platformName,
          price: formattedPrice,                 // 614 USD
          service_charge: formattedServiceCharge, // 0 USD
          total_price: formattedTotalPrice,       // 614 USD
          order_date: formattedDate,
          payment_link: orderLink,
          admin_number: finalAdminNumber,
          from_name: 'Easy Premium',
          reply_to: 'support@easy-premium.com'
        };

        console.log('📧 Sending email with admin number:', finalAdminNumber);

        const emailResponse = await fetch(emailjsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
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

    // ইমেইল পাঠান
    let emailSent = false;
    if (email) {
      emailSent = await sendEmailWithLink();
    }

    return res.status(200).json({
      success: true,
      trx: finalOrderId,
      message: 'Order created successfully',
      link: orderLink,
      emailSent: emailSent,
      relogradeResponse: relogradeData,
      orderData: {
        orderId: finalOrderId,
        paymentMethod: paymentMethod,
        paymentNumber: phone,
        transactionId: txid,
        time: currentTime,
        email: email,
        platformId: productSlug,
        platformName: platformName,
        amount: amountInt,
        serviceCharge: serviceChargeInt,
        totalAmount: totalAmount,
        faceValue: faceValue || null,
        adminNumber: finalAdminNumber
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
