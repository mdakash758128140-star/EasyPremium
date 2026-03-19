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

  // Firebase database secret for REST API
  const FIREBASE_SECRET = process.env.FIREBASE_DATABASE_SECRET; // you MUST set this in Vercel
  const FIREBASE_URL = process.env.FIREBASE_DATABASE_URL; // already set, e.g. https://easy-premium-default-rtdb.asia-southeast1.firebasedatabase.app/

  console.log('🔍 FIREBASE_SECRET exists:', !!FIREBASE_SECRET);
  console.log('🔍 FIREBASE_URL:', FIREBASE_URL);

  const { productSlug, amount, paymentCurrency, reference, faceValue, firebaseOrderId, serviceCharge } = req.body;
  console.log('📦 Request body:', { productSlug, amount, paymentCurrency, firebaseOrderId, serviceCharge, faceValue });

  if (!productSlug || !amount || !paymentCurrency) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive integer' });
  }

  try {
    let paymentMethod = 'UNKNOWN';
    let phone = '', txid = '', userId = '', email = '', admin = '';

    if (reference) {
      try {
        const parsedRef = JSON.parse(reference);
        paymentMethod = parsedRef.method || 'UNKNOWN';
        phone = parsedRef.phone || '';
        txid = parsedRef.txid || '';
        userId = parsedRef.userId || '';
        email = parsedRef.email || '';
        admin = parsedRef.admin || '';
      } catch (e) {
        console.error('Failed to parse reference JSON, falling back to pipe parsing:', e);
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
    }

    const finalOrderId = firebaseOrderId || 'REL' + Math.random().toString(36).substring(2, 15).toUpperCase();
    const currentTime = new Date().toISOString();

    const formattedDate = new Date(currentTime).toLocaleDateString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const serviceChargeInt = serviceCharge ? parseInt(serviceCharge) : 0;
    const totalAmount = amountInt + serviceChargeInt;

    const formattedPrice = `${amountInt} ${paymentCurrency}`;
    const formattedTotalPrice = `${totalAmount} ${paymentCurrency}`;
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
    console.log('✅ Relograde response:', relogradeData);

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
      currency: 'BDT',
      faceValue: faceValue || null,
      status: 'waiting',                // changed from 'pending' to 'waiting'
      serviceCharge: serviceChargeInt,
      totalAmount: totalAmount
    };

    const jsonString = JSON.stringify(orderData);
    const base64Data = Buffer.from(jsonString).toString('base64');

    const orderLink = `https://www.easy-premium.com/Checking.html?data=${encodeURIComponent(base64Data)}`;

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

        const templateParams = {
          to_email: email,
          to_name: userId || 'Valued Customer',
          order_id: relogradeData.trx || finalOrderId,
          platform: platformName,
          order_date: formattedDate,
          payment_link: orderLink,
          payment_method: paymentMethod,
          payment_number: phone || 'N/A',
          transaction_id: txid || 'N/A',
          user_id: userId || 'guest',
          status: 'waiting',              // changed from 'pending' to 'waiting'
          amount: formattedPrice,
          total_amount: formattedTotalPrice,
          face_value: faceValue ? `$${faceValue}` : 'N/A',
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

    // ---------- Firebase update using REST API with secret ----------
    if (firebaseOrderId && FIREBASE_SECRET && FIREBASE_URL) {
      try {
        // Update the transaction node
        const transactionUrl = `${FIREBASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
        console.log('📤 Updating transaction at:', transactionUrl);
        const transactionRes = await fetch(transactionUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relogradeorderID: relogradeData.trx || '' })
        });
        const transactionText = await transactionRes.text();
        if (!transactionRes.ok) {
          console.error('❌ Transaction update failed:', transactionText);
        } else {
          console.log('✅ Transaction updated:', transactionText);
        }

        // Update the userOrders node if userId exists
        if (userId) {
          const userOrderUrl = `${FIREBASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
          console.log('📤 Updating userOrder at:', userOrderUrl);
          const userRes = await fetch(userOrderUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relogradeorderID: relogradeData.trx || '' })
          });
          const userText = await userRes.text();
          if (!userRes.ok) {
            console.error('❌ UserOrder update failed:', userText);
          } else {
            console.log('✅ UserOrder updated:', userText);
          }
        }

        console.log(`✅ Firebase updated with relograde order ID for ${firebaseOrderId}`);
      } catch (fbError) {
        console.error('❌ Firebase update error:', fbError);
        // Non-critical – we still return success to the client
      }
    } else {
      console.log('⚠️ Skipping Firebase update:');
      if (!firebaseOrderId) console.log('   - firebaseOrderId missing');
      if (!FIREBASE_SECRET) console.log('   - FIREBASE_SECRET missing');
      if (!FIREBASE_URL) console.log('   - FIREBASE_URL missing');
    }
    // -----------------------------------------------------------------

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
        faceValue: faceValue || null,
        serviceCharge: serviceChargeInt,
        totalAmount: totalAmount
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
