# Reverse Proxy & HTTPS Setup

MergeWatch's self-hosted stack runs on ports 3000 (server) and 3001 (dashboard). For production, you need a reverse proxy with HTTPS — GitHub webhook deliveries require a public HTTPS URL, and the dashboard uses OAuth callbacks that should be secured.

This guide covers **Caddy** (recommended — automatic TLS), **nginx**, and **tunnel options** for local development.

---

## Option 1: Caddy (recommended)

Caddy automatically provisions and renews TLS certificates via Let's Encrypt. Zero config for HTTPS.

### Add Caddy to docker-compose

Create a `Caddyfile` next to your `docker-compose.yml`:

```
mergewatch.your-domain.com {
    reverse_proxy mergewatch:3000
}

dashboard.your-domain.com {
    reverse_proxy dashboard:3001
}
```

Add the Caddy service to `docker-compose.yml`:

```yaml
services:
  # ... existing mergewatch, dashboard, db services ...

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - mergewatch
      - dashboard

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

### Update your `.env`

```bash
DASHBOARD_URL=https://dashboard.your-domain.com
```

### Update your GitHub App

Set the webhook URL to `https://mergewatch.your-domain.com/webhook` and the OAuth callback URL to `https://dashboard.your-domain.com/api/auth/callback/github`.

### DNS

Point both subdomains to your server's IP:

```
mergewatch.your-domain.com  → A  → <your-server-ip>
dashboard.your-domain.com   → A  → <your-server-ip>
```

Start the stack:

```bash
docker-compose up -d
```

Caddy will automatically obtain TLS certificates on first request. That's it.

### Single-domain alternative

If you prefer one domain, use path-based routing:

```
your-domain.com {
    handle /webhook* {
        reverse_proxy mergewatch:3000
    }
    handle /health* {
        reverse_proxy mergewatch:3000
    }
    handle /* {
        reverse_proxy dashboard:3001
    }
}
```

---

## Option 2: nginx

If you already run nginx, add a config for MergeWatch.

### `/etc/nginx/sites-available/mergewatch`

```nginx
server {
    listen 443 ssl http2;
    server_name mergewatch.your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/mergewatch.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mergewatch.your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name dashboard.your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/dashboard.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name mergewatch.your-domain.com dashboard.your-domain.com;
    return 301 https://$host$request_uri;
}
```

Obtain certificates with certbot:

```bash
sudo certbot certonly --nginx -d mergewatch.your-domain.com -d dashboard.your-domain.com
```

---

## Option 3: Tunnels (local development)

For local development or testing webhooks, use a tunnel to expose your local server to the internet without a public IP or DNS.

### Cloudflare Tunnel (free, no port forwarding)

```bash
# Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:3000
```

Use the generated `*.trycloudflare.com` URL as your GitHub App webhook URL.

### ngrok

```bash
ngrok http 3000
```

Use the generated `*.ngrok-free.app` URL as your webhook URL.

> **Note:** Tunnel URLs change on restart (free tier). Update your GitHub App webhook URL each time, or use a paid plan for stable subdomains.

---

## Checklist

After setting up your reverse proxy:

- [ ] `curl https://mergewatch.your-domain.com/health` returns `{ "status": "ok" }`
- [ ] GitHub App webhook URL is set to `https://mergewatch.your-domain.com/webhook`
- [ ] GitHub App OAuth callback URL is `https://dashboard.your-domain.com/api/auth/callback/github`
- [ ] `DASHBOARD_URL` in `.env` matches your dashboard's public URL
- [ ] Dashboard login works at `https://dashboard.your-domain.com`
