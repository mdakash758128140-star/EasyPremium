// api/webhook.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const payload = req.body;
    console.log('📩 Webhook received:', payload.event);

    if (payload.event === 'ORDER_FINISHED') {
      const { trx, reference } = payload.data || {};
      console.log(`🔔 Order finished: trx=${trx}, reference=${reference}`);

      // রেফারেন্স পার্স করুন (JSON ফরম্যাট)
      let firebaseOrderId = null;
      let userId = null;
      let userEmail = null;
      try {
        const refData = JSON.parse(reference);
        firebaseOrderId = refData.firebaseOrderId;
        userId = refData.userId;
        userEmail = refData.email;
        console.log(`✅ Parsed: firebaseOrderId=${firebaseOrderId}, userId=${userId}, email=${userEmail}`);
      } catch (e) {
        console.error('❌ Failed to parse reference JSON:', e.message);
        return res.status(200).json({ received: true, warning: 'Invalid reference' });
      }

      if (!firebaseOrderId) {
        console.warn('⚠️ firebaseOrderId missing');
        return res.status(200).json({ received: true, warning: 'No firebaseOrderId' });
      }

      const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
      const FIREBASE_SECRET = process.env.FIREBASE_SECRET;

      if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
        console.error('❌ Missing Firebase config');
        return res.status(500).json({ error: 'Firebase not configured' });
      }

      const apiKey = process.env.RELOGRADE_API_KEY;
      let voucherData = null;
      let productPlatform = null;
      let orderAmount = null;
      let orderCurrency = null;

      if (apiKey && trx) {
        try {
          const orderRes = await fetch(`https://connect.relograde.com/api/1.02/order/${trx}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
          });
          if (orderRes.ok) {
            const orderDetails = await orderRes.json();
            console.log('📦 Order details from Relograde received');

            let token = null;
            let voucherLink = null;
            let voucherCode = null;

            if (orderDetails.items && orderDetails.items.length > 0) {
              const firstItem = orderDetails.items[0];
              if (firstItem.productSlug) productPlatform = firstItem.productSlug;
              if (firstItem.amount) orderAmount = firstItem.amount;
              if (firstItem.paymentCurrency) orderCurrency = firstItem.paymentCurrency;

              if (firstItem.orderLines && firstItem.orderLines.length > 0) {
                const firstLine = firstItem.orderLines[0];
                token = firstLine.token || null;

                if (!token && firstLine.product && typeof firstLine.product === 'string') {
                  try {
                    const productObj = JSON.parse(firstLine.product);
                    token = productObj.token || null;
                    console.log('✅ Token extracted from product string:', token);
                  } catch (parseError) {
                    console.log('⚠️ Could not parse product string');
                  }
                }

                voucherCode = firstLine.voucherCode || null;

                if (!token) {
                  for (const line of firstItem.orderLines) {
                    if (line.token) {
                      token = line.token;
                      break;
                    }
                    if (line.product && typeof line.product === 'string') {
                      try {
                        const productObj = JSON.parse(line.product);
                        if (productObj.token) {
                          token = productObj.token;
                          break;
                        }
                      } catch (e) {}
                    }
                  }
                }
              }
            }

            if (token) {
              voucherLink = `https://reward.relograde.com/${token}`;
            }

            voucherData = {
              token: token,
              voucherLink: voucherLink,
              voucherCode: voucherCode,
            };
            console.log('✅ Extracted voucher data:', voucherData);
          } else {
            console.error('❌ Failed to fetch order details from Relograde');
          }
        } catch (err) {
          console.error('❌ Error fetching order details:', err.message);
        }
      }

      const updates = {
        status: 'completed',
        completedAt: new Date().toISOString(),
      };
      if (voucherData) {
        updates.voucherData = voucherData;
      }

      // Transactions আপডেট
      const transactionDirectUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
      const directCheck = await fetch(transactionDirectUrl, { method: 'GET' });

      if (directCheck.ok) {
        const transactionData = await directCheck.json();
        if (transactionData && transactionData.orderId === firebaseOrderId) {
          await fetch(transactionDirectUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          console.log(`✅ Transaction ${firebaseOrderId} updated directly with voucher`);
        } else {
          await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      } else {
        await updateTransactionViaSearch(firebaseOrderId, updates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
      }

      // UserOrders আপডেট
      if (userId) {
        const userUpdates = {
          status: 'completed'
        };
        if (voucherData) {
          userUpdates.voucherData = voucherData;
          userUpdates.voucherLink = voucherData.voucherLink;
        }

        const userOrderDirectUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
        const userCheck = await fetch(userOrderDirectUrl, { method: 'GET' });

        if (userCheck.ok) {
          const userData = await userCheck.json();
          if (userData) {
            await fetch(userOrderDirectUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(userUpdates),
            });
            console.log(`✅ User order updated for user ${userId} with voucher data`);
          } else {
            console.warn(`⚠️ User order not found at direct path, trying fallback...`);
            await updateUserOrderViaSearch(userId, firebaseOrderId, userUpdates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
          }
        } else {
          console.warn(`⚠️ Failed to access user order direct path, trying fallback...`);
          await updateUserOrderViaSearch(userId, firebaseOrderId, userUpdates, FIREBASE_DATABASE_URL, FIREBASE_SECRET);
        }
      }

      // ========== Trustpilot AFS ইমেইল পাঠানো ==========
      if (userEmail && voucherData && voucherData.voucherLink) {
        await sendCompletionEmail({
          to_email: userEmail,
          to_name: userId || 'Valued Customer',
          order_id: trx || firebaseOrderId,
          platform: productPlatform || 'Easy Premium',
          voucher_link: voucherData.voucherLink,
          voucher_code: voucherData.voucherCode,
          amount: orderAmount,
          currency: orderCurrency || 'BDT',
          user_id: userId || 'guest',
        });
      } else {
        console.log('ℹ️ Skipping Trustpilot email: missing email or voucher data');
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// হেল্পার ফাংশন (অপরিবর্তিত)
async function updateTransactionViaSearch(orderId, updates, dbUrl, secret) {
  const findUrl = `${dbUrl}/transactions.json?orderBy="orderId"&equalTo="${orderId}"&auth=${secret}`;
  const findRes = await fetch(findUrl);
  const findData = await findRes.json();

  if (findData && typeof findData === 'object') {
    const keys = Object.keys(findData);
    if (keys.length > 0) {
      const transactionKey = keys[0];
      const updateUrl = `${dbUrl}/transactions/${transactionKey}.json?auth=${secret}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      console.log(`✅ Transaction ${orderId} updated via search (key: ${transactionKey}) with voucher`);
    } else {
      console.warn(`⚠️ No transaction found with orderId ${orderId}`);
    }
  } else {
    console.warn(`⚠️ Transaction search failed for orderId ${orderId}`);
  }
}

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
          body: JSON.stringify(updates),
        });
        console.log(`✅ User order updated for user ${userId} via search (key: ${key}) with voucher:`, updates.voucherData);
        return;
      }
    }
    console.warn(`⚠️ No matching user order found for userId ${userId} with orderId ${orderId}`);
  } else {
    console.warn(`⚠️ No userOrders found for userId ${userId}`);
  }
}

// Trustpilot AFS ইমেইল পাঠানোর ফাংশন (সংশোধিত)
async function sendCompletionEmail(params) {
  const {
    to_email,
    to_name,
    order_id,
    platform,
    voucher_link,
    voucher_code,
    amount,
    currency,
    user_id,
  } = params;

  const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID_COMPLETION || process.env.EMAILJS_TEMPLATE_ID;
  const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
  const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
  const TRUSTPILOT_AFS_EMAIL = process.env.TRUSTPILOT_AFS_EMAIL;

  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
    console.log('❌ EmailJS credentials missing for completion email');
    return false;
  }
  if (!to_email) {
    console.log('❌ No recipient email');
    return false;
  }

  // Trustpilot স্ট্রাকচারড ডাটা (ইমেইলের HTML বডিতে যোগ করতে চাইলে নিচের ভেরিয়েবল ব্যবহার করুন)
  // const trustpilotStructuredData = `<script type="application/json+trustpilot">{"recipientName":"${to_name.replace(/"/g, '\\"')}","recipientEmail":"${to_email}","referenceId":"${order_id}","orderValue":${amount || 0},"orderCurrency":"${currency || 'BDT'}","productSku":"${platform || ''}"}</script>`;

  try {
    const templateParams = {
      to_email: to_email,
      to_name: to_name,
      order_id: order_id,
      platform: platform,
      voucher_link: voucher_link,
      voucher_code: voucher_code || 'N/A',
      amount: amount ? `${amount} ${currency}` : 'N/A',
      user_id: user_id,
      from_name: 'Easy Premium',
      reply_to: 'support@easy-premium.com',
    };

    const emailBody = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: templateParams,
      accessToken: EMAILJS_PRIVATE_KEY
    };

    // ✅ Trustpilot BCC যোগ করা হচ্ছে (শুধুমাত্র যদি ইমেলটি সেট করা থাকে)
    if (TRUSTPILOT_AFS_EMAIL && TRUSTPILOT_AFS_EMAIL.trim() !== '') {
      // EmailJS API BCC সমর্থন করে কিনা নিশ্চিত নন; তাই একটি সতর্কতা যোগ করছি।
      // যদি BCC কাজ না করে, তাহলে নিচের লাইনের পরিবর্তে আলাদা SMTP ব্যবহার করুন।
      emailBody.bcc = [TRUSTPILOT_AFS_EMAIL];
      console.log(`📧 Trustpilot AFS email added as BCC: ${TRUSTPILOT_AFS_EMAIL}`);
    } else {
      console.warn('⚠️ TRUSTPILOT_AFS_EMAIL not set, skipping BCC');
    }

    console.log(`📧 Sending completion email to ${to_email} with Trustpilot BCC`);
    const emailjsUrl = 'https://api.emailjs.com/api/v1.0/email/send';
    const response = await fetch(emailjsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailBody)
    });
    const responseText = await response.text();
    console.log('📨 EmailJS completion response:', responseText);
    if (!response.ok) {
      console.error('❌ EmailJS error:', responseText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('❌ Completion email error:', error);
    return false;
  }
}
