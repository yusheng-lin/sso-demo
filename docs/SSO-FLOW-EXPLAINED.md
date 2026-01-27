# SSO Authentication Flow Explained

This document explains how Single Sign-On (SSO) works in this demo using Keycloak and the OAuth2/OpenID Connect protocol.

## Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SSO Architecture                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐         ┌──────────────┐         ┌─────────────┐           │
│   │   Admin     │         │              │         │     CS      │           │
│   │   Portal    │◄───────►│   Keycloak   │◄───────►│   Portal    │           │
│   │  :3001      │         │    :8080     │         │   :3002     │           │
│   └─────────────┘         └──────────────┘         └─────────────┘           │
│         ▲                       ▲                        ▲                   │
│         │                       │                        │                   │
│         └───────────────────────┼────────────────────────┘                   │
│                                 │                                            │
│                          ┌──────┴──────┐                                     │
│                          │   Browser   │                                     │
│                          │   (User)    │                                     │
│                          └─────────────┘                                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## The OAuth2 Authorization Code Flow

This demo uses the **Authorization Code Flow**, which is the most secure OAuth2 flow for web applications.

### Step-by-Step Flow

```
┌─────────┐                    ┌─────────────┐                    ┌──────────┐
│ Browser │                    │  CS Portal  │                    │ Keycloak │
└────┬────┘                    └──────┬──────┘                    └────┬─────┘
     │                                │                                 │
     │  1. GET /dashboard             │                                 │
     │───────────────────────────────►│                                 │
     │                                │                                 │
     │                                │  (No token found in session)    │
     │                                │                                 │
     │  2. 302 Redirect to Keycloak   │                                 │
     │◄───────────────────────────────│                                 │
     │                                │                                 │
     │  3. GET /realms/demo/protocol/openid-connect/auth                │
     │     ?client_id=cs-portal                                         │
     │     &redirect_uri=http://localhost:3002/dashboard                │
     │     &response_type=code                                          │
     │     &state=xxx                                                   │
     │─────────────────────────────────────────────────────────────────►│
     │                                │                                 │
     │  4. Keycloak Login Page        │                                 │
     │◄─────────────────────────────────────────────────────────────────│
     │                                │                                 │
     │  5. User enters credentials    │                                 │
     │─────────────────────────────────────────────────────────────────►│
     │                                │                                 │
     │  6. 302 Redirect back with CODE                                  │
     │     http://localhost:3002/dashboard                              │
     │     ?auth_callback=1                                             │
     │     &code=c7a92c9d-aa3b-...                                      │
     │     &state=xxx                                                   │
     │◄─────────────────────────────────────────────────────────────────│
     │                                │                                 │
     │  7. GET /dashboard?auth_callback=1&code=...                      │
     │───────────────────────────────►│                                 │
     │                                │                                 │
     │                                │  8. Exchange code for tokens    │
     │                                │     POST /token                 │
     │                                │     (code + client_id)          │
     │                                │────────────────────────────────►│
     │                                │                                 │
     │                                │  9. Return tokens               │
     │                                │     - access_token (JWT)        │
     │                                │     - refresh_token             │
     │                                │     - id_token                  │
     │                                │◄────────────────────────────────│
     │                                │                                 │
     │                                │  10. Store in session           │
     │                                │      (req.kauth.grant)          │
     │                                │                                 │
     │  11. 302 Redirect to /dashboard (clean URL)                      │
     │◄───────────────────────────────│                                 │
     │                                │                                 │
     │  12. GET /dashboard            │                                 │
     │───────────────────────────────►│                                 │
     │                                │                                 │
     │                                │  13. Token found! Check roles   │
     │                                │      keycloak.protect(...)      │
     │                                │                                 │
     │  14. 200 OK (Dashboard HTML)   │                                 │
     │◄───────────────────────────────│                                 │
     │                                │                                 │
```

## Code Explanation

### 1. Keycloak Middleware (app.js line 28)

```javascript
app.use(keycloak.middleware());
```

This middleware does several things:
- **Intercepts auth callbacks**: When URL contains `?auth_callback=1`, it handles the OAuth2 callback
- **Exchanges code for tokens**: Takes the `code` parameter and calls Keycloak's token endpoint
- **Stores tokens in session**: Saves `access_token`, `refresh_token`, and `id_token` in `req.kauth.grant`
- **Handles logout**: Manages the logout flow with Keycloak

### 2. Protected Route (app.js line 44-57)

```javascript
app.get('/dashboard', keycloak.protect((token, request) => {
  return token.hasRealmRole('cs') || token.hasRealmRole('admin');
}), (req, res) => {
  const userInfo = req.kauth.grant.access_token.content;
  // ...
});
```

**Where does `token` come from?**

1. `keycloak.protect()` is a middleware that checks for authentication
2. If no token exists → redirects to Keycloak login
3. If token exists → passes it to your callback function
4. The `token` parameter is actually `req.kauth.grant.access_token`

### 3. Token Structure

The access token is a **JWT (JSON Web Token)** with this structure:

```javascript
// token.content contains:
{
  "exp": 1706400000,           // Expiration time
  "iat": 1706396400,           // Issued at
  "sub": "user-uuid",          // Subject (user ID)
  "preferred_username": "csuser",
  "email": "csuser@example.com",
  "realm_access": {
    "roles": ["cs", "default-roles-demo"]  // ← Roles are here!
  },
  "resource_access": {
    "cs-portal": {
      "roles": ["user"]
    }
  }
}
```

### 4. Role Checking Methods

```javascript
// Check realm-level roles
token.hasRealmRole('admin')      // true if user has 'admin' realm role
token.hasRealmRole('cs')         // true if user has 'cs' realm role

// Check client-specific roles
token.hasRole('user')            // Checks current client's roles
token.hasApplicationRole('cs-portal', 'manager')  // Check specific client role
```

## Understanding the Callback URL

When you see this URL after login:

```
http://localhost:3002/dashboard?auth_callback=1&state=5a1708b9-...&code=c7a92c9d-...
```

| Parameter | Purpose |
|-----------|---------|
| `auth_callback=1` | Tells keycloak-connect this is an OAuth callback |
| `state` | CSRF protection - must match the original request |
| `session_state` | Keycloak session identifier for SSO |
| `iss` | Issuer - identifies which Keycloak realm |
| `code` | Authorization code to exchange for tokens |

**Important**: The `code` is NOT the token! It's a one-time code that must be exchanged server-side for actual tokens.

## SSO Magic Explained

SSO enables users to authenticate once with Keycloak and access multiple applications without re-entering credentials. However, **access is still controlled by role-based permissions**.

### Important: Role-Based Access Control

- **CS Portal**: Requires `cs` OR `admin` role
- **Admin Portal**: Requires `admin` role ONLY

This means:
- ✅ CS users can access CS Portal
- ❌ CS users **CANNOT** access Admin Portal (missing admin role)
- ✅ Admin users can access both portals (admin role grants CS portal access too)

### How SSO Works (When User Has Required Roles)

When a user with an active Keycloak session accesses another application:

```
┌─────────┐                    ┌──────────────┐                    ┌──────────┐
│ Browser │                    │ Another App  │                    │ Keycloak │
└────┬────┘                    └──────┬───────┘                    └────┬─────┘
     │                                │                                 │
     │  1. GET /dashboard             │                                 │
     │───────────────────────────────►│                                 │
     │                                │                                 │
     │  2. 302 Redirect to Keycloak   │                                 │
     │◄───────────────────────────────│                                 │
     │                                │                                 │
     │  3. GET /auth?client_id=...                                      │
     │     (Browser sends Keycloak session cookie!)                     │
     │─────────────────────────────────────────────────────────────────►│
     │                                │                                 │
     │  4. Keycloak checks:                                             │
     │     - Valid session? ✓                                           │
     │     - Required roles? (checks this)                              │
     │     - If YES: 302 Redirect with code **(NO LOGIN PAGE!)**        │
     │     - If NO: Access denied                                       │
     │◄─────────────────────────────────────────────────────────────────│
     │                                │                                 │
     │  ... rest of flow continues ...                                  │
```

The SSO works because:
1. Keycloak sets a session cookie in the browser
2. This cookie is sent whenever the browser visits Keycloak
3. If the session is valid **AND** user has required roles, Keycloak skips the login page

### Admin User Accessing CS Portal

The same SSO magic works in reverse! Once an admin user is logged into Admin Portal, they can seamlessly access CS Portal:

```
┌─────────┐                    ┌───────────┐                     ┌──────────┐
│ Browser │                    │ CS Portal │                     │ Keycloak │
└────┬────┘                    └─────┬─────┘                     └────┬─────┘
     │                               │                                │
     │  1. GET /dashboard            │                                │
     │──────────────────────────────►│                                │
     │                               │                                │
     │  2. 302 Redirect to Keycloak  │                                │
     │◄──────────────────────────────│                                │
     │                               │                                │
     │  3. GET /auth?client_id=cs-portal                              │
     │     (Browser sends Keycloak session cookie from Admin Portal!) │
     │───────────────────────────────────────────────────────────────►│
     │                               │                                │
     │  4. Keycloak checks:                                           │
     │     - Valid session? ✓                                         │
     │     - User has 'cs' or 'admin' role? ✓ (admin role)            │
     │     - Automatic approval!                                      │
     │     302 Redirect with code                                     │
     │◄───────────────────────────────────────────────────────────────│
     │                               │                                │
     │  5. GET /dashboard?auth_callback=1&code=...                    │
     │──────────────────────────────►│                                │
     │                               │                                │
     │                               │  6. Exchange code for tokens   │
     │                               │───────────────────────────────►│
     │                               │◄───────────────────────────────│
     │                               │                                │
     │  7. 200 OK (Dashboard HTML)   │                                │
     │◄──────────────────────────────│                                │
```

**Why this works:**

1. **Shared Keycloak session**: Both portals use the same Keycloak realm (`demo`)
2. **Admin has CS access**: The CS Portal's protection allows users with either `cs` OR `admin` role:
   ```javascript
   keycloak.protect((token, request) => {
     return token.hasRealmRole('cs') || token.hasRealmRole('admin');
   })
   ```
3. **Role hierarchy**: Admin users typically have elevated permissions and can access CS portal
4. **No re-authentication**: The browser already has Keycloak session cookie, so login page is skipped

**User Experience:**

- Admin logs into Admin Portal at `localhost:3001`
- Admin clicks a link to CS Portal at `localhost:3002`
- **Instantly** redirected to CS Portal dashboard - no login required!
- The entire auth flow happens in milliseconds with multiple redirects, invisible to the user

## REST API with Bearer Token Authentication

Each portal exposes protected REST APIs that require Bearer token authentication:

| Portal | API Endpoint | Required Role |
|--------|-------------|---------------|
| Admin Portal | `GET /api/profits` | `admin` |
| CS Portal | `GET /api/customers` | `cs` OR `admin` |

### How Bearer Token Authentication Works

```
┌─────────┐                    ┌───────────┐                    ┌──────────┐
│ Client  │                    │   API     │                    │ Keycloak │
│ (curl)  │                    │  Server   │                    │          │
└────┬────┘                    └─────┬─────┘                    └────┬─────┘
     │                               │                               │
     │  1. POST /token               │                               │
     │     (username + password)     │                               │
     │──────────────────────────────────────────────────────────────►│
     │                               │                               │
     │  2. Return access_token (JWT) │                               │
     │◄──────────────────────────────────────────────────────────────│
     │                               │                               │
     │  3. GET /api/profits          │                               │
     │     Authorization: Bearer <token>                             │
     │──────────────────────────────►│                               │
     │                               │                               │
     │                               │  4. Verify JWT signature      │
     │                               │     & check roles             │
     │                               │                               │
     │  5. 200 OK (JSON data)        │                               │
     │◄──────────────────────────────│                               │
```

### Step 1: Get Access Token from Keycloak

Use Keycloak's token endpoint with Resource Owner Password Credentials grant:

```bash
# Get token for admin user
curl -X POST "http://localhost:8080/realms/demo/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-portal" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6Ikp...",
  "expires_in": 300,
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI...",
  "token_type": "Bearer"
}
```

### Step 2: Call API with Bearer Token

```bash
# Store token in variable
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/demo/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-portal" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

# Call Admin Portal profits API
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/profits

# Call CS Portal customers API (admin can access both!)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3002/api/customers
```

### API Responses

**Successful Response:**
```json
{
  "success": true,
  "requestedBy": "admin",
  "data": [
    { "id": 1, "month": "2026-01", "revenue": 150000, "expenses": 85000, "profit": 65000 },
    { "id": 2, "month": "2026-02", "revenue": 175000, "expenses": 92000, "profit": 83000 }
  ]
}
```

**Access Denied (wrong role):**
```bash
# CS user trying to access profits API
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/demo/protocol/openid-connect/token" \
  -d "client_id=cs-portal" -d "username=csuser" -d "password=csuser" \
  -d "grant_type=password" -H "Content-Type: application/x-www-form-urlencoded" | jq -r '.access_token')

curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/profits
# Returns: 403 Forbidden - Access denied
```

### How keycloak-connect Validates Bearer Tokens

The `keycloak.protect()` middleware automatically handles both:
1. **Session-based auth** (browser with cookies)
2. **Bearer token auth** (API clients with Authorization header)

When it receives a request with `Authorization: Bearer <token>`:

1. **Extracts the JWT** from the header
2. **Verifies the signature** using Keycloak's public key
3. **Checks expiration** (`exp` claim)
4. **Validates the issuer** matches Keycloak realm
5. **Checks roles** based on your `protect()` configuration

```javascript
// This works for BOTH browser sessions AND Bearer tokens!
app.get('/api/profits', keycloak.protect('realm:admin'), (req, res) => {
  // Token is available in req.kauth.grant.access_token
  const userInfo = req.kauth.grant.access_token.content;
  // ...
});
```

### Access Matrix

| User | `/api/profits` (Admin Portal) | `/api/customers` (CS Portal) |
|------|------------------------------|------------------------------|
| admin | ✅ Has `admin` role | ✅ Has `admin` role |
| csuser | ❌ No `admin` role | ✅ Has `cs` role |

## Security Notes

### Why Authorization Code Flow?

1. **Code is short-lived**: The authorization code expires quickly (usually 1 minute)
2. **Tokens never exposed in URL**: Tokens are exchanged server-side
3. **Client secret optional**: Public clients (like this demo) can work without secrets
4. **PKCE support**: Additional protection against code interception

### Session Storage

In this demo, sessions (including tokens) are stored in **Redis** for production-ready session management:

```javascript
const { createClient } = require('redis');
const RedisStore = require('connect-redis').default;

// Initialize Redis client
const redisClient = createClient({ url: 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// Create Redis store
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'admin-portal:'  // Prefix for session keys
});

app.use(session({
  store: redisStore,
  secret: 'admin-portal-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,    // Set to true with HTTPS
    httpOnly: true,   // Prevents XSS access to cookie
    maxAge: 1000 * 60 * 60 * 24  // 24 hours
  }
}));
```

**Why Redis for sessions?**

| Feature | MemoryStore | Redis |
|---------|-------------|-------|
| Persistence | ❌ Lost on restart | ✅ Survives restarts |
| Scalability | ❌ Single server only | ✅ Multiple servers can share |
| Production-ready | ❌ No | ✅ Yes |
| Session sharing | ❌ No | ✅ Across services |

**View sessions in Redis:**

```bash
# Connect to Redis CLI
docker exec -it redis redis-cli

# List all session keys
KEYS *portal*

# View a specific session
GET "admin-portal:sess:<sessionId>"
```

## Logout Flow

Proper logout requires cleaning up both the application session and Keycloak session:

```javascript
app.get('/logout', (req, res) => {
  const logoutUrl = `http://localhost:8080/realms/demo/protocol/openid-connect/logout?redirect_uri=${encodeURIComponent('http://localhost:3001/')}`;
  
  // 1. Destroy session (removes from Redis)
  req.session.destroy((err) => {
    if (err) console.error('Session destruction error:', err);
    
    // 2. Clear session cookie from browser
    res.clearCookie('connect.sid');
    
    // 3. Redirect to Keycloak logout (ends SSO session)
    res.redirect(logoutUrl);
  });
});
```

### What Gets Cleaned Up

| Step | Action | Result |
|------|--------|--------|
| 1 | `req.session.destroy()` | Deletes session from Redis |
| 2 | `res.clearCookie('connect.sid')` | Removes cookie from browser |
| 3 | Keycloak logout redirect | Ends Keycloak SSO session |

### Verify Session Deletion

```bash
# Before logout
docker exec -it redis redis-cli KEYS '*portal*'
# Shows: "admin-portal:sess:abc123..."

# After logout
docker exec -it redis redis-cli KEYS '*portal*'
# Shows: (empty array)
```

## Debugging Tips

### View Token Contents

Add this to see what's in the token:

```javascript
app.get('/debug', keycloak.protect(), (req, res) => {
  res.json({
    accessToken: req.kauth.grant.access_token.content,
    idToken: req.kauth.grant.id_token?.content,
    roles: req.kauth.grant.access_token.content.realm_access?.roles
  });
});
```

### Check Keycloak Logs

```bash
docker-compose logs -f keycloak
```

### Browser Developer Tools

1. Open **Network** tab
2. Look for redirects (302 responses)
3. Check cookies for `KEYCLOAK_SESSION`

## Summary

| Component | Responsibility |
|-----------|----------------|
| **Browser** | Follows redirects, stores cookies |
| **Node.js App** | Initiates auth, exchanges codes, stores tokens |
| **keycloak-connect** | Handles OAuth2 flow, token validation |
| **Keycloak** | Authenticates users, issues tokens, manages sessions |

The beauty of SSO is that users authenticate **once** with Keycloak, and all connected applications recognize that session!
