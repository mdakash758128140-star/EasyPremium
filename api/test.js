// api/test.js
export default async function handler(req, res) {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ message: 'GET request successful', method: 'GET' });
  }

  if (req.method === 'POST') {
    return res.status(200).json({ message: 'POST request successful', method: 'POST', data: req.body });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
