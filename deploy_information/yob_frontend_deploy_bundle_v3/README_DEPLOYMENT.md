# YOB Angular Frontend Deployment

This bundle adds the Angular storefront as a **separate Docker service named `yob_frontend`** alongside the existing Frappe services.

The production server does **not** build Angular and does **not** need Node/npm. Angular is built on the development machine, compressed into one fixed Git-tracked file, pushed to GitHub, then downloaded and extracted on the server.

## Final architecture

```text
Browser
  |
  | https://store.shayona360.com
  v
Root Nginx on host (SSL)
  |
  | reverse proxy to 127.0.0.1:8082
  v
Docker service: yob_frontend (nginx:stable-alpine)
  |-- /                    -> Angular dist files
  |-- /api/*               -> Frappe frontend:8080
  |-- /files/*             -> Frappe frontend:8080
  |-- /private/files/*     -> Frappe frontend:8080
  v
Existing Frappe frontend -> backend/workers/etc.
```

The inner `yob_frontend` Nginx sends:

```text
Host: manage.shayona360.com
X-YOB-Original-Host: store.shayona360.com
```

Angular itself uses relative API paths, so no production backend URL needs to be hardcoded into Angular before each build.

---

# Files in this bundle

| File | Where it belongs | Purpose |
|---|---|---|
| `build_yob_frontend_zip.sh` | Angular repo root on development PC | Builds Angular and creates the fixed deployment ZIP |
| `deploy_yob_frontend.sh` | `/srv/projects/shayona360/yob_frontend/` on live server | Downloads and deploys the ZIP |
| `yob_frontend.nginx.conf.template` | `/srv/projects/shayona360/yob_frontend/nginx.conf.template` | Inner Docker Nginx config |
| `pwd.erpindiahrmscrm.with-yob-frontend.yml` | Replace/merge with your existing Compose file | Adds the `yob_frontend` service |
| `root-nginx-store.shayona360.com.conf.example` | Use as `/etc/nginx/sites-available/store.shayona360.com` | Outer/root Nginx vhost example |

---

# PART 1 — ONE-TIME LOCAL SETUP

Do this on the machine where you develop/build `yob_frontend`.

## 1. Put the build script in the Angular repo

Copy:

```text
build_yob_frontend_zip.sh
```

into the root of your Angular repository, for example:

```text
/home/shayona/yob-frontend/build_yob_frontend_zip.sh
```

Then:

```bash
cd /home/shayona/yob-frontend
chmod +x build_yob_frontend_zip.sh
```

The script will create this fixed file on every build:

```text
deploy/yob_frontend.zip
```

You do not use release tags or date-based ZIP names.

---

# PART 2 — ONE-TIME LIVE SERVER SETUP

## 1. Install the small deployment utilities

```bash
sudo apt update
sudo apt install -y gh curl unzip rsync
```

If the GitHub repository is private, authenticate once:

```bash
gh auth login
```

Verify:

```bash
gh auth status
```

If the repo is public, authentication is optional because the deployment script can fall back to the public raw GitHub URL.

## 2. Create the server folder

```bash
sudo mkdir -p /srv/projects/shayona360/yob_frontend/dist
sudo chown -R "$USER:$USER" /srv/projects/shayona360/yob_frontend
```

Result:

```text
/srv/projects/shayona360/yob_frontend/
├── dist/
├── deploy_yob_frontend.sh
└── nginx.conf.template
```

## 3. Copy the deployment script

Copy this bundle file:

```text
deploy_yob_frontend.sh
```

to:

```text
/srv/projects/shayona360/yob_frontend/deploy_yob_frontend.sh
```

Then:

```bash
chmod +x /srv/projects/shayona360/yob_frontend/deploy_yob_frontend.sh
```

## 4. Copy the inner Nginx template

Copy:

```text
yob_frontend.nginx.conf.template
```

to:

```text
/srv/projects/shayona360/yob_frontend/nginx.conf.template
```

## 5. Add the Docker Compose service

Use `pwd.erpindiahrmscrm.with-yob-frontend.yml` as the complete reference.

The important new service is:

```yaml
  yob_frontend:
    image: nginx:stable-alpine
    networks:
      - frappe_network
    depends_on:
      - frontend
    restart: unless-stopped
    environment:
      FRAPPE_UPSTREAM: frontend:8080
      FRAPPE_SITE_HOST: manage.shayona360.com
      NGINX_ENVSUBST_FILTER: "FRAPPE_UPSTREAM|FRAPPE_SITE_HOST"
    volumes:
      - ${HOST_YOB_FRONTEND:-/srv/projects/shayona360/yob_frontend}/dist:/usr/share/nginx/html:ro
      - ${HOST_YOB_FRONTEND:-/srv/projects/shayona360/yob_frontend}/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro
    ports:
      - "127.0.0.1:8082:80"
```

The existing Frappe service named `frontend` must remain unchanged. It is Frappe's own Nginx. `yob_frontend` is the Angular Nginx.

### Values to verify once

**Frappe site host**

```yaml
FRAPPE_SITE_HOST: manage.shayona360.com
```

If your real Frappe site is `manage.shayona360.com`, leave this unchanged.

**Frappe internal upstream**

```yaml
FRAPPE_UPSTREAM: frontend:8080
```

Leave it unchanged when your existing Frappe Nginx service is named `frontend` and listens internally on 8080.

**Angular host port**

```yaml
- "127.0.0.1:8082:80"
```

This means the root host Nginx talks to the Angular container through `127.0.0.1:8082`.

## 6. Validate and start the new service

From the directory containing your Compose file:

```bash
docker compose -f pwd.erpindiahrmscrm.yml config
```

Then:

```bash
docker compose -f pwd.erpindiahrmscrm.yml up -d yob_frontend
```

Check:

```bash
docker compose -f pwd.erpindiahrmscrm.yml ps yob_frontend
```

The first time, the container may serve an empty/missing frontend until you perform the first deployment below. That is expected.

---

# PART 3 — ONE-TIME ROOT NGINX VHOST

This is the host/server Nginx that owns the public SSL domain. It is separate from the Nginx inside the `yob_frontend` Docker container.

Example public domain:

```text
store.shayona360.com
```

## 1. Create the vhost

Copy the example from this bundle or create:

```bash
sudo nano /etc/nginx/sites-available/store.shayona360.com
```

Use:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name store.shayona360.com;

    location / {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;

        proxy_read_timeout 120s;
    }
}
```

The most important header is:

```nginx
proxy_set_header Host $host;
```

It preserves `store.shayona360.com` for the inner Angular Nginx. The inner Nginx then sends it to Frappe as `X-YOB-Original-Host`.

You do not need to add `X-YOB-Original-Host` manually at the root layer because the inner `yob_frontend` Nginx asserts it from the preserved `$host`.

## 2. Enable the vhost

```bash
sudo ln -s /etc/nginx/sites-available/store.shayona360.com /etc/nginx/sites-enabled/store.shayona360.com
```

If the symlink already exists, do not create a duplicate.

## 3. Test Nginx

```bash
sudo nginx -t
```

If successful:

```bash
sudo systemctl reload nginx
```

## 4. Install SSL with Certbot

Only do this if SSL is not already installed for this domain:

```bash
sudo certbot --nginx -d store.shayona360.com
```

Certbot normally adds the HTTPS certificate configuration and HTTP-to-HTTPS redirect.

Verify afterward:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Then test:

```bash
curl -I https://store.shayona360.com/
```

If SSL is already configured, keep your existing SSL directives and only confirm that the HTTPS `location /` proxies to `http://127.0.0.1:8082` with the headers shown above.

---

# PART 4 — ONE-TIME FRAPPE/YOB HOST SETUP

Frappe/YOB must recognize the public storefront host:

```text
store.shayona360.com
```

Configure that host against the correct YOB storefront/application using your existing YOB host/application configuration.

Do not replace the storefront host with the Frappe hostname. The two are intentionally different:

```text
Public storefront host: store.shayona360.com
Frappe site host:       manage.shayona360.com
```

---

# PART 5 — FIRST ANGULAR DEPLOYMENT

## On the development machine

```bash
cd /home/shayona/yob-frontend
git checkout main
git pull
```

Build the fixed deployment ZIP:

```bash
./build_yob_frontend_zip.sh
```

This runs `npm ci`, `npm run build`, finds the Angular output containing `index.html`, and creates:

```text
deploy/yob_frontend.zip
```

Verify:

```bash
ls -lh deploy/yob_frontend.zip
unzip -tq deploy/yob_frontend.zip
```

Commit source changes and the deployment ZIP together:

```bash
git add src package.json package-lock.json angular.json 2>/dev/null || true
git add -f deploy/yob_frontend.zip
git add build_yob_frontend_zip.sh
git status
```

Review the staged changes, then commit/push using your normal message, for example:

```bash
git commit -m "Update yob_frontend"
git push origin main
```

You do not create a GitHub Release or release tag.

## On the live server

```bash
cd /srv/projects/shayona360/yob_frontend
./deploy_yob_frontend.sh
```

The script:

1. downloads `deploy/yob_frontend.zip` from `main`;
2. validates the ZIP before touching the live files;
3. extracts it to a staging folder;
4. checks that `index.html` exists at the ZIP root;
5. updates `/srv/projects/shayona360/yob_frontend/dist` safely;
6. removes the temporary ZIP and staging directory.

Check:

```bash
ls -lh /srv/projects/shayona360/yob_frontend/dist/index.html
curl -I http://127.0.0.1:8082/
curl -I https://store.shayona360.com/
```

Normally you do **not** restart the Docker container after a frontend deployment because Nginx serves the host-mounted `dist` directory directly.

---

# PART 6 — EVERY FUTURE FRONTEND DEPLOYMENT

After the one-time setup, this is the only routine you repeat.

## Development machine

Finish/test your Angular changes, then:

```bash
cd /home/shayona/yob-frontend
./build_yob_frontend_zip.sh
```

Then stage your normal source changes plus the fixed ZIP:

```bash
git add <your changed source files>
git add -f deploy/yob_frontend.zip
git status
```

Commit and push:

```bash
git commit -m "Your frontend change"
git push origin main
```

## Live server

Run one command:

```bash
/srv/projects/shayona360/yob_frontend/deploy_yob_frontend.sh
```

That is the normal production frontend deployment.

No Node/npm build runs on the server.

---

# PART 7 — WHAT YOU DO NOT REPEAT EACH TIME

For normal Angular releases, you do **not** need to:

- change the Compose file;
- change the inner Nginx config;
- change the root Nginx vhost;
- run Certbot again;
- install Node/npm on production;
- run `npm install` or `npm run build` on production;
- rebuild the Frappe image;
- migrate Frappe merely because Angular changed;
- restart Frappe workers;
- change an Angular production API URL;
- create release tags or GitHub Releases.

---

# PART 8 — WHEN CONFIGURATION DOES NEED TO CHANGE

## Storefront public hostname changes

Example:

```text
store.shayona360.com -> shop.example.com
```

Change:

1. DNS;
2. root Nginx `server_name`;
3. SSL certificate/domain;
4. YOB/Frappe storefront host configuration.

You normally still do not change Angular source.

## Frappe site hostname changes

Example:

```text
manage.shayona360.com -> manage.example.com
```

Change Compose:

```yaml
FRAPPE_SITE_HOST: manage.example.com
```

Then recreate/restart only `yob_frontend` so Nginx regenerates its config:

```bash
docker compose -f pwd.erpindiahrmscrm.yml up -d --force-recreate yob_frontend
```

## Internal Frappe service/port changes

Only then change:

```yaml
FRAPPE_UPSTREAM: frontend:8080
```

## Inner Nginx template changes

If you modify `nginx.conf.template`, recreate the container:

```bash
docker compose -f pwd.erpindiahrmscrm.yml up -d --force-recreate yob_frontend
```

---

# PART 9 — TROUBLESHOOTING

## `transform: short source buffer`

This bundle fixes the previous problem. The authenticated GitHub download now uses:

```text
Accept: application/vnd.github.raw
```

not:

```text
application/vnd.github.raw+json
```

## Private repository download fails

Authenticate once:

```bash
gh auth login
```

Then verify:

```bash
gh auth status
```

Run the deploy script again.

## ZIP is invalid

The deployment script validates the ZIP before updating the live `dist`. A failed download or invalid ZIP should therefore leave the current live frontend untouched.

## Angular page works but refresh of a route returns 404

The inner Nginx already contains SPA fallback:

```nginx
try_files $uri $uri/ /index.html;
```

If that file was replaced or modified, restore the supplied template.

## Angular loads but API requests fail

Check:

```bash
docker compose -f pwd.erpindiahrmscrm.yml ps yob_frontend frontend
curl -I http://127.0.0.1:8082/
```

Then inspect:

```bash
docker compose -f pwd.erpindiahrmscrm.yml logs --tail=100 yob_frontend
```

Verify Compose still has:

```yaml
FRAPPE_UPSTREAM: frontend:8080
FRAPPE_SITE_HOST: manage.shayona360.com
```

and root Nginx preserves:

```nginx
proxy_set_header Host $host;
```

---

# Routine deployment summary

After the one-time setup, remember only this:

### Local

```bash
cd /home/shayona/yob-frontend
./build_yob_frontend_zip.sh
git add <changed source files>
git add -f deploy/yob_frontend.zip
git commit -m "Your frontend change"
git push origin main
```

### Live

```bash
/srv/projects/shayona360/yob_frontend/deploy_yob_frontend.sh
```

That is the complete normal YOB Angular storefront deployment workflow.
