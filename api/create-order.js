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
  const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'service_uknjS0j';
  const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || 'template_gdvntij';
  const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || 'U1IOSVkl_OR1gRFVn';

  // Extract data from request body
  const { productSlug, amount, paymentCurrency, reference, faceValue, firebaseOrderId } = req.body;

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
    let phone = '', txid = '', userId = '', email = '';
    
    if (reference) {
      const referenceParts = reference.split('|');
      paymentMethod = referenceParts[0] || 'UNKNOWN';
      
      referenceParts.forEach(part => {
        if (part.startsWith('Phone:')) phone = part.replace('Phone:', '');
        if (part.startsWith('TXID:')) txid = part.replace('TXID:', '');
        if (part.startsWith('UserID:')) userId = part.replace('UserID:', '');
        if (part.startsWith('Email:')) email = part.replace('Email:', '');
      });
    }

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

    // Format price with currency
    const formattedPrice = `${amountInt} ${paymentCurrency}`;

    // Prepare data for Base64 encoding
    const orderData = {
      OrderId: finalOrderId,
      PaymentMethods: paymentMethod,
      PaymentNumber: phone || 'N/A',
      PaymentTrxID: txid || 'N/A',
      Time: currentTime,
      email: email,
      platformId: productSlug,
      uid: userId || 'guest',
      amount: amountInt,
      currency: paymentCurrency,
      faceValue: faceValue || null,
      status: 'pending'
    };

    // Create items array for Relograde API
    const items = [{
      productSlug,
      amount: amountInt
    }];

    // Add faceValue if provided and valid
    if (faceValue !== undefined && faceValue !== null) {
      const faceValueNum = parseFloat(faceValue);
      if (!isNaN(faceValueNum) && faceValueNum > 0) {
        items[0].faceValue = faceValueNum;
      }
    }

    // Create reference for Relograde API with Firebase order ID
    const relogradeReference = JSON.stringify({
      firebaseOrderId: finalOrderId,
      paymentMethod: paymentMethod,
      phone: phone,
      txid: txid,
      userId: userId,
      email: email,
      timestamp: currentTime
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
    
    // ✅ ফিক্সড লিংক - শুধুমাত্র easy-premium.com ডোমেইন
    const orderLink = `https://easy-premium.com/Checking.html?data=${encodeURIComponent(base64Data)}`;

    // ✅ ইমেইজ পাঠানোর ফাংশন - আপনার টেমপ্লেট অনুযায়ী
    async function sendEmailWithLink() {
      if (!email) {
        console.log('No email provided, skipping email notification');
        return false;
      }

      try {
        // EmailJS API endpoint
        const emailjsUrl = 'https://api.emailjs.com/api/v1.0/email/send';
        
        // Prepare email template parameters - আপনার টেমপ্লেট অনুযায়ী
        const templateParams = {
          to_name: userId || 'Valued Customer',
          order_id: finalOrderId,
          platform: productSlug,
          price: formattedPrice,
          price2: '০ ৳', // Service charge (if needed)
          order_date: formattedDate,
          payment_link: orderLink,
          to_email: email,
          from_name: 'Easy Premium',
          reply_to: 'support@easy-premium.com'
        };

        // Send email via EmailJS
        const emailResponse = await fetch(emailjsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: templateParams
          })
        });

        const responseText = await emailResponse.text();
        
        if (!emailResponse.ok) {
          console.error('EmailJS error response:', responseText);
          return false;
        }

        console.log(`✅ Email sent successfully to ${email}`);
        console.log('EmailJS response:', responseText);
        return true;
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        return false;
      }
    }

    // ইমেইল পাঠান (async - কিন্তু response এর জন্য অপেক্ষা না করে)
    let emailSent = false;
    if (email) {
      sendEmailWithLink().then(sent => {
        emailSent = sent;
        console.log(`📧 Order confirmation email ${sent ? 'sent' : 'failed'} to ${email}`);
      });
    }

    // Return success response
    return res.status(200).json({
      success: true,
      trx: finalOrderId,
      message: 'Order created successfully',
      link: orderLink,
      emailSent: email ? true : false,
      relogradeResponse: relogradeData,
      orderData: {
        orderId: finalOrderId,
        paymentMethod: paymentMethod,
        paymentNumber: phone,
        transactionId: txid,
        time: currentTime,
        email: email,
        platformId: productSlug,
        faceValue: faceValue || null
      }
    });

  } catch (error) {
    console.error('Error creating order:', error.message);
    return res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message 
    });
  }
}
