#!/bin/bash

echo "🚀 Starting SSO Demo Setup..."

# Start Keycloak
echo "📦 Starting Keycloak..."
docker-compose up -d

echo "⏳ Waiting for Keycloak to start (30 seconds)..."
sleep 30

# Install dependencies
echo "📥 Installing Admin Portal dependencies..."
cd admin-portal && npm install

echo "📥 Installing CS Portal dependencies..."
cd ../cs-portal && npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the applications, run the following in separate terminals:"
echo ""
echo "  Terminal 1 (Admin Portal):"
echo "    cd admin-portal && npm start"
echo ""
echo "  Terminal 2 (CS Portal):"
echo "    cd cs-portal && npm start"
echo ""
echo "📍 URLs:"
echo "  - Admin Portal: http://localhost:3001"
echo "  - CS Portal:    http://localhost:3002"
echo "  - Keycloak:     http://localhost:8080/admin (admin/admin)"
echo ""
echo "👤 Test Users:"
echo "  - admin / admin123 (can access both portals)"
echo "  - csuser / cs123   (can only access CS Portal)"
