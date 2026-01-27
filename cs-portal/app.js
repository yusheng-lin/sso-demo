const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');
const path = require('path');

const app = express();
const PORT = 3002;

// Session configuration
const memoryStore = new session.MemoryStore();
app.use(session({
  secret: 'cs-portal-secret',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

// Keycloak configuration
const keycloak = new Keycloak({ store: memoryStore }, {
  realm: 'demo',
  'auth-server-url': 'http://localhost:8080/',
  'ssl-required': 'external',
  resource: 'cs-portal',
  'public-client': true,
  'confidential-port': 0
});

app.use(keycloak.middleware());

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

// Logout route
app.get('/logout', (req, res) => {
  req.logout ? req.logout() : null;
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`CS Portal running on http://localhost:${PORT}`);
});
