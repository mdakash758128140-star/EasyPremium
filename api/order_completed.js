// api/create-order.js
// Relograde Order Creation API - With Auto Confirm

const RELOGRADE_API_URL = 'https://connect.relograde.com/api/1.02';
const RELOGRADE_API_KEY = process.env.RELOGRADE_API_KEY;

// Helper function for Relograde API calls
async function callRelogradeAPI(endpoint, method, data = null) {
  const url = `${RELOGRADE_API_URL}/${endpoint}`;
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RELOGRADE_API_KEY}`,
      'Accept': 'application/json'
    }
  };
  
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  
  console.log(`📤 Relograde API Call: ${method} ${url}`);
  if (data) console.log(`📤 Request Body:`, JSON.stringify(data, null, 2));
  
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    console.log(`📥 Response Status: ${response.status}`);
    console.log(`📥 Response Data:`, JSON.stringify(result, null, 2));
    
    if (!response.ok) {
      throw new Error(result.message || `API error: ${response.status}`);
    }
    
    return { success: true, data: result };
  } catch (error) {
    console.error('❌ Relograde API error:', error);
    return { success: false, error: error.message };
  }
}

// 🔥🔥🔥 মেইন ফাংশন - এখানে Confirm Order যোগ করা হয়েছে 🔥🔥🔥
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }
  
  try {
    const { userId, productSlug, amount, price, reference, customerInfo } = req.body;
    
    // Validate required fields
    if (!userId || !productSlug || !amount || !price) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, productSlug, amount, price are required'
      });
    }
    
    // Generate unique order ID
    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const firebaseOrderId = orderId;
    
    // Base URL for success/cancel/webhook
    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'https://easy-premium.com';
    
    // Prepare Relograde order data
    const relogradeOrderData = {
      items: [
        {
          productSlug: productSlug,
          amount: parseInt(amount),
          priceAmount: parseFloat(price),
          priceCurrency: 'USD'
        }
      ],
      reference: JSON.stringify({
        firebaseOrderId: firebaseOrderId,
        userId: userId,
        timestamp: new Date().toISOString()
      }),
      successUrl: `${BASE_URL}/success?orderId=${firebaseOrderId}`,
      cancelUrl: `${BASE_URL}/cancel?orderId=${firebaseOrderId}`,
      webhookUrl: `${BASE_URL}/api/webhook`,
      customerEmail: customerInfo?.email || null,
      customerName: customerInfo?.name || null
    };
    
    console.log('📦 STEP 1: Creating Relograde order...');
    
    // ========== STEP 1: Create Order in Relograde ==========
    const createResult = await callRelogradeAPI('order', 'POST', relogradeOrderData);
    
    if (!createResult.success) {
      throw new Error(createResult.error || 'Failed to create order in Relograde');
    }
    
    const createdOrder = createResult.data;
    const relogradeTrx = createdOrder.trx;
    console.log(`✅ Order created with TRX: ${relogradeTrx}`);
    
    // ========== STEP 2: 🔥 CONFIRM ORDER (MOST IMPORTANT) ==========
    console.log(`\n🔄 STEP 2: Confirming order ${relogradeTrx}...`);
    
    const confirmResult = await callRelogradeAPI(`order/confirm/${relogradeTrx}`, 'PATCH');
    
    let finalOrderData = createdOrder;
    let orderStatus = 'created';
    let isFinished = false;
    let voucherCodes = [];
    let voucherLinks = [];
    let voucherSerials = [];
    let confirmError = null;
    
    if (confirmResult.success) {
      finalOrderData = confirmResult.data;
      orderStatus = confirmResult.data.orderStatus;
      isFinished = orderStatus === 'finished';
      
      console.log(`✅ Order confirmed! Status: ${orderStatus}, Finished: ${isFinished}`);
      
      // Extract voucher codes if order is finished
      if (isFinished && confirmResult.data.items) {
        for (const item of confirmResult.data.items) {
          if (item.orderLines && item.orderLines.length > 0) {
            for (const line of item.orderLines) {
              if (line.voucherCode) {
                voucherCodes.push(line.voucherCode);
                voucherLinks.push(`https://reward.relograde.com/${line.voucherCode}`);
                voucherSerials.push(line.voucherSerial || null);
                console.log(`🎫 Voucher found: ${line.voucherCode}`);
              }
            }
          }
        }
      }
    } else {
      confirmError = confirmResult.error;
      console.warn(`⚠️ Order confirmation failed: ${confirmError}`);
      console.warn('Order was created but not confirmed. Webhook will handle later.');
    }
    
    // ========== STEP 3: Save to Firebase ==========
    console.log(`\n📦 STEP 3: Saving to Firebase...`);
    
    const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
    const FIREBASE_SECRET = process.env.FIREBASE_SECRET;
    
    if (FIREBASE_DATABASE_URL && FIREBASE_SECRET) {
      try {
        const timestamp = new Date().toISOString();
        
        // Save to transactions
        const transactionData = {
          orderId: firebaseOrderId,
          userId: userId,
          status: orderStatus,
          createdAt: timestamp,
          relogradeTrx: relogradeTrx,
          relogradeData: finalOrderData,
          amount: finalOrderData.priceAmount || 0,
          currency: finalOrderData.priceCurrency || 'USD',
          items: finalOrderData.items || [],
          voucherCodes: voucherCodes,
          voucherLinks: voucherLinks,
          voucherSerials: voucherSerials,
          isFinished: isFinished,
          confirmSuccess: confirmResult.success,
          confirmError: confirmError
        };
        
        const transactionUrl = `${FIREBASE_DATABASE_URL}/transactions/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
        await fetch(transactionUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(transactionData)
        });
        
        // Save to userOrders
        if (userId) {
          const userOrderData = {
            orderId: firebaseOrderId,
            status: orderStatus,
            createdAt: timestamp,
            amount: finalOrderData.priceAmount || 0,
            currency: finalOrderData.priceCurrency || 'USD',
            items: finalOrderData.items || [],
            voucherCodes: voucherCodes,
            voucherLinks: voucherLinks,
            relogradeTrx: relogradeTrx,
            isFinished: isFinished
          };
          
          const userOrderUrl = `${FIREBASE_DATABASE_URL}/userOrders/${userId}/${firebaseOrderId}.json?auth=${FIREBASE_SECRET}`;
          await fetch(userOrderUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userOrderData)
          });
        }
        
        console.log(`✅ Order saved to Firebase: ${firebaseOrderId}`);
        
      } catch (fbError) {
        console.error('Firebase save error:', fbError);
      }
    } else {
      console.warn('Firebase not configured, skipping save');
    }
    
    // ========== STEP 4: Return Response ==========
    console.log(`\n✅ STEP 4: Sending response...`);
    
    return res.status(200).json({
      success: true,
      data: {
        orderId: firebaseOrderId,
        relogradeTrx: relogradeTrx,
        paymentUrl: createdOrder.paymentUrl || createdOrder.url,
        status: orderStatus,
        isFinished: isFinished,
        amount: parseFloat(price),
        currency: 'USD',
        voucherCodes: voucherCodes,
        voucherLinks: voucherLinks,
        confirmSuccess: confirmResult.success,
        message: isFinished 
          ? '✅ Order completed instantly! Voucher codes are ready.' 
          : confirmResult.success 
            ? '⏳ Order confirmed but pending. Webhook will update when finished.'
            : '⚠️ Order created but confirmation failed. Webhook will handle later.'
      }
    });
    
  } catch (error) {
    console.error('❌ Create order error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
}
