# Deployment

The public demo runs on one EC2 instance as two Docker containers started by `docker-compose.yml`: `backend`, the FastAPI server, and `frontend`, nginx serving the built frontend. Both listen on 127.0.0.1 only. nginx on the server itself terminates HTTPS and proxies `/api/` to the backend and everything else to the frontend. Secrets and settings live in a `.env` file next to `docker-compose.yml`.

```
visitor ──HTTPS──> server nginx :443 ──┬── /api/*  ──> backend  127.0.0.1:8000 (uvicorn)
                                       └── else    ──> frontend 127.0.0.1:8080 (nginx, static build)
```

The backend runs as exactly one container with one uvicorn process. Sessions, rate windows and the day's spend live in its memory (`11-abuse-protection.md`, State and logging), so it must never be scaled to several replicas or workers.

## Files

- `backend/Dockerfile`: Python 3.12 slim with the locked dependencies (`uv sync --frozen --no-dev`), the code, and the demo catalog with its embedding model, generated, ingested and embedded at build time (`02-catalog.md`), so the container starts without downloading anything. The catalog stage copies only the code it runs, so it is rebuilt when the catalog code or the generator changes, not on every API change. It runs as a non-root user, has a health check on `GET /api/health`, and starts `uvicorn app.main:app` on port 8000 without auto-reload. `backend/.dockerignore` leaves out `.env`, the virtual environment, the built catalog, the tests and the evals.
- `frontend/Dockerfile`: builds the frontend with Node 24, calling the API on its own origin (an empty `VITE_API_BASE_URL`) and taking the Turnstile site key as the `VITE_TURNSTILE_SITE_KEY` build argument, then serves the build with nginx as a non-root user on port 8080. `frontend/nginx.conf` caches the hashed files under `/assets/` for a year, makes everything else revalidate, compresses text, and sends `nosniff` and a referrer policy. `frontend/.dockerignore` leaves out `node_modules`, build output and test results.
- `docker-compose.yml`: the two services. `backend` reads `.env`; `frontend` gets `VITE_TURNSTILE_SITE_KEY` from `.env` at build time. They publish 127.0.0.1:8000 and 127.0.0.1:8080, restart unless stopped, and rotate their logs (3 files of 10 MB).
- `.env.example`: every setting the backend reads, with the production values from `11-abuse-protection.md`, `LLM_PROVIDER=gemini`, `CLIENT_IP_HEADER=X-Real-IP`, and empty keys. `.env` itself is git-ignored.

## First deployment

1. **Instance:** Ubuntu 24.04, `t3.small` or `t4g.small` (2 GB), 20 GB disk, an Elastic IP. Security group inbound: 22 from your own IP, 80 and 443 from anywhere. The ports 8000 and 8080 stay closed: the containers bind to 127.0.0.1.
2. **Software:** Docker Engine with the compose plugin (Docker's apt repository: https://docs.docker.com/engine/install/ubuntu/), nginx and git. A 2 GB instance needs swap for the first build:

   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

3. **Code and secrets:**

   ```bash
   git clone https://github.com/kumaranupam-personal/ai_shopping_assistant.git
   cd ai_shopping_assistant
   cp .env.example .env
   chmod 600 .env
   nano .env          # fill in LLM_GEMINI_API_KEY, and the Turnstile keys if used
   ```

4. **Start**, which takes several minutes the first time, most of it embedding the catalog:

   ```bash
   sudo docker compose up -d --build
   sudo docker compose ps          # backend shows "healthy"
   curl http://127.0.0.1:8000/api/health
   ```

5. **Server nginx:** the site below, saved as `/etc/nginx/sites-available/saathi`, linked into `sites-enabled` (removing `default`), then `sudo nginx -t && sudo systemctl reload nginx`. HTTPS is added by `sudo certbot --nginx -d <domain>` (package `python3-certbot-nginx`), which edits this file and renews the certificate itself.

   ```nginx
   server {
       listen 80;
       server_name <domain>;           # or _ to answer on the IP
       client_max_body_size 64k;       # the API's largest body is a chat message

       location /api/ {
           proxy_pass http://127.0.0.1:8000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           # The backend's per-IP limits read this (CLIENT_IP_HEADER=X-Real-IP). Setting it here replaces any value
           # a visitor sent, so it can't be forged.
           proxy_set_header X-Real-IP $remote_addr;
           # Chat replies are a server-sent event stream: pass each event on at once, and allow long turns.
           proxy_buffering off;
           proxy_cache off;
           proxy_read_timeout 300s;
       }

       location / {
           proxy_pass http://127.0.0.1:8080;
           proxy_set_header Host $host;
       }
   }
   ```

6. **Check:** the site shows the landing with the featured products, and a chat message gets a reply that streams in.

## Operating

All commands run in the repository's folder on the server.

- **Release:** `git pull`, then `sudo docker compose up -d --build`. Compose recreates only the containers whose image or settings changed, then `sudo docker image prune -f` removes the old images.
- **Change a secret or setting:** edit `.env`, then `sudo docker compose up -d`, which recreates the backend with the new values. A changed `VITE_TURNSTILE_SITE_KEY` needs `sudo docker compose up -d --build frontend`, since it is built into the frontend.
- **Pause chat:** `CHAT_ENABLED=false` in `.env`, then `sudo docker compose up -d`.
- **Memory:** recreating the backend container ends open chats (visitors see the expired-chat notice), empties the rate windows and starts the day's spend again from 0, so more than one restart in a UTC day can let spending exceed `DAILY_BUDGET_USD`. A frontend-only release leaves the backend running.
- **Logs:** `sudo docker compose logs -f backend`, including one line per abuse-protection rejection with the client IP; `sudo docker compose logs -f frontend`.
- **Status:** `sudo docker compose ps`.

## Adding Cloudflare

Cloudflare's proxy is optional and can come any time after the domain works over HTTPS. Until it is in front, keep `CLIENT_IP_HEADER=X-Real-IP`: the server's nginx sets that header itself, while `CF-Connecting-IP` could be sent by anyone reaching the instance directly.

1. Add the domain to Cloudflare, move its nameservers there, and proxy its `A` record (orange cloud).
2. Set SSL/TLS to Full (strict). The certbot certificate keeps renewing behind the proxy, since Cloudflare passes Let's Encrypt's HTTP check through.
3. Add the WAF custom rule from `11-abuse-protection.md` (Proxy requirements): URI path starts with `/api/`, action Skip, skipping every challenge feature.
4. Check that responses come through Cloudflare: `curl -sI https://<domain>/` shows `server: cloudflare` and a `cf-ray` header.
5. Limit inbound 80 and 443 in the security group to Cloudflare's ranges (https://www.cloudflare.com/ips/), so the instance can't be reached around the proxy.
6. Set `CLIENT_IP_HEADER=CF-Connecting-IP` in `.env` and run `sudo docker compose up -d`. A rejection's log line should then show the visitor's own IP, not a Cloudflare address.
