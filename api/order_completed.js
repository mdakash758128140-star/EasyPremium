// api/order_completed.js
// Admin Order Management API - Complete & Delete Orders

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Only POST is accepted.' 
    });
  }
  
  try {
    const { trxId, action, adminEmail, orderData } = req.body;
    
    console.log('📝 API Called:', { trxId, action, adminEmail });
    
    // Validation
    if (!trxId) {
      return res.status(400).json({ 
        success: false, 
        error: 'trxId is required' 
      });
    }
    
    if (!action || !['complete', 'delete'].includes(action)) {
      return res.status(400).json({ 
        success: false, 
        error: 'action must be complete or delete' 
      });
    }
    
    if (!adminEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'adminEmail is required' 
      });
    }
    
    // Firebase config
    const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
    const FIREBASE_SECRET = process.env.FIREBASE_SECRET;
    
    console.log('🔧 Firebase Config Check:', { 
      hasUrl: !!FIREBASE_DATABASE_URL, 
      hasSecret: !!FIREBASE_SECRET,
      url: FIREBASE_DATABASE_URL ? FIREBASE_DATABASE_URL.substring(0, 50) + '...' : 'missing'
    });
    
    if (!FIREBASE_DATABASE_URL || !FIREBASE_SECRET) {
      console.error('❌ Firebase config missing');
      return res.status(500).json({ 
        success: false, 
        error: 'Firebase configuration missing on server. Please check environment variables.' 
      });
    }
    
    if (action === 'complete') {
      // Complete order - save to completedOrders
      const timestamp = new Date().toISOString();
      const timestampMs = Date.now();
      
      const completedData = {
        trxId: trxId,
        status: 'completed',
        completedBy: adminEmail,
        completedAt: timestampMs,
        completedAtISO: timestamp,
        orderData: orderData || null
      };
      
      const url = `${FIREBASE_DATABASE_URL}/completedOrders/${trxId}.json?auth=${FIREBASE_SECRET}`;
      console.log('📤 Saving to Firebase:', url.replace(FIREBASE_SECRET, '***HIDDEN***'));
      
      const saveRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completedData)
      });
      
      if (!saveRes.ok) {
        const errorText = await saveRes.text();
        console.error('Firebase save failed:', errorText);
        throw new Error(`Failed to save to Firebase: ${saveRes.status} - ${errorText}`);
      }
      
      console.log(`✅ Order ${trxId} completed by ${adminEmail}`);
      
      return res.status(200).json({
        success: true,
        message: 'Order completed successfully',
        data: { trxId, status: 'completed' }
      });
      
    } else if (action === 'delete') {
      // Delete order - backup and remove
      const timestamp = new Date().toISOString();
      const timestampMs = Date.now();
      
      // Backup to deletedOrders
      const backupData = {
        trxId: trxId,
        deletedBy: adminEmail,
        deletedAt: timestampMs,
        deletedAtISO: timestamp,
        originalData: orderData || null
      };
      
      const backupUrl = `${FIREBASE_DATABASE_URL}/deletedOrders/${trxId}.json?auth=${FIREBASE_SECRET}`;
      await fetch(backupUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupData)
      });
      
      // Delete from completedOrders if exists
      const deleteUrl = `${FIREBASE_DATABASE_URL}/completedOrders/${trxId}.json?auth=${FIREBASE_SECRET}`;
      await fetch(deleteUrl, { method: 'DELETE' });
      
      console.log(`✅ Order ${trxId} deleted by ${adminEmail}`);
      
      return res.status(200).json({
        success: true,
        message: 'Order deleted successfully',
        data: { trxId, deleted: true }
      });
    }
    
  } catch (error) {
    console.error('❌ API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
