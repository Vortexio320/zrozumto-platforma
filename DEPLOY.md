# Deploying ZrozumTo Platform on Claw Cloud (VPS)

This guide will help you deploy the application to your Virtual Private Server (VPS) running Linux (e.g., Ubuntu).

## Prerequisites
- A VPS instance (Claw Cloud).
- **CRITICAL for 2GB RAM**: You MUST enable Swap space to prevent crashes.

### Step 0: Enable Swap (Prevent Out-Of-Memory)
Run this on your server BEFORE installing anything:
```bash
# Check if swap exists
sudo swapon --show

# If empty, create 2GB swap file
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make it permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Step 1: Install Docker & Docker Compose
Connect to your server via SSH and run:

```bash
# Update package list
sudo apt-get update

# Install Docker
sudo apt-get install -y docker.io

# Install Docker Compose
sudo apt-get install -y docker-compose

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker
```

## Step 2: Upload Project Files
Copy the entire project folder `zrozumto-platforma` to your server (e.g., to `/home/user/app`).
Key files needed:
- `requirements.txt`
- `Dockerfile`
- `docker-compose.yml`
- `.env` (Create this manually or copy securely!)
- `app/` folder
- `static/` folder

## Step 3: Configure Environment
Create the `.env` file on the server:

```bash
cd /home/user/app
nano .env
```
Paste your secrets (from your local `.env`):
```env
GOOGLE_API_KEY=...
SUPABASE_URL=...
SUPABASE_KEY=...
SUPABASE_ANON_KEY=...
WEBHOOK_SECRET=...
```
Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

## Step 4: Run the Application
Start the container in the background:

```bash
sudo docker-compose up -d --build
```

## Step 5: Verify
Check if both services are running:
```bash
sudo docker-compose ps
```

- **App**: `http://YOUR_SERVER_IP:8000/docs`
- **n8n**: `http://YOUR_SERVER_IP:5678` (Setup your admin account here first!)

## Step 6: Configure n8n Workflow
Since n8n is running on the *same machine* as the app, they share a Docker network.
You can streamline the connection:

1. In the **HTTP Request** node (Send to API):
   - Change URL from `http://localhost:8000/...` to `http://web:8000/webhooks/ingest`
   - `web` is the internal hostname of your app container.
   - This makes the connection faster and safer (internal traffic).

2. **Resources Note**:
   - Starting n8n + python app might require ~2GB+ RAM. If you see crashes, try upgrading the VPS memory.

