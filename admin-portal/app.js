const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');
const path = require('path');
const { createClient } = require('redis');
const RedisStore = require('connect-redis').default;

const app = express();
const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const CS_PORTAL_URL = process.env.CS_PORTAL_URL || 'http://localhost:3002';
const ADMIN_PORTAL_URL = process.env.ADMIN_PORTAL_URL || 'http://localhost:3001';

// Initialize Redis client
const redisClient = createClient({ url: REDIS_URL });
redisClient.connect().catch(console.error);

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

// Redis store for sessions
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'admin-portal:sess:'
});

// MemoryStore for Keycloak grant cache (required for OAuth code exchange)
const memoryStore = new session.MemoryStore();

app.use(session({
  store: redisStore,
  secret: 'admin-portal-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// Keycloak configuration
// Pass memoryStore for grant cache (keycloak-connect requires callback-based store)
const keycloak = new Keycloak({ store: memoryStore }, {
  realm: 'demo',
  'auth-server-url': `${KEYCLOAK_URL}/`,
  'ssl-required': 'external',
  resource: 'admin-portal',
  'public-client': true,
  'confidential-port': 0
});

app.use(keycloak.middleware());

// Parse JSON bodies for API requests
app.use(express.json());

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Public route
app.get('/', (req, res) => {
  res.render('index', { 
    title: 'Admin Portal',
    user: null 
  });
});

// Protected route - requires 'admin' role
app.get('/dashboard', keycloak.protect('realm:admin'), (req, res) => {
  const userInfo = req.kauth.grant.access_token.content;
  res.render('dashboard', {
    title: 'Admin Dashboard',
    user: {
      name: userInfo.preferred_username || userInfo.name,
      email: userInfo.email,
      roles: userInfo.realm_access?.roles || []
    },
    portal: 'Admin Portal'
  });
});

// ============================================
// REST API Endpoints
// Works with BOTH:
// - Session cookies (browser after login)
// - Bearer token (external clients: mobile, curl)
// ============================================

app.get('/api/profits', keycloak.protect('realm:admin'), (req, res) => {
  const userInfo = req.kauth.grant.access_token.content;
  
  const profits = [
    { id: 1, month: '2026-01', revenue: 150000, expenses: 85000, profit: 65000 },
    { id: 2, month: '2026-02', revenue: 175000, expenses: 92000, profit: 83000 },
    { id: 3, month: '2026-03', revenue: 162000, expenses: 88000, profit: 74000 }
  ];
  
  res.json({
    success: true,
    requestedBy: userInfo.preferred_username,
    data: profits
  });
});

// Proxy to CS Portal customers API (cross-service call)
app.get('/api/customers', keycloak.protect('realm:admin'), async (req, res) => {
  try {
    const token = req.kauth.grant.access_token.token;
    const response = await fetch(`${CS_PORTAL_URL}/api/customers`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers', message: err.message });
  }
});

// Logout route - destroy session and redirect to Keycloak logout
// Using /auth/logout to avoid conflict with keycloak.middleware() which intercepts /logout
app.get('/auth/logout', async (req, res) => {
  const logoutUrl = `${KEYCLOAK_URL}/realms/demo/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(ADMIN_PORTAL_URL + '/')}`;
  
  const sessionId = req.sessionID;
  
  // Destroy the session
  req.session.destroy(async (err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
    
    // Explicitly delete from Redis
    try {
      await redisClient.del(`admin-portal:sess:${sessionId}`);
      console.log(`Deleted Redis session: admin-portal:sess:${sessionId}`);
    } catch (redisErr) {
      console.error('Redis delete error:', redisErr);
    }
    
    // Clear session cookie
    res.clearCookie('connect.sid');
    // Redirect to Keycloak logout
    res.redirect(logoutUrl);
  });
});

app.listen(PORT, () => {
  console.log(`Admin Portal running on http://localhost:${PORT}`);
});
