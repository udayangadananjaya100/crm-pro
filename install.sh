#!/bin/bash

echo "==============================================="
echo "      Pro CRM — Automated Installation         "
echo "==============================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null
then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null
then
    echo "❌ Docker Compose is not installed. Please install it first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed."

# Setup directories
echo "📁 Creating data and logs directories..."
mkdir -p data logs
chmod 777 data logs

# Setup .env file
if [ ! -f .env ]; then
    echo "⚙️ Creating .env file..."
    cp .env.example .env
    
    # Generate a random JWT secret
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s/JWT_SECRET=changeme_production_secret_key/JWT_SECRET=$JWT_SECRET/g" .env
    
    echo "✅ .env file created."
else
    echo "✅ .env file already exists."
fi

# Start services
echo "🚀 Building and starting Pro CRM containers..."
docker compose up -d --build

echo "==============================================="
echo "🎉 Installation Complete!"
echo "Pro CRM is now running at: http://localhost:3000"
echo "If this is your first time, you will see the Setup Wizard."
echo "==============================================="
