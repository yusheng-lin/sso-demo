const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');
const path = require('path');
const { createClient } = require('redis');
const RedisStore = require('connect-redis').default;

const app = express();
const PORT = process.env.PORT || 3002;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const ADMIN_PORTAL_URL = process.env.ADMIN_PORTAL_URL || 'http://localhost:3001';
const CS_PORTAL_URL = process.env.CS_PORTAL_URL || 'http://localhost:3002';

// Initialize Redis client
const redisClient = createClient({ url: REDIS_URL });
redisClient.connect().catch(console.error);

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

// Redis store for sessions
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'cs-portal:sess:'
});

// MemoryStore for Keycloak grant cache (required for OAuth code exchange)
const memoryStore = new session.MemoryStore();

app.use(session({
  store: redisStore,
  secret: 'cs-portal-secret',
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
  resource: 'cs-portal',
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
    title: 'CS Portal',
    user: null 
  });
});

// Protected route - requires 'cs' OR 'admin' role (admin can access everything)
app.get('/dashboard', keycloak.protect((token, request) => {
  console.log('Token content:', token.content);  // Shows decoded JWT
  console.log('Realm roles:', token.content.realm_access?.roles);
  return token.hasRealmRole('cs') || token.hasRealmRole('admin');
}), (req, res) => {
  const userInfo = req.kauth.grant.access_token.content;
  res.render('dashboard', {
    title: 'CS Dashboard',
    user: {
      name: userInfo.preferred_username || userInfo.name,
      email: userInfo.email,
      roles: userInfo.realm_access?.roles || []
    },
    portal: 'Customer Service Portal'
  });
});

// ============================================
// REST API Endpoints
// Works with BOTH:
// - Session cookies (browser after login)
// - Bearer token (external clients: mobile, curl)
// ============================================

app.get('/api/customers', keycloak.protect((token) => {
  return token.hasRealmRole('cs') || token.hasRealmRole('admin');
}), (req, res) => {
  const userInfo = req.kauth.grant.access_token.content;
  
  const customers = [
    { id: 1, name: 'Alice Chen', email: 'alice@example.com', status: 'active' },
    { id: 2, name: 'Bob Wang', email: 'bob@example.com', status: 'active' },
    { id: 3, name: 'Carol Liu', email: 'carol@example.com', status: 'pending' }
  ];
  
  res.json({
    success: true,
    requestedBy: userInfo.preferred_username,
    data: customers
  });
});

// Proxy to Admin Portal profits API (cross-service call)
app.get('/api/profits', keycloak.protect((token) => {
  return token.hasRealmRole('cs') || token.hasRealmRole('admin');
}), async (req, res) => {
  try {
    const token = req.kauth.grant.access_token.token;
    const response = await fetch(`${ADMIN_PORTAL_URL}/api/profits`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: 'Access Denied', 
        message: 'You do not have permission to access profits data (requires admin role)' 
      });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profits', message: err.message });
  }
});

// Logout route - destroy session and redirect to Keycloak logout
// Using /auth/logout to avoid conflict with keycloak.middleware() which intercepts /logout
app.get('/auth/logout', async (req, res) => {
  console.log('Initiating logout process for CS Portal');
  const logoutUrl = `${KEYCLOAK_URL}/realms/demo/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent(CS_PORTAL_URL + '/')}`;
  
  const sessionId = req.sessionID;
  
  // Destroy the session
  req.session.destroy(async (err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
    
    // Explicitly delete from Redis
    try {
      await redisClient.del(`cs-portal:sess:${sessionId}`);
      console.log(`Deleted Redis session: cs-portal:sess:${sessionId}`);
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
  console.log(`CS Portal running on http://localhost:${PORT}`);
});
