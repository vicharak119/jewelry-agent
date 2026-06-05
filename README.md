# Jewelry Marketing Agent — Cloudflare Deployment

Fully serverless. Runs on Cloudflare Pages + Workers + D1 + R2. Free tier.

## Prerequisites

1. **Cloudflare account** — https://dash.cloudflare.com (free)
2. **Node.js installed** — https://nodejs.org (LTS, needed for wrangler CLI only)
3. **OpenAI API account** — https://platform.openai.com (pay-as-you-go, min $5)

## Automated Setup (recommended)

```bash
cd jewelry-agent-cloudflare
chmod +x setup.sh
./setup.sh          # Mac/Linux
# OR
setup.bat           # Windows (double-click)
```

The script handles everything: login, create database, create storage, deploy.

---

## Manual Setup (step by step)

### Step 1: Install Wrangler CLI

```bash
npm install -g wrangler
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```
This opens a browser window. Authorize wrangler.

### Step 3: Create D1 Database

```bash
wrangler d1 create jewelry-agent-db
```

Output will show something like:
```
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
**Copy this ID.**

### Step 4: Update wrangler.toml

Open `wrangler.toml` and replace `REPLACE_AFTER_CREATION` with the database_id from Step 3.

### Step 5: Create R2 Bucket

```bash
wrangler r2 bucket create jewelry-agent-storage
```

### Step 6: Apply Database Schema

```bash
wrangler d1 execute jewelry-agent-db --file=schema.sql --remote
```

### Step 7: Create Pages Project

```bash
wrangler pages project create jewelry-agent --production-branch=main
```

### Step 8: Deploy

```bash
wrangler pages deploy public --project-name=jewelry-agent
```

### Step 9: Bind D1 + R2 to Pages Project

Go to **Cloudflare Dashboard → Workers & Pages → jewelry-agent → Settings → Bindings**:

1. Click **"Add binding"** → D1 Database
   - Variable name: `DB`
   - Database: `jewelry-agent-db`

2. Click **"Add binding"** → R2 Bucket
   - Variable name: `STORAGE`
   - Bucket: `jewelry-agent-storage`

3. Click **"Add binding"** → Environment Variable
   - Variable name: `JWT_SECRET`
   - Value: (any random string, e.g. `mySecretKey123!@#`)

4. **Save** and **redeploy**:
```bash
wrangler pages deploy public --project-name=jewelry-agent
```

### Step 10: Open Your App

Visit: `https://jewelry-agent.pages.dev`

First visit shows "Create Admin Account" screen. Set your username and password.

---

## After Deployment

### Add Your OpenAI API Key
1. Login as admin
2. Go to **Settings** tab
3. Paste your OpenAI API key
4. Save

### Add Team Members
1. **Users** tab → Add User
2. Set username, temporary password, role (admin/user)
3. User must change password on first login

### Install as Phone App
1. Open your URL on phone browser (Chrome/Safari)
2. **Android**: Menu ⋮ → "Add to Home Screen"
3. **iPhone**: Share ↑ → "Add to Home Screen"

### Enable 2FA (Cloudflare Access)
1. Cloudflare Dashboard → **Zero Trust** → **Access** → **Applications**
2. **Add Application** → Self-hosted
3. Application domain: `jewelry-agent.pages.dev`
4. Add policy: allow specific email addresses
5. Users verify via email OTP before accessing the app

### Connect Google Drive Backup
1. Go to console.cloud.google.com → Create project
2. Enable **Google Drive API**
3. Create **OAuth 2.0 credentials** (Web Application type)
4. Add redirect URI: `https://jewelry-agent.pages.dev/api/drive/callback`
5. In the app: **Drive** tab → paste Client ID + Secret → Save → Connect

### Custom Domain
1. Cloudflare Dashboard → Workers & Pages → jewelry-agent → Custom domains
2. Add your domain (e.g., `jewelry.yourdomain.com`)

---

## Updating the App

```bash
wrangler pages deploy public --project-name=jewelry-agent
```

## File Structure

```
jewelry-agent-cloudflare/
├── public/                     # Static frontend (served by Pages)
│   ├── index.html             # PWA app
│   ├── manifest.json          # PWA config
│   └── sw.js                  # Service worker
├── functions/                  # Backend API (Pages Functions)
│   └── api/
│       └── [[path]].js        # All API routes (catch-all)
├── schema.sql                  # D1 database schema
├── wrangler.toml              # Cloudflare config
├── package.json
├── setup.sh                   # Automated setup (Mac/Linux)
├── setup.bat                  # Automated setup (Windows)
└── README.md                  # This file
```

## Cloudflare Free Tier Limits

| Resource | Free Limit | Enough For |
|----------|-----------|------------|
| Workers requests | 100,000/day | ~hundreds of images/day |
| D1 rows | 5 million | Years of activity logs |
| D1 reads | 5 million/day | Way more than needed |
| R2 storage | 10 GB | ~thousands of images |
| R2 operations | 1 million/month | Plenty |
| Pages deployments | 500/month | Plenty |

## Troubleshooting

**"D1 binding not found"** → Complete Step 9 (bind D1/R2 in dashboard)
**"STORAGE binding not found"** → Same — bind R2 in dashboard
**Blank page after deploy** → Check browser console (F12) for errors
**"Token expired"** → Login again (sessions last 24 hours)
**Drive backup fails** → Re-authorize in Drive tab. Check redirect URI matches your domain exactly.
**Model name error** → Update model in Settings if OpenAI changes model names
