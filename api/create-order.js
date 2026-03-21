// api/create-order.js
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ========================
  // 🔁 ORDER CONFIRMATION (waiting status)
  // ========================
  const { orderId, phone, txid } = req.body;
  if (orderId && phone && txid) {
    const dbUrl = process.env.FIREBASE_DATABASE_URL;
    const secret = process.env.FIREBASE_SECRET;
    if (!dbUrl || !secret) {
      console.error('❌ Missing Firebase config');
      return res.status(500).json({ error: 'Firebase configuration missing' });
    }

    try {
      // Step 1: Try direct path (key = orderId)
      const directUrl = `${dbUrl}/transactions/${orderId}.json?auth=${secret}`;
      const directRes = await fetch(directUrl);
      let orderData = null;
      let transactionKey = orderId; // assume key is orderId

      if (directRes.ok) {
        orderData = await directRes.json();
        if (orderData && orderData.orderId === orderId) {
          console.log(`✅ Found order at direct path: ${orderId}`);
        } else {
          // Direct path exists but orderId field doesn't match? Then search.
          orderData = null;
        }
      }

      // If direct path didn't work, search (like webhook does)
      if (!orderData) {
        const searchUrl = `${dbUrl}/transactions.json?orderBy="orderId"&equalTo="${orderId}"&auth=${secret}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        if (searchData && typeof searchData === 'object') {
          const keys = Object.keys(searchData);
          if (keys.length > 0) {
            transactionKey = keys[0];
            orderData = searchData[transactionKey];
            console.log(`✅ Found order via search with key: ${transactionKey}`);
          }
        }
      }

      if (!orderData) {
        console.warn(`⚠️ No order found with orderId: ${orderId}`);
        return res.status(404).json({ error: 'Order not found' });
      }

      // Update transaction status to waiting
      const updates = {
        status: 'waiting',
        phone: phone,
        txid: txid,
        confirmedAt: new Date().toISOString()
      };
      const updateUrl = `${dbUrl}/transactions/${transactionKey}.json?auth=${secret}`;
      const patchRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!patchRes.ok) throw new Error(`Update failed: ${patchRes.status}`);
      console.log(`✅ Transaction ${orderId} updated to waiting`);

      // Update userOrders if userId exists
      if (orderData.userId) {
        const userDirectUrl = `${dbUrl}/userOrders/${orderData.userId}/${orderId}.json?auth=${secret}`;
        const userDirectRes = await fetch(userDirectUrl);
        if (userDirectRes.ok) {
          const userOrder = await userDirectRes.json();
          if (userOrder) {
            await fetch(userDirectUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'waiting', phone, txid })
            });
            console.log(`✅ User order updated directly for ${orderData.userId}`);
          } else {
            // Search within userOrders (like webhook helper)
            await updateUserOrderViaSearch(orderData.userId, orderId, { status: 'waiting', phone, txid }, dbUrl, secret);
          }
        } else {
          await updateUserOrderViaSearch(orderData.userId, orderId, { status: 'waiting', phone, txid }, dbUrl, secret);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Order status updated to waiting',
        orderId,
        status: 'waiting'
      });
    } catch (err) {
      console.error('❌ Confirmation error:', err.message);
      return res.status(500).json({ error: 'Failed to update order', details: err.message });
    }
  }

  // ========================
  // 🛒 ORDER CREATION (original code, unchanged)
  // ========================
  const apiKey = process.env.RELOGRADE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RELOGRADE_API_KEY not configured' });

  const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
  const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
  const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

  const { productSlug, amount, paymentCurrency, reference, faceValue, firebaseOrderId, serviceCharge } = req.body;

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
    const dummyTimestamp = "2024-01-01T00:00:00.000Z";
    const dummyFormattedDate = "১ জানুয়ারি ২০২৪";

    const serviceChargeInt = serviceCharge ? parseInt(serviceCharge) : 0;
    const totalAmount = amountInt + serviceChargeInt;

    const formattedPrice = `${amountInt} ${paymentCurrency}`;
    const formattedTotalPrice = `${totalAmount} ${paymentCurrency}`;
    const platformName = productSlug.includes('variable') ? 'Rewarble Visa Variable USD' : productSlug;

    const items = [{ productSlug, amount: 1 }];
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
      admin
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
      Time: dummyTimestamp,
      email,
      platformId: productSlug,
      uid: userId || 'guest',
      amount: amountInt,
      currency: 'BDT',
      faceValue: faceValue || null,
      status: 'pending',
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
          order_date: dummyFormattedDate,
          payment_link: orderLink,
          payment_method: paymentMethod,
          payment_number: phone || 'N/A',
          transaction_id: txid || 'N/A',
          user_id: userId || 'guest',
          status: 'pending',
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
        time: dummyTimestamp,
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

// Helper function to update userOrders by searching (same as webhook)
async function updateUserOrderViaSearch(userId, orderId, updates, dbUrl, secret) {
  const userOrdersUrl = `${dbUrl}/userOrders/${userId}.json?auth=${secret}`;
  const userOrdersRes = await fetch(userOrdersUrl);
  const userOrders = await userOrdersRes.json();

  if (userOrders && typeof userOrders === 'object') {
    for (const key in userOrders) {
      if (userOrders[key].orderId === orderId) {
        const updateUrl = `${dbUrl}/userOrders/${userId}/${key}.json?auth=${secret}`;
        await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        console.log(`✅ User order updated via search (key: ${key}) for ${userId}`);
        return;
      }
    }
    console.warn(`⚠️ No matching user order found for user ${userId} with orderId ${orderId}`);
  } else {
    console.warn(`⚠️ No userOrders found for user ${userId}`);
  }
}
