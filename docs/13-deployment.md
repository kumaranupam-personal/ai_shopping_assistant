# Deployment

The public demo runs on one EC2 instance as two Docker containers started by `docker-compose.yml`: `backend`, the FastAPI server, and `frontend`, nginx serving the built frontend. Both listen on 127.0.0.1 only. nginx on the server itself terminates HTTPS and proxies `/saathi/api/` to the backend and everything else to the frontend. Secrets and settings live in a `.env` file next to `docker-compose.yml`.

```
visitor ──HTTPS──> server nginx :443 ──┬── /saathi/api/*  ──> backend  127.0.0.1:8000 (uvicorn), as /api/*
                                       └── else           ──> frontend 127.0.0.1:8080 (nginx, static build)
```

The backend runs as exactly one container with one uvicorn process. Sessions, rate windows and the day's spend live in its memory (`11-abuse-protection.md`, State and logging), so it must never be scaled to several replicas or workers.

## Paths

The app lives under `/saathi/`, so the domain can hold other projects beside it later.

- `/saathi/` is the chat, `/saathi/about/` the about page (`12-about-page.md`) and `/saathi/api/` the API. The server's nginx forwards `/saathi/api/...` to the backend as `/api/...`, so the backend's own paths in `05-api.md` don't change. In development, Vite serves the same pages at `http://localhost:5173/saathi/` and the API stays at `http://localhost:8000/api/`.
- `/` redirects to `/saathi/about/`, the about page, with a 302, which browsers don't keep, so the root can lead elsewhere later. The chat is reached from the page's calls to action, or directly at `/saathi/`. `/saathi` redirects to `/saathi/`, and the about page's old addresses `/about` and `/about/`, as well as `/saathi/about`, redirect to `/saathi/about/`, all with a 301. Redirects keep the query string and carry only the path in `Location`. The frontend container's nginx makes them, and a Vite plugin makes the same ones in development and preview.
- Anything else outside `/saathi/` is a 404.
- Browser storage belongs to the whole domain, not to a path, so every key the frontend saves starts with `saathi.` (`06-frontend.md`, Client state). Another project on the same domain uses its own prefix.

## Files

- `backend/Dockerfile`: Python 3.12 slim with the locked dependencies (`uv sync --frozen --no-dev`), the code, and the demo catalog with its embedding model, generated, ingested and embedded at build time (`02-catalog.md`), so the container starts without downloading anything. The catalog stage copies only the code it runs, so it is rebuilt when the catalog code or the generator changes, not on every API change. It runs as a non-root user, has a health check on `GET /api/health`, and starts `uvicorn app.main:app` on port 8000 without auto-reload. `backend/.dockerignore` leaves out `.env`, the virtual environment, the built catalog, the tests and the evals.
- `frontend/Dockerfile`: builds the frontend with Node 24 for the path `/saathi/`, calling the API on its own origin under it (`VITE_API_BASE_URL=/saathi`) and taking the Turnstile site key as the `VITE_TURNSTILE_SITE_KEY` build argument, then serves the build under `/saathi/` with nginx as a non-root user on port 8080. `frontend/nginx.conf` makes the redirects in Paths, caches the hashed files under `/saathi/assets/` for a year, makes everything else revalidate, compresses text, and sends `nosniff`, a referrer policy and `X-Frame-Options: DENY`. The last is a floor for when the container is reached without the server's nginx, which hides that copy and sets its own. `frontend/.dockerignore` leaves out `node_modules`, build output and test results.
- `docker-compose.yml`: the two services. `backend` reads `.env`; `frontend` gets `VITE_TURNSTILE_SITE_KEY` from `.env` at build time. They publish 127.0.0.1:8000 and 127.0.0.1:8080, restart unless stopped, rotate their logs (3 files of 10 MB), drop every Linux capability and forbid privilege gain (`cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`), and are capped in memory and processes (`mem_limit` and `memswap_limit` 1200m with `pids_limit` 256 for the backend, 128m and 64 for the frontend), so a leak or a burst stays inside the container instead of starving the server's nginx and sshd.
- `.env.example`: the settings production sets, with the production values from `11-abuse-protection.md`, `LLM_PROVIDER=gemini` and empty keys. `DATA_DIR`, `CORS_ORIGINS` and `PORT` keep their defaults from `01-architecture.md`, so it leaves them out. `.env` itself is git-ignored.

## First deployment

1. **Instance:** Ubuntu 26.04 LTS (nginx 1.28, OpenSSL 3.5), `t3.small` or `t4g.small` (2 GB), 20 GB disk, an Elastic IP. Security group inbound: 22 from your own IP, 80 and 443 from anywhere. The ports 8000 and 8080 stay closed: the containers bind to 127.0.0.1.
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

   With Turnstile, the widget's hostnames in the Cloudflare dashboard must include the domain, or the widget fails to load.

4. **Start**, which takes several minutes the first time, most of it embedding the catalog:

   ```bash
   sudo docker compose up -d --build
   sudo docker compose ps          # backend shows "healthy"
   curl http://127.0.0.1:8000/api/health
   ```

5. **Server nginx and HTTPS:** see the next section. It needs a domain whose `A` record points at the Elastic IP.
6. **Check:** the domain leads to `/saathi/about/`, the about page, and `/saathi/` shows the landing with the featured products, where a chat message gets a reply that streams in. The checks under "Verifying HTTPS and the headers" pass.

## Server nginx and HTTPS

The server's nginx is the only thing the internet reaches. It serves the site over HTTPS only, with a Let's Encrypt certificate that certbot renews, and it:

- redirects HTTP to HTTPS, answering on port 80 only for Let's Encrypt's challenge;
- closes connections for any other host name, such as the bare IP, without an answer, so scanners get nothing;
- uses TLS 1.2 and 1.3 with forward-secret AEAD ciphers only (Mozilla's "intermediate" profile, without the DHE suites, which need extra parameters), and offers post-quantum key exchange to browsers that support it;
- sends HSTS and a strict set of security headers, including a Content-Security-Policy;
- forwards only the API endpoints and methods the frontend uses, refuses API requests from other websites, rate-limits per client IP, and keeps `/saathi/api/health` and anything else under `/saathi/api/` internal;
- limits body size and slow clients.

Replace `example.com` with your domain everywhere below.

### 1. Packages and the HTTP site

```bash
sudo apt install -y nginx certbot
sudo mkdir -p /var/www/certbot
sudo rm /etc/nginx/sites-enabled/default
```

`/etc/nginx/conf.d/saathi.conf`, the settings shared by the sites:

```nginx
# Hide the nginx version in headers and error pages.
server_tokens off;

# The limit key: the whole address for IPv4, and the /64 for IPv6, since one visitor usually holds a whole /64
# (11-abuse-protection.md, Client IP). nginx writes IPv6 in compressed form, so the key is the first four
# hextets, or everything up to a "::" that comes before the fourth. A prefix whose own zero groups are compressed
# can land in a neighbouring key; the backend's limits are exact.
map $remote_addr $saathi_client {
    default                                           $remote_addr;
    "~^(?<net>([0-9a-f]{1,4}:){3}[0-9a-f]{1,4}):"     $net;
    "~^(?<net>([0-9a-f]{1,4}:){0,2}[0-9a-f]{0,4}::)"  $net;
}

# Per client: API requests (10 a second, bursts of 20) and open connections. Chat streams hold a connection
# for a whole turn, so the connection limit also caps simultaneous streams. Over a limit: 429, as the app answers.
limit_req_zone $saathi_client zone=saathi_api:10m rate=10r/s;
limit_conn_zone $saathi_client zone=saathi_conn:10m;
limit_req_status 429;
limit_conn_status 429;

# An API request carrying another website's Origin. Browsers send Origin on every POST and on cross-site
# requests; the frontend's own requests carry this site's origin or none.
map $http_origin $saathi_foreign_origin {
    default                 1;
    ""                      0;
    "https://example.com"   0;
}
```

`/etc/nginx/sites-available/saathi`, the HTTP site and the catch-all:

```nginx
# HTTP: Let's Encrypt's challenge, and a permanent redirect to HTTPS for everything else.
server {
    listen 80;
    listen [::]:80;
    server_name example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://example.com$request_uri;
    }
}

# Any other host name, including the bare IP: HTTP gets no answer, and the TLS handshake is refused, so no
# certificate (and so no domain name) is revealed.
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    ssl_reject_handshake on;
    return 444;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/saathi /etc/nginx/sites-enabled/saathi
sudo nginx -t && sudo systemctl reload nginx
```

### 2. Certificate

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d example.com \
  -m you@example.com --agree-tos --no-eff-email \
  --deploy-hook "systemctl reload nginx"
sudo certbot renew --dry-run
```

certbot's systemd timer renews the certificate before it expires, and the deploy hook reloads nginx so it serves the new one. The Let's Encrypt certificates no longer carry an OCSP address, so the HTTPS site doesn't turn on OCSP stapling.

### 3. The HTTPS site

`/etc/nginx/sites-available/saathi-https`:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # TLS 1.2 and 1.3 only, with forward-secret AEAD ciphers for 1.2 (1.3's are all of that kind). Clients pick
    # among them, since every one is strong.
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    # The post-quantum hybrid X25519MLKEM768 first (OpenSSL 3.5), then the classic curves for older clients.
    ssl_ecdh_curve X25519MLKEM768:X25519:prime256v1:secp384r1;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SaathiTLS:10m;
    ssl_session_tickets off;

    # Security headers, on every response including errors. No location below sets its own headers, so they
    # all inherit these (an add_header in a location would replace the whole set).
    # HSTS: browsers use HTTPS only for this host, and its subdomains, for two years.
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    # Scripts: the app's own files, the inline theme script in index.html (by its hash) and Cloudflare Turnstile.
    # No inline styles, plugins or framing; images may come from any HTTPS host, for catalogs with image URLs.
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-MSoSThIVAI2PCAayH/q3qLFY0FypnmH4YnQd1wSGDpw=' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    # The frontend container sends three of these itself; drop its copies so each header appears once.
    proxy_hide_header X-Content-Type-Options;
    proxy_hide_header Referrer-Policy;
    proxy_hide_header X-Frame-Options;

    # Small bodies (a chat message is at most 1,000 characters) and no slow clients holding connections open.
    client_max_body_size 16k;
    client_body_timeout 10s;
    client_header_timeout 10s;
    keepalive_timeout 30s;

    # The API: only the endpoints and methods the frontend calls.
    location ~ ^/saathi/api/(sessions(/|$)|chat$|featured$|products/) {
        limit_except GET POST {
            deny all;
        }
        if ($saathi_foreign_origin) {
            return 403;
        }
        limit_req zone=saathi_api burst=20 nodelay;
        limit_conn saathi_conn 10;

        # The backend's paths start at /api/ (Paths).
        rewrite ^/saathi(/api/.*)$ $1 break;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        # The backend's per-IP limits read this (CLIENT_IP_HEADER=X-Real-IP). Setting it here replaces any value
        # a visitor sent, so it can't be forged.
        proxy_set_header X-Real-IP $remote_addr;
        # The other forwarding headers are set here too, so a visitor's own values never reach the backend.
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Forwarded "";
        # Chat replies are a server-sent event stream: pass each event on at once, and allow long turns.
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    # Let's Encrypt's challenge, for when something in front (such as Cloudflare's "Always Use HTTPS") redirects
    # the HTTP check here.
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Everything else under /saathi/api/, such as /saathi/api/health, stays internal.
    location /saathi/api/ {
        return 404;
    }

    # The frontend container, which sets the caching headers and makes the redirects in Paths.
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Forwarded "";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/saathi-https /etc/nginx/sites-enabled/saathi-https
sudo nginx -t && sudo systemctl reload nginx
```

Three settings in the HTTPS site follow from the app and need care when it changes:

- **The script hash** in the Content-Security-Policy belongs to the inline script in `frontend/index.html` and `frontend/about/index.html`, which applies the saved theme before the first paint. Any edit to that script changes its hash, and the browser then blocks it (the console names the hash it expected). Print the current hash with:

  ```bash
  python3 -c 'import re,hashlib,base64,sys; s=re.search(r"<script>(.*?)</script>", open(sys.argv[1]).read(), re.S).group(1); print("sha256-"+base64.b64encode(hashlib.sha256(s.encode()).digest()).decode())' frontend/index.html
  ```

  The hash covers the exact text between `<script>` and `</script>`, including the line breaks and indentation, and both pages share it.
- **HSTS** can't be taken back quickly: browsers remember it for its whole `max-age`. `includeSubDomains` also forces HTTPS on every subdomain of this host. Keep both only while every one of them serves HTTPS. Submitting the domain to the browsers' preload list is a separate, slower-to-undo step this setup doesn't take.
- **The API allowlist** must grow with the API: a new endpoint the frontend calls gets a 404 from nginx until it is added to the `location ~ ^/saathi/api/(...)` pattern.

### Verifying HTTPS and the headers

```bash
curl -sI http://example.com/ | head -3                      # 301 to https://example.com/
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://example.com/        # 302 to https://example.com/saathi/about/
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://example.com/about   # 301 to https://example.com/saathi/about/
curl -sI https://example.com/saathi/ | grep -iE 'strict-transport|content-security|x-frame|server'
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/saathi/api/featured              # 200
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/saathi/api/health                # 404: internal
curl -s -o /dev/null -w '%{http_code}\n' https://example.com/saathi/api/chatter               # 404: not an endpoint
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE https://example.com/saathi/api/featured   # 403: method not allowed
curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://evil.example' -X POST https://example.com/saathi/api/sessions   # 403
curl -sk -o /dev/null -w '%{http_code}\n' https://<elastic-ip>/                         # fails: handshake refused
openssl s_client -connect example.com:443 -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0' </dev/null 2>&1 | grep -E 'alert|Cipher is'   # TLS 1.1 refused
```

https://www.ssllabs.com/ssltest/ rates the TLS setup (expect A+ with HSTS), and https://securityheaders.com rates the headers. In the browser, the console shows no Content-Security-Policy errors on `/saathi/` and `/saathi/about/`, and with Turnstile on, the widget still loads.

## Operating

All commands run in the repository's folder on the server.

- **Release:** `git pull`, then `sudo docker compose build --pull` and `sudo docker compose up -d`. `--pull` fetches the base images' latest patch releases, so a release also picks up their security fixes; without it the cached base layers are reused for as long as the tags are unchanged. Compose recreates only the containers whose image or settings changed, then `sudo docker image prune -f` removes the old images.
- **Change a secret or setting:** edit `.env`, then `sudo docker compose up -d`, which recreates the backend with the new values. A changed `VITE_TURNSTILE_SITE_KEY` needs `sudo docker compose up -d --build frontend`, since it is built into the frontend.
- **Pause chat:** `CHAT_ENABLED=false` in `.env`, then `sudo docker compose up -d`.
- **Memory:** recreating the backend container resets everything it holds in memory (`11-abuse-protection.md`, State and logging). Visitors with an open chat see the expired-chat notice, and since the day's spend starts again from 0, more than one restart in a UTC day can let spending exceed `DAILY_BUDGET_USD`. A frontend-only release leaves the backend running.
- **Logs:** `sudo docker compose logs -f backend`, including one line per abuse-protection rejection with the client IP. Uvicorn's access line for `GET /api/health` is dropped by a filter in `create_app`, so the health check every ten seconds doesn't fill the log; every other request is logged; `sudo docker compose logs -f frontend`.
- **Status:** `sudo docker compose ps`.

## Adding Cloudflare

Cloudflare's proxy is optional and can come any time after the domain works over HTTPS. The backend keeps `CLIENT_IP_HEADER=X-Real-IP` throughout: nginx sets that header from the address it sees, and once Cloudflare is in front, nginx is told to take that address from `CF-Connecting-IP`, but only on connections from Cloudflare's own ranges (step 6). Its rate and connection limits then count visitors, not Cloudflare's servers, too.

1. Add the domain to Cloudflare, move its nameservers there, and proxy its `A` record (orange cloud).
2. Set SSL/TLS to Full (strict). The certbot certificate keeps renewing behind the proxy, since Cloudflare passes Let's Encrypt's HTTP check through, and if "Always Use HTTPS" redirects it, the HTTPS site answers the challenge too.
3. Add the WAF custom rule from `11-abuse-protection.md` (Proxy requirements): URI path starts with `/saathi/api/`, action Skip, skipping every challenge feature.
4. Check that responses come through Cloudflare: `curl -sI https://<domain>/` shows `server: cloudflare` and a `cf-ray` header.
5. Limit inbound 80 and 443 in the security group to Cloudflare's ranges (https://www.cloudflare.com/ips/), so the instance can't be reached around the proxy.
6. Have nginx take the visitor's address from Cloudflare, trusting the header only from Cloudflare's ranges. Save this as `/usr/local/sbin/cloudflare-realip`, run it once, and have cron run it weekly (`sudo crontab -e`: `0 4 * * 1 /usr/local/sbin/cloudflare-realip`), so the list keeps up with Cloudflare's. With a stale list, connections from a new Cloudflare address keep that address as the visitor's, and every visitor behind it then shares one set of limits:

   ```bash
   #!/bin/bash
   # Writes nginx's Cloudflare real-IP settings from Cloudflare's published ranges, installing them only when
   # both lists came through whole: a partial list is worse than the current one.
   set -euo pipefail
   tmp=$(mktemp)
   v4=$(curl -fsS --max-time 10 https://www.cloudflare.com/ips-v4)
   v6=$(curl -fsS --max-time 10 https://www.cloudflare.com/ips-v6)
   { echo "real_ip_header CF-Connecting-IP;"
     for ip in $v4 $v6; do echo "set_real_ip_from $ip;"; done
   } > "$tmp"
   test "$(grep -c '^set_real_ip_from' "$tmp")" -ge 20   # Cloudflare publishes about 15 IPv4 and 7 IPv6 ranges
   install -m 644 "$tmp" /etc/nginx/conf.d/cloudflare-realip.conf
   nginx -t && systemctl reload nginx
   ```

   A rejection's log line in the backend should then show the visitor's own IP, not a Cloudflare address.
