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

  console.log('🔵 API called with method:', req.method);

  // Get API key from environment variables
  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) {
    console.error('🔴 RELOGRADE_API_KEY not configured');
    return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });
  }

  // EmailJS configuration
  const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
  const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
  const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

  console.log('📧 EmailJS Config:', {
    service: EMAILJS_SERVICE_ID ? '✅' : '❌',
    template: EMAILJS_TEMPLATE_ID ? '✅' : '❌',
    publicKey: EMAILJS_PUBLIC_KEY ? '✅' : '❌',
    privateKey: EMAILJS_PRIVATE_KEY ? '✅' : '❌'
  });

  // Extract data from request body
  const { productSlug, amount, paymentCurrency, reference, faceValue, firebaseOrderId, serviceCharge, adminNumber } = req.body;

  console.log('📦 Request body:', { 
    productSlug, 
    amount, 
    paymentCurrency, 
    reference, 
    faceValue, 
    firebaseOrderId, 
    serviceCharge,
    adminNumber 
  });

  // Validate required fields
  if (!productSlug || !amount || !paymentCurrency) {
    console.error('🔴 Missing required fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) {
    console.error('🔴 Invalid amount:', amount);
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  // সার্ভিস চার্জ
  const serviceChargeInt = serviceCharge ? parseInt(serviceCharge) : 0;
  
  // মোট মূল্য (প্রদর্শনের জন্য)
  const totalAmount = amountInt + serviceChargeInt;

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

    // এডমিন নম্বর (request body থেকে বা reference থেকে)
    const finalAdminNumber = adminNumber || refAdminNumber || '01785926770';

    console.log('👤 Parsed data:', { 
      paymentMethod, 
      phone, 
      txid, 
      userId, 
      email,
      adminNumber: finalAdminNumber 
    });

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

    // Format prices with currency (BDT)
    const formattedPrice = `${amountInt} ৳`;
    const formattedServiceCharge = `${serviceChargeInt} ৳`;
    const formattedTotalPrice = `${totalAmount} ৳`;

    // Get platform name
    let platformName = productSlug;
    if (productSlug.includes('rewarble-visa-variable')) {
      platformName = 'Rewarble Visa Variable USD';
    } else if (productSlug.includes('rewarble-visa-ww-usd-5')) {
      platformName = 'Rewarble Visa WW USD $5';
    } else {
      platformName = productSlug.replace(/-/g, ' ').toUpperCase();
    }

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
      currency: 'BDT',
      serviceCharge: serviceChargeInt,
      totalAmount: totalAmount,
      faceValue: faceValue || null,
      status: 'pending',
      adminNumber: activeAdminNumber
    };

    // 🔥 FIX: Relograde API-তে সবসময় amount: 1 পাঠাতে হবে
    const items = [{
      productSlug,
      amount: 1  // ✅ সবসময় 1 থাকবে (quantity)
    }];

    // Add faceValue if provided and valid
    if (faceValue !== undefined && faceValue !== null) {
      const faceValueNum = parseFloat(faceValue);
      if (!isNaN(faceValueNum) && faceValueNum > 0) {
        items[0].faceValue = faceValueNum;
      }
    }

    // Create reference for Relograde API with all details
    const relogradeReference = JSON.stringify({
      firebaseOrderId: finalOrderId,
      paymentMethod: paymentMethod,
      phone: phone,
      txid: txid,
      userId: userId,
      email: email,
      timestamp: currentTime,
      actualAmount: amountInt,        // আসল মূল্য (614)
      serviceCharge: serviceChargeInt,
      totalAmount: totalAmount,
      adminNumber: finalAdminNumber,
      quantity: 1                      // quantity = 1
    });

    // Prepare request for Relograde API
    const requestBody = {
      items,
      paymentCurrency: paymentCurrency.toLowerCase(),
      reference: relogradeReference
    };

    console.log('🔄 Calling Relograde API with:', JSON.stringify(requestBody, null, 2));

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
      console.error('🔴 Relograde API error:', response.status, errorText);
      throw new Error(`Relograde API responded with status ${response.status}: ${errorText}`);
    }

    const relogradeData = await response.json();
    console.log('✅ Relograde API success:', relogradeData);

    // Convert order data to JSON and then to Base64
    const jsonString = JSON.stringify(orderData);
    const base64Data = Buffer.from(jsonString).toString('base64');
    
    // ✅ ফিক্সড লিংক
    const orderLink = `https://easy-premium.com/Checking.html?data=${encodeURIComponent(base64Data)}`;

    // ✅ ইমেইল পাঠানোর ফাংশন
    async function sendEmailWithLink() {
      if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
        console.log('❌ EmailJS credentials missing, skipping email');
        return false;
      }

      if (!email) {
        console.log('❌ No email provided, skipping');
        return false;
      }

      try {
        // EmailJS API endpoint
        const emailjsUrl = 'https://api.emailjs.com/api/v1.0/email/send';
        
        // টেমপ্লেট প্যারামিটার
        const templateParams = {
          to_email: email,
          to_name: userId || 'Valued Customer',
          order_id: finalOrderId,
          platform: platformName,
          price: formattedPrice,
          service_charge: formattedServiceCharge,
          total_price: formattedTotalPrice,
          order_date: formattedDate,
          payment_link: orderLink,
          admin_number: finalAdminNumber,
          from_name: 'Easy Premium',
          reply_to: 'support@easy-premium.com'
        };

        console.log('📧 Sending email with params:', templateParams);

        const requestBody = {
          service_id: EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
          user_id: EMAILJS_PUBLIC_KEY,
          template_params: templateParams
        };

        // Private Key থাকলে যোগ করুন
        if (EMAILJS_PRIVATE_KEY) {
          requestBody.accessToken = EMAILJS_PRIVATE_KEY;
        }

        const emailResponse = await fetch(emailjsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
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
        adminNumber: finalAdminNumber,
        quantity: 1
      }
    });

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    console.error('Stack:', error.stack);
    return res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message,
      stack: error.stack
    });
  }
}
