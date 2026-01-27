# SSO Demo with Keycloak

This demo showcases Single Sign-On (SSO) using Keycloak with two Node.js applications:
- **Admin Portal** (port 3001) - Accessible only by users with `admin` role
- **CS Portal** (port 3002) - Accessible by users with `cs` or `admin` role

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Admin Portal   │     │    Keycloak     │     │    CS Portal    │
│   (port 3001)   │◄───►│   (port 8080)   │◄───►│   (port 3002)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       ▲                       │
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                          SSO Flow
```

## Session Architecture

Even with SSO, each application maintains its **own separate session**. Here's how the session layers work:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                  │
├─────────────────────────────────────────────────────────────────┤
│  Cookies:                                                       │
│  ├─ localhost:3001 → connect.sid (Admin Portal session)         │
│  ├─ localhost:3002 → connect.sid (CS Portal session)            │
│  └─ localhost:8080 → KEYCLOAK_SESSION (Keycloak session)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Redis                                   │
├─────────────────────────────────────────────────────────────────┤
│  admin-portal:sess:<session_id_1> → { user grants, tokens }     │
│  cs-portal:sess:<session_id_2>    → { user grants, tokens }     │
└─────────────────────────────────────────────────────────────────┘
```

### How SSO Works with Separate Sessions

1. **Keycloak Session (Identity Provider)**
   - Keycloak maintains ONE session for the authenticated user
   - Stored in browser cookie `KEYCLOAK_SESSION` on `localhost:8080`
   - This is what enables "Single Sign-On"

2. **Application Sessions (Service Providers)**
   - Each application has its own session stored in Redis
   - Admin Portal: `admin-portal:sess:<id>` 
   - CS Portal: `cs-portal:sess:<id>`
   - These store the OAuth tokens and user grants

3. **SSO Flow**
   - User logs into Admin Portal → Redirected to Keycloak → Creates Keycloak session + Admin Portal session
   - User visits CS Portal → Redirected to Keycloak → Keycloak sees existing session → Auto-issues tokens → Creates CS Portal session
   - User experiences "seamless login" because Keycloak session already exists

4. **Logout Considerations**
   - Application logout only destroys that app's session
   - To fully logout, must also logout from Keycloak
   - Keycloak logout invalidates the central session, but app sessions may persist until they expire

## REST API with Bearer Authentication

Both portals expose REST APIs that support **dual authentication**:
- **Session cookies** - For browser-based requests after login
- **Bearer tokens** - For external clients (mobile apps, curl, Postman)

### API Endpoints

| Portal | Endpoint | Required Role | Description |
|--------|----------|---------------|-------------|
| Admin Portal | `/api/profits` | admin | Financial profit data |
| Admin Portal | `/api/customers` | admin | Proxy to CS Portal customers |
| CS Portal | `/api/customers` | cs or admin | Customer list |
| CS Portal | `/api/profits` | cs or admin | Proxy to Admin Portal profits |

### Using Bearer Token Authentication

**1. Get an Access Token from Keycloak:**
```bash
# Get token for admin user
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/demo/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-portal" \
  -d "username=admin" \
  -d "password=admin123" \
  -d "grant_type=password" | jq -r '.access_token')
```

**2. Call the API with Bearer Token:**
```bash
# Query Admin Portal profits API
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/profits

# Query CS Portal customers API
curl -H "Authorization: Bearer $TOKEN" http://localhost:3002/api/customers
```

### Cross-Service API Calls

The portals can call each other's APIs using the user's token:

```
┌─────────────────┐                    ┌─────────────────┐
│  Admin Portal   │  Bearer Token      │    CS Portal    │
│                 │ ──────────────────>│                 │
│ /api/customers  │    (proxy call)    │ /api/customers  │
└─────────────────┘                    └─────────────────┘
```

When an admin user queries `/api/customers` on Admin Portal, it:
1. Extracts the user's access token from the session
2. Forwards the request to CS Portal with `Authorization: Bearer <token>`
3. Returns the response to the user

### Dashboard API Testing

Both dashboards include buttons to test the APIs directly from the browser. These use **session cookies** (not exposed tokens) for security:

```javascript
// Browser fetches use session cookie automatically
fetch('/api/profits', { credentials: 'include' })
```

## Users & Roles

| Username | Password | Role | Admin Portal | CS Portal |
|----------|----------|------|--------------|-----------|
| admin    | admin123 | admin | ✅ Yes | ✅ Yes |
| csuser   | cs123    | cs   | ❌ No | ✅ Yes |

## Prerequisites

- Docker & Docker Compose
- Node.js (v18 or higher)
- npm

## Quick Start

### 1. Start Keycloak

```bash
docker-compose up -d
```

Wait about 30 seconds for Keycloak to fully start. You can check the logs:

```bash
docker-compose logs -f keycloak
```

Keycloak Admin Console: http://localhost:8080/admin
- Username: `admin`
- Password: `admin`

### 2. Install Dependencies

```bash
# Install Admin Portal dependencies
cd admin-portal
npm install

# Install CS Portal dependencies
cd ../cs-portal
npm install
```

### 3. Start the Applications

Open two terminal windows:

**Terminal 1 - Admin Portal:**
```bash
cd admin-portal
npm start
```

**Terminal 2 - CS Portal:**
```bash
cd cs-portal
npm start
```

### 4. Test SSO

1. Open Admin Portal: http://localhost:3001
2. Click "Login with SSO"
3. Login with `admin` / `admin123`
4. You should see the Admin Dashboard
5. Click the "CS Portal" link
6. You should be automatically logged in (SSO magic!)

### 5. Test Access Control

1. Logout from all portals
2. Go to CS Portal: http://localhost:3002
3. Login with `csuser` / `cs123`
4. You can access CS Portal ✅
5. Try to access Admin Portal: http://localhost:3001/dashboard
6. You should get an access denied error ❌

## Project Structure

```
sso_demo/
├── docker-compose.yml          # Keycloak container
├── keycloak/
│   └── realm-export.json       # Realm configuration with users & roles
├── admin-portal/
│   ├── app.js                  # Express app with Keycloak
│   ├── package.json
│   └── views/
│       ├── index.ejs           # Login page
│       └── dashboard.ejs       # Protected dashboard
└── cs-portal/
    ├── app.js                  # Express app with Keycloak
    ├── package.json
    └── views/
        ├── index.ejs           # Login page
        └── dashboard.ejs       # Protected dashboard
```

## Key Configuration

### Role-Based Access Control

**Admin Portal** (`admin-portal/app.js`):
```javascript
app.get('/dashboard', keycloak.protect('realm:admin'), (req, res) => {
  // Only users with 'admin' role can access
});
```

**CS Portal** (`cs-portal/app.js`):
```javascript
app.get('/dashboard', keycloak.protect((token, request) => {
  return token.hasRealmRole('cs') || token.hasRealmRole('admin');
}), (req, res) => {
  // Users with 'cs' OR 'admin' role can access
});
```

## Keycloak Admin Console

Access at: http://localhost:8080/admin (admin/admin)

### Demo Realm Configuration:
- **Realm**: demo
- **Clients**: admin-portal, cs-portal
- **Roles**: admin, cs
- **Users**: admin (admin role), csuser (cs role)

## Troubleshooting

### Keycloak not starting
```bash
docker-compose down
docker-compose up -d
docker-compose logs -f keycloak
```

### Clear browser sessions
If SSO isn't working correctly, clear cookies for localhost or use incognito mode.

### Realm not imported
If users/roles are missing, manually import the realm:
1. Go to Keycloak Admin Console
2. Create realm > Import > Select `keycloak/realm-export.json`

### Checking Redis Sessions

You can inspect the sessions stored in Redis using the Redis CLI:

```bash
# Connect to Redis container
docker exec -it redis redis-cli

# List all session keys
KEYS *sess*

# View a specific session (replace <session_id> with actual ID)
GET "admin-portal:sess:<session_id>"
GET "cs-portal:sess:<session_id>"

# View all Admin Portal sessions
KEYS "admin-portal:sess:*"

# View all CS Portal sessions
KEYS "cs-portal:sess:*"

# Check TTL (time to live) of a session
TTL "admin-portal:sess:<session_id>"

# Delete a specific session manually
DEL "admin-portal:sess:<session_id>"

# Clear all sessions (use with caution!)
FLUSHALL
```

**Example output after login:**
```
127.0.0.1:6379> KEYS *sess*
1) "admin-portal:sess:abc123xyz"
2) "cs-portal:sess:def456uvw"
```

## Stopping the Demo

```bash
# Stop Node.js apps (Ctrl+C in each terminal)

# Stop Keycloak
docker-compose down
```
