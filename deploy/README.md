# Deploying

Frontend on Vercel, backend on one Ubuntu VM (Oracle Cloud Always Free, Ampere A1). Vercel forwards `/api/*` to the VM,
so the frontend code is unchanged and there is no CORS setup.

```
browser ──> Vercel (static React build)
              └── /api/* ──> https://<api-host> ── nginx ──> uvicorn 127.0.0.1:8000 ──> Gemini
```

| File | What it is |
|---|---|
| `setup.sh` | First-time VM setup: packages, uv, dependencies, firewall, service, nginx, HTTPS |
| `deploy.sh` | Pull the latest main and restart the backend |
| `briefforge-api.service` | systemd unit (one uvicorn worker on 127.0.0.1:8000) |
| `nginx-briefforge.conf` | nginx site (50 MB uploads, 180 s timeout) |
| `../frontend/vercel.json` | Vercel rewrites: `/api/*` to the VM, everything else to `index.html` |

## 1. Create the VM (Oracle console)

- Shape `VM.Standard.A1.Flex`, 2 OCPU, 12 GB, image Ubuntu 24.04 (aarch64). Everything marked **Always Free Eligible**.
- Boot volume 50 GB, public IPv4 on, add your SSH public key.
- VCN security list: add ingress rules for TCP 80 and 443 from `0.0.0.0/0` (22 is there already).
- Do not upgrade the account to Pay As You Go.

## 2. Pick the API host name

No domain needed: `<public-ip>.sslip.io` (for example `152.67.1.2.sslip.io`) resolves to the VM, and Let's Encrypt
issues a certificate for it. A real domain works too: point an A record at the VM's IP.

## 3. On the VM

```bash
ssh ubuntu@<public-ip>

# The repo is private: create a key and add it to GitHub (repo Settings > Deploy keys, read-only)
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub
git clone git@github.com:sogalabhi/esko.git ~/esko

# Secrets (never commit this file)
cat > ~/esko/backend/.env <<'EOF'
LLM_API_KEY=your-gemini-key
EOF
chmod 600 ~/esko/backend/.env

bash ~/esko/deploy/setup.sh <api-host> <your-email>
```

The last line of the output should be the health check's JSON.

## 4. Vercel

1. In `frontend/vercel.json`, replace `API_HOST` with the host from step 2, then commit and push.
2. In Vercel, import the GitHub repo with **Root Directory** `frontend`. The framework (Vite) is detected; the build
   command is `npm run build`, the output directory is `dist`.
3. Open the Vercel URL and click "Load demo".

## Updating

```bash
git push                           # on your machine
ssh ubuntu@<public-ip> 'bash ~/esko/deploy/deploy.sh'
```

Frontend changes deploy on Vercel by themselves on every push.

## When something is wrong

```bash
journalctl -u briefforge-api -n 100 --no-pager   # backend log
sudo tail -n 50 /var/log/nginx/error.log         # nginx
curl -s http://127.0.0.1:8000/api/health         # backend without nginx
```

## Things to know

- **One shared project.** The backend keeps a single current project, so everyone using the live URL at the same time
  sees, and changes, the same one.
- **No login.** Anyone with the URL can run checks that use the Gemini key. Set a spending cap on the key.
- **Data lives on the VM** in `backend/data/` and `backend/.cache/` (gitignored, kept across `deploy.sh`).
- **Idle VMs can be reclaimed** by Oracle after a quiet week. Not a concern while it is being tested.
