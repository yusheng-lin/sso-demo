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

## Stopping the Demo

```bash
# Stop Node.js apps (Ctrl+C in each terminal)

# Stop Keycloak
docker-compose down
```
