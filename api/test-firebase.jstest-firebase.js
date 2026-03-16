// api/test-firebase.js
const admin = require('firebase-admin');

// Firebase Service Account (আপনার JSON থেকে)
const serviceAccount = {
  type: "service_account",
  project_id: "easy-premium",
  private_key_id: "e8e8d42323de37ab2c90d098deb8463fd244d88e",
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: "101315501661716215319",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40easy-premium.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = {
    timestamp: new Date().toISOString(),
    envVars: {},
    steps: []
  };

  try {
    // Step 1: Check Environment Variables
    result.steps.push({
      step: 1,
      name: 'Environment Variables Check',
      data: {
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? '✅ Present' : '❌ Missing',
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? '✅ Present' : '❌ Missing',
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? '✅ Present' : '❌ Missing',
        FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL ? '✅ Present' : '❌ Missing'
      }
    });

    // Step 2: Initialize Firebase
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      result.steps.push({
        step: 2,
        name: 'Firebase Initialization',
        status: '✅ Success'
      });
    } else {
      result.steps.push({
        step: 2,
        name: 'Firebase Initialization',
        status: '✅ Already initialized'
      });
    }

    const db = admin.database();

    // Step 3: Write Test Data
    try {
      const testRef = db.ref('test_connection').push();
      const testKey = testRef.key;
      
      await testRef.set({
        timestamp: admin.database.ServerValue.TIMESTAMP,
        message: 'Firebase connection test',
        from: 'test-firebase.js',
        status: 'testing'
      });

      result.steps.push({
        step: 3,
        name: 'Write Test',
        status: '✅ Success',
        key: testKey,
        path: `test_connection/${testKey}`
      });

      // Step 4: Read Test Data
      const snapshot = await testRef.once('value');
      const data = snapshot.val();
      
      result.steps.push({
        step: 4,
        name: 'Read Test',
        status: '✅ Success',
        data: {
          ...data,
          timestamp: new Date(data.timestamp).toISOString()
        }
      });

      // Step 5: Clean up (optional)
      // await testRef.remove();
      
    } catch (dbError) {
      result.steps.push({
        step: 3,
        name: 'Database Operation',
        status: '❌ Failed',
        error: dbError.message,
        stack: dbError.stack
      });
    }

    // Step 6: Final Status
    const allSuccess = result.steps.every(s => s.status?.includes('✅'));
    result.finalStatus = allSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED';
    
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      steps: result.steps
    });
  }
}
