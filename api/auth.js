module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ADMINS = [
        { username: 'Ashit', password: 'Ashit@123' },
        { username: 'Himanshu', password: 'Himanshu@123' }
    ];

    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const match = ADMINS.find(a => a.username === username && a.password === password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ ok: true, username: match.username });
};
