const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');
const path = require('path');

const app = express();
const PORT = 3001;

// Session configuration
const memoryStore = new session.MemoryStore();
app.use(session({
  secret: 'admin-portal-secret',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

// Keycloak configuration
const keycloak = new Keycloak({ store: memoryStore }, {
  realm: 'demo',
  'auth-server-url': 'http://localhost:8080/',
  'ssl-required': 'external',
  resource: 'admin-portal',
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

// Logout route
app.get('/logout', (req, res) => {
  req.logout ? req.logout() : null;
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Admin Portal running on http://localhost:${PORT}`);
});
