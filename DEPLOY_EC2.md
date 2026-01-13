# Deploy to EC2 (Ubuntu)

## 1) Install Docker + Compose plugin
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## 2) Security group ports
Allow inbound:
- 22 (SSH)
- 80 (HTTP)
- 443 (HTTPS, optional)

## 3) Clone repo + configure env
```bash
git clone <your-repo-url> dashboard
cd dashboard
cp .env.example .env
```
Update `.env` and service-specific env files:
- `api-gateway/.env`
- `tenant-router/.env`
- `alerts-service/.env`
- `analytics/.env`

## 4) Start services
```bash
docker compose up -d --build
docker compose logs -f api-gateway
```

## Optional: domain + SSL (Nginx + Certbot)
If you want HTTPS, place Nginx in front of `api-gateway` and use Certbot:
1. Point your domain to the EC2 public IP.
2. Install Nginx and Certbot:
   ```bash
   sudo apt-get install -y nginx certbot python3-certbot-nginx
   ```
3. Configure Nginx to proxy to `http://127.0.0.1:80` and run:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```
