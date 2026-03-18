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

  // EmailJS configuration - শুধু process.env থেকে নিবে, কোন ডিফল্ট ভ্যালু নেই
  const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
  const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;

  // Check if EmailJS credentials are configured
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    console.error('EmailJS credentials not configured');
    // ইমেইল না পাঠালেও অর্ডার প্রসেস চলবে
  }

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
    
    // ✅ ফিক্সড লিংক
    const orderLink = `https://easy-premium.com/Checking.html?data=${encodeURIComponent(base64Data)}`;

    // ✅ ইমেইল পাঠানোর ফাংশন - শুধু process.env ব্যবহার করবে
    async function sendEmailWithLink() {
      // ইমেইজ ক্রেডেনশিয়াল চেক করুন
      if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
        console.log('EmailJS credentials missing, skipping email');
        return false;
      }

      if (!email) {
        console.log('No email provided, skipping email notification');
        return false;
      }

      try {
        // EmailJS API endpoint
        const emailjsUrl = 'https://api.emailjs.com/api/v1.0/email/send';
        
        // আপনার টেমপ্লেট অনুযায়ী প্যারামিটার
        const templateParams = {
          to_email: email,
          to_name: userId || 'Valued Customer',
          order_id: finalOrderId,
          platform: platformName,
          price: formattedPrice,
          order_date: formattedDate,
          payment_link: orderLink,
          from_name: 'Easy Premium',
          reply_to: 'support@easy-premium.com'
        };

        console.log('📧 Sending email with params:', templateParams);

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
        console.log('📨 EmailJS raw response:', responseText);
        
        if (!emailResponse.ok) {
          console.error('❌ EmailJS error response:', responseText);
          return false;
        }

        return true;
      } catch (emailError) {
        console.error('❌ Error sending email:', emailError);
        return false;
      }
    }

    // ইমেইল পাঠান
    let emailSent = false;
    if (email && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_PUBLIC_KEY) {
      emailSent = await sendEmailWithLink();
      console.log(`📧 Order confirmation email ${emailSent ? 'sent' : 'failed'} to ${email}`);
    } else {
      console.log('📧 Email not sent - missing credentials or email address');
    }

    // Return success response
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
        faceValue: faceValue || null
      }
    });

  } catch (error) {
    console.error('❌ Error creating order:', error.message);
    return res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message 
    });
  }
}
