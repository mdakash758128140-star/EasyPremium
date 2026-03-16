// api/check-firebase.js
const admin = require('firebase-admin');

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Environment Variables check
    const envStatus = {
      FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
      FIREBASE_DATABASE_URL: !!process.env.FIREBASE_DATABASE_URL,
      RELOGRADE_API_KEY: !!process.env.RELOGRADE_API_KEY
    };

    // Show first few characters of each (for debugging)
    const envPreview = {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'not set',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 
        process.env.FIREBASE_CLIENT_EMAIL.substring(0, 20) + '...' : 'not set',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? 
        '✅ Present (starts with: ' + process.env.FIREBASE_PRIVATE_KEY.substring(0, 30) + '...)' : 'not set',
      FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL || 'not set',
      RELOGRADE_API_KEY: process.env.RELOGRADE_API_KEY ? 
        '✅ Present' : 'not set'
    };

    // Try to initialize Firebase if not already initialized
    let firebaseStatus = 'Not initialized';
    let dbTest = null;
    
    if (!admin.apps.length) {
      try {
        // Check if we have all required Firebase env vars
        if (!process.env.FIREBASE_PROJECT_ID || 
            !process.env.FIREBASE_CLIENT_EMAIL || 
            !process.env.FIREBASE_PRIVATE_KEY || 
            !process.env.FIREBASE_DATABASE_URL) {
          firebaseStatus = '❌ Missing Firebase environment variables';
        } else {
          // Try to initialize
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
            databaseURL: process.env.FIREBASE_DATABASE_URL
          });
          firebaseStatus = '✅ Firebase initialized successfully';
          
          // Test database connection
          try {
            const testRef = admin.database().ref('.info/connected');
            dbTest = '✅ Database reference created';
          } catch (dbError) {
            dbTest = `❌ Database error: ${dbError.message}`;
          }
        }
      } catch (initError) {
        firebaseStatus = `❌ Firebase init error: ${initError.message}`;
      }
    } else {
      firebaseStatus = '✅ Firebase already initialized';
      try {
        const testRef = admin.database().ref('.info/connected');
        dbTest = '✅ Database reference created';
      } catch (dbError) {
        dbTest = `❌ Database error: ${dbError.message}`;
      }
    }

    // Try to write a test record
    let writeTest = null;
    if (firebaseStatus.includes('✅') && admin.apps.length) {
      try {
        const db = admin.database();
        const testRef = db.ref('test_connection').push();
        await testRef.set({
          timestamp: admin.database.ServerValue.TIMESTAMP,
          message: 'Test connection',
          from: 'check-firebase.js'
        });
        writeTest = `✅ Successfully wrote test data with key: ${testRef.key}`;
        
        // Clean up - delete test data after 5 minutes (optional)
        // setTimeout(() => testRef.remove(), 300000);
      } catch (writeError) {
        writeTest = `❌ Write test failed: ${writeError.message}`;
      }
    }

    // Return all status
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: envPreview,
      environment_flags: envStatus,
      firebase: {
        status: firebaseStatus,
        database_test: dbTest,
        write_test: writeTest,
        apps_initialized: admin.apps.length
      },
      recommendation: getRecommendation(envStatus, firebaseStatus)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}

function getRecommendation(envStatus, firebaseStatus) {
  if (!envStatus.FIREBASE_PROJECT_ID || !envStatus.FIREBASE_CLIENT_EMAIL || 
      !envStatus.FIREBASE_PRIVATE_KEY || !envStatus.FIREBASE_DATABASE_URL) {
    return "❌ Firebase environment variables missing. Add them in Vercel.";
  }
  
  if (firebaseStatus.includes('Missing')) {
    return "❌ Firebase credentials incomplete. Check your service account JSON.";
  }
  
  if (firebaseStatus.includes('error')) {
    return "❌ Firebase initialization failed. Check private_key format (should include BEGIN/END lines and newlines).";
  }
  
  return "✅ Firebase configuration looks good! Try your order now.";
}
