# Lightning Mode Deployment Guide

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
  - [Required Tools and Accounts](#required-tools-and-accounts)
  - [Repository Setup](#repository-setup)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [VITE Configuration for Production](#vite-configuration-for-production)
- [Build Process](#build-process)
  - [Step 1: Install Dependencies](#step-1-install-dependencies)
  - [Step 2: Configure Environment Variables](#step-2-configure-environment-variables)
  - [Step 3: Run Production Build](#step-3-run-production-build)
  - [Step 4: Verify Build Output](#step-4-verify-build-output)
- [GitHub Pages Deployment](#github-pages-deployment)
  - [Option 1: Manual Deployment](#option-1-manual-deployment)
  - [Option 2: GitHub Actions (Automated)](#option-2-github-actions-automated)
  - [Repository Settings Configuration](#repository-settings-configuration)
- [Custom Domain Configuration](#custom-domain-configuration)
- [Troubleshooting](#troubleshooting)
  - [Common Build Issues](#common-build-issues)
  - [Common Deployment Issues](#common-deployment-issues)
  - [Verification Steps](#verification-steps)
- [Maintenance](#maintenance)
  - [Updating Your Deployment](#updating-your-deployment)
  - [Managing Environment Variables](#managing-environment-variables)
- [Next Steps](#next-steps)

---

## Overview

This guide provides step-by-step instructions for deploying Threat Designer's Lightning mode to GitHub Pages. Lightning mode is a stateless, browser-based version that requires no backend infrastructure and can be hosted as a static site.

**What you'll accomplish:**

- Build Lightning mode for production
- Deploy to GitHub Pages
- Configure custom domains (optional)
- Set up automated deployments (optional)

**Deployment time:** 15-30 minutes for initial setup

---

## Prerequisites

### Required Tools and Accounts

Before you begin, ensure you have:

1. **GitHub Account**
   - Free or paid GitHub account
   - Repository with Threat Designer code (forked or cloned)
   - Write access to the repository

2. **Node.js and npm**
   - Node.js version 18.x or higher
   - npm version 9.x or higher
   - Verify installation:
     ```bash
     node --version  # Should show v18.x or higher
     npm --version   # Should show 9.x or higher
     ```

3. **Git**
   - Git command-line tools installed
   - Configured with your GitHub credentials
   - Verify installation:
     ```bash
     git --version
     ```

4. **Text Editor or IDE**
   - For editing configuration files
   - VS Code, Sublime Text, or similar

### Repository Setup

1. **Fork or Clone the Repository**

   If you haven't already, fork the Threat Designer repository to your GitHub account:

   ```bash
   # Clone your fork
   git clone https://github.com/YOUR_USERNAME/threat-designer.git
   cd threat-designer
   ```

2. **Verify Repository Structure**

   Ensure your repository contains:
   - `package.json` - Node.js dependencies
   - `vite.config.js` - Vite build configuration
   - `.env.lightning` - Lightning mode environment variables
   - `src/` - Source code directory
   - `public/` - Static assets directory

---

## Configuration

### Environment Variables

Lightning mode uses VITE environment variables that are embedded into the build at compile time. These variables must be prefixed with `VITE_` to be accessible in the browser.

**Required Environment Variables:**

Create or verify your `.env.lightning` file in the repository root:

```bash
# Lightning Mode Configuration
VITE_BACKEND_MODE=lightning
VITE_SENTRY_ENABLED=false
VITE_THREAT_CATALOG_ENABLED=false
VITE_REASONING_ENABLED=true

# Footer links for Lightning Mode login page
VITE_GITHUB_URL=https://github.com/YOUR_USERNAME/threat-designer
VITE_LIGHTNING_GUIDE_URL=https://github.com/YOUR_USERNAME/threat-designer/blob/main/quick-start-guide/lightning-mode-quick-start.md
```

**Variable Descriptions:**

| Variable                      | Purpose                              | Default Value  |
| ----------------------------- | ------------------------------------ | -------------- |
| `VITE_BACKEND_MODE`           | Sets application mode to Lightning   | `lightning`    |
| `VITE_SENTRY_ENABLED`         | Disables Sentry assistant            | `false`        |
| `VITE_THREAT_CATALOG_ENABLED` | Disables Threat Catalog              | `false`        |
| `VITE_REASONING_ENABLED`      | Enables reasoning boost feature      | `true`         |
| `VITE_GITHUB_URL`             | GitHub repository link on login page | Your repo URL  |
| `VITE_LIGHTNING_GUIDE_URL`    | Quick start guide link on login page | Your guide URL |

**Important Notes:**

- ⚠️ VITE variables are embedded at build time and cannot be changed after deployment
- ⚠️ Never include sensitive credentials in VITE variables (they are publicly visible)
- ✅ Update URLs to point to your fork or deployment location
- ✅ All VITE variables must be prefixed with `VITE_` to be accessible

### VITE Configuration for Production

The `vite.config.js` file is already configured for Lightning mode. Key settings include:

**Base Path Configuration:**

For GitHub Pages deployment, you may need to set the base path if deploying to a project page (e.g., `https://username.github.io/threat-designer/`):

```javascript
// vite.config.js
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    // Set base path for GitHub Pages project deployment
    base: process.env.VITE_BASE_PATH || "/",

    // ... rest of configuration
  };
});
```

**Deployment Scenarios:**

1. **User/Organization Page** (`https://username.github.io/`)
   - Repository name: `username.github.io`
   - Base path: `/`
   - No configuration needed

2. **Project Page** (`https://username.github.io/threat-designer/`)
   - Repository name: `threat-designer`
   - Base path: `/threat-designer/`
   - Add to `.env.lightning`: `VITE_BASE_PATH=/threat-designer/`

---

## Build Process

### Step 1: Install Dependencies

Navigate to your repository and install all required npm packages:

```bash
cd threat-designer
npm install
```

This will install:

- React and React Router
- Vite build tools
- AWS SDK for Bedrock
- Cloudscape Design System components
- All other dependencies listed in `package.json`

**Expected output:**

```
added 1234 packages in 45s
```

**Troubleshooting:**

- If you see `EACCES` errors, you may need to fix npm permissions
- If you see `ERESOLVE` errors, try `npm install --legacy-peer-deps`

### Step 2: Configure Environment Variables

1. **Copy the Lightning mode environment file:**

   ```bash
   cp .env.lightning .env
   ```

2. **Edit `.env` to customize URLs:**

   ```bash
   # Use your preferred text editor
   nano .env
   # or
   code .env
   ```

3. **Update the GitHub and guide URLs:**

   ```bash
   VITE_GITHUB_URL=https://github.com/YOUR_USERNAME/threat-designer
   VITE_LIGHTNING_GUIDE_URL=https://YOUR_USERNAME.github.io/threat-designer/quick-start-guide/lightning-mode-quick-start.html
   ```

4. **If deploying to a project page, add base path:**

   ```bash
   VITE_BASE_PATH=/threat-designer/
   ```

### Step 3: Run Production Build

Build the application for production using the Lightning mode configuration:

```bash
npm run build:lightning
```

This command:

1. Loads environment variables from `.env` (or `.env.lightning` if specified)
2. Bundles the application with Vite
3. Optimizes assets for production
4. Outputs to the `dist/` directory

**Expected output:**

```
vite v6.4.1 building for production...
✓ 1234 modules transformed.
dist/index.html                   1.23 kB │ gzip: 0.56 kB
dist/assets/index-abc123.css     45.67 kB │ gzip: 12.34 kB
dist/assets/index-def456.js     890.12 kB │ gzip: 234.56 kB
✓ built in 12.34s
```

**Build time:** Typically 10-30 seconds depending on your machine

### Step 4: Verify Build Output

After the build completes, verify the output:

1. **Check the dist directory:**

   ```bash
   ls -la dist/
   ```

   You should see:
   - `index.html` - Main HTML file
   - `assets/` - JavaScript, CSS, and other bundled assets
   - `manifest.json` - PWA manifest
   - `robots.txt` - Search engine directives
   - `shield.ico` - Favicon

2. **Test locally (optional but recommended):**

   ```bash
   npm run preview
   ```

   This starts a local server to preview the production build:

   ```
   ➜  Local:   http://localhost:4173/
   ➜  Network: use --host to expose
   ```

   Open the URL in your browser and verify:
   - ✅ Login page loads correctly
   - ✅ GitHub and guide links appear in the footer
   - ✅ Links open in new tabs
   - ✅ Credentials form is functional
   - ✅ No console errors

3. **Check file sizes:**

   ```bash
   du -sh dist/
   ```

   Expected size: 2-5 MB (depending on dependencies)

---

## GitHub Pages Deployment

GitHub Pages can host your Lightning mode deployment as a static site. You can deploy manually or set up automated deployments with GitHub Actions.

### Option 1: Manual Deployment

Manual deployment is simple and works well for initial setup or infrequent updates.

**Steps:**

1. **Build the application:**

   ```bash
   npm run build:lightning
   ```

2. **Create a gh-pages branch (first time only):**

   ```bash
   git checkout --orphan gh-pages
   git rm -rf .
   ```

3. **Copy build output to gh-pages branch:**

   ```bash
   # Switch back to main branch
   git checkout main

   # Copy dist contents to a temporary location
   cp -r dist /tmp/dist-backup

   # Switch to gh-pages branch
   git checkout gh-pages

   # Copy dist contents to root
   cp -r /tmp/dist-backup/* .

   # Add and commit
   git add .
   git commit -m "Deploy Lightning mode to GitHub Pages"
   ```

4. **Push to GitHub:**

   ```bash
   git push origin gh-pages
   ```

5. **Configure GitHub Pages (see [Repository Settings Configuration](#repository-settings-configuration))**

**For subsequent deployments:**

```bash
# Build
npm run build:lightning

# Switch to gh-pages
git checkout gh-pages

# Remove old files (except .git)
git rm -rf .
git clean -fxd

# Copy new build
cp -r dist/* .

# Commit and push
git add .
git commit -m "Update deployment $(date +%Y-%m-%d)"
git push origin gh-pages

# Switch back to main
git checkout main
```

### Option 2: GitHub Actions (Automated)

Automated deployment with GitHub Actions rebuilds and deploys your site whenever you push to the main branch.

**Steps:**

1. **Create GitHub Actions workflow directory:**

   ```bash
   mkdir -p .github/workflows
   ```

2. **Create workflow file:**

   Create `.github/workflows/deploy.yml`:

   ```yaml
   name: Deploy Lightning Mode to GitHub Pages

   on:
     push:
       branches:
         - main
     workflow_dispatch:

   permissions:
     contents: read
     pages: write
     id-token: write

   concurrency:
     group: "pages"
     cancel-in-progress: false

   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - name: Checkout
           uses: actions/checkout@v4

         - name: Setup Node.js
           uses: actions/setup-node@v4
           with:
             node-version: "18"
             cache: "npm"

         - name: Install dependencies
           run: npm ci

         - name: Build Lightning mode
           run: npm run build:lightning
           env:
             VITE_BACKEND_MODE: lightning
             VITE_SENTRY_ENABLED: false
             VITE_THREAT_CATALOG_ENABLED: false
             VITE_REASONING_ENABLED: true
             VITE_GITHUB_URL: https://github.com/${{ github.repository }}
             VITE_LIGHTNING_GUIDE_URL: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/quick-start-guide/lightning-mode-quick-start.html

         - name: Upload artifact
           uses: actions/upload-pages-artifact@v3
           with:
             path: ./dist

     deploy:
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       runs-on: ubuntu-latest
       needs: build
       steps:
         - name: Deploy to GitHub Pages
           id: deployment
           uses: actions/deploy-pages@v4
   ```

3. **Commit and push the workflow:**

   ```bash
   git add .github/workflows/deploy.yml
   git commit -m "Add GitHub Actions deployment workflow"
   git push origin main
   ```

4. **Configure GitHub Pages to use GitHub Actions (see [Repository Settings Configuration](#repository-settings-configuration))**

**Workflow Features:**

- ✅ Automatically builds and deploys on push to main
- ✅ Can be manually triggered from Actions tab
- ✅ Uses GitHub's official Pages deployment action
- ✅ Automatically sets environment variables
- ✅ Caches npm dependencies for faster builds

### Repository Settings Configuration

After setting up your deployment method, configure GitHub Pages in your repository settings:

1. **Navigate to repository settings:**
   - Go to your repository on GitHub
   - Click **Settings** tab
   - Click **Pages** in the left sidebar

2. **Configure source:**

   **For Manual Deployment:**
   - Source: **Deploy from a branch**
   - Branch: **gh-pages** / **/ (root)**
   - Click **Save**

   **For GitHub Actions:**
   - Source: **GitHub Actions**
   - No branch selection needed

3. **Wait for deployment:**
   - GitHub will build and deploy your site
   - This takes 1-3 minutes
   - You'll see a green checkmark when complete

4. **Access your site:**
   - Your site will be available at:
     - User/Org page: `https://USERNAME.github.io/`
     - Project page: `https://USERNAME.github.io/REPO_NAME/`

---

## Custom Domain Configuration

If you want to use a custom domain (e.g., `threat-designer.example.com`) instead of the default GitHub Pages URL:

### Prerequisites

- A registered domain name
- Access to your domain's DNS settings

### Steps

1. **Add custom domain in GitHub:**
   - Go to repository **Settings** → **Pages**
   - Under **Custom domain**, enter your domain (e.g., `threat-designer.example.com`)
   - Click **Save**
   - GitHub will create a `CNAME` file in your repository

2. **Configure DNS records:**

   **For apex domain** (`example.com`):

   ```
   Type: A
   Name: @
   Value: 185.199.108.153
   Value: 185.199.109.153
   Value: 185.199.110.153
   Value: 185.199.111.153
   ```

   **For subdomain** (`threat-designer.example.com`):

   ```
   Type: CNAME
   Name: threat-designer
   Value: USERNAME.github.io
   ```

3. **Enable HTTPS:**
   - Wait for DNS propagation (5 minutes to 24 hours)
   - Return to **Settings** → **Pages**
   - Check **Enforce HTTPS**
   - GitHub will automatically provision an SSL certificate

4. **Update environment variables:**

   Update your `.env` file to use the custom domain:

   ```bash
   VITE_GITHUB_URL=https://github.com/YOUR_USERNAME/threat-designer
   VITE_LIGHTNING_GUIDE_URL=https://threat-designer.example.com/quick-start-guide/lightning-mode-quick-start.html
   ```

5. **Rebuild and redeploy:**
   ```bash
   npm run build:lightning
   # Then deploy using your chosen method
   ```

**Troubleshooting DNS:**

- Use `dig` or `nslookup` to verify DNS records
- DNS propagation can take up to 24 hours
- Clear your browser cache if the old URL persists

---

## Troubleshooting

### Common Build Issues

**Issue: `npm install` fails with EACCES errors**

```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

**Issue: `npm run build:lightning` fails with "Cannot find module"**

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
npm run build:lightning
```

**Issue: Build succeeds but dist/ is empty**

```bash
# Check for build errors
npm run build:lightning 2>&1 | tee build.log

# Verify vite.config.js
cat vite.config.js | grep outDir
```

**Issue: Environment variables not working**

```bash
# Verify .env file exists and has correct format
cat .env

# Ensure variables are prefixed with VITE_
grep VITE_ .env

# Try explicit mode flag
vite build --mode lightning
```

### Common Deployment Issues

**Issue: GitHub Pages shows 404**

**Solutions:**

1. Verify `index.html` exists in the root of gh-pages branch
2. Check repository settings: Settings → Pages → Source
3. Wait 5-10 minutes for deployment to complete
4. Check Actions tab for deployment errors

**Issue: Page loads but shows blank screen**

**Solutions:**

1. Check browser console for errors (F12)
2. Verify base path configuration in `vite.config.js`
3. For project pages, ensure `VITE_BASE_PATH` is set correctly
4. Check that all assets are loading (Network tab in DevTools)

**Issue: Links and assets return 404**

**Solutions:**

1. Incorrect base path - update `VITE_BASE_PATH` in `.env`
2. Rebuild with correct base path:
   ```bash
   VITE_BASE_PATH=/threat-designer/ npm run build:lightning
   ```
3. Verify asset paths in `dist/index.html`

**Issue: GitHub Actions workflow fails**

**Solutions:**

1. Check Actions tab for error details
2. Verify workflow file syntax (YAML indentation)
3. Ensure repository has Pages enabled
4. Check that workflow has correct permissions
5. Verify Node.js version compatibility

**Issue: Custom domain not working**

**Solutions:**

1. Verify DNS records with `dig threat-designer.example.com`
2. Wait for DNS propagation (up to 24 hours)
3. Check CNAME file exists in gh-pages branch
4. Ensure HTTPS is not enforced until SSL certificate is provisioned

### Verification Steps

After deployment, verify your Lightning mode application:

1. **Access the URL:**
   - Navigate to your GitHub Pages URL
   - Should see the login page

2. **Check login page elements:**
   - ✅ Threat Designer branding visible
   - ✅ Credentials form present
   - ✅ GitHub icon link in footer
   - ✅ "Getting started with Lightning mode" link in footer

3. **Test external links:**
   - Click GitHub icon → should open repository in new tab
   - Click guide link → should open quick start guide in new tab

4. **Test credentials flow:**
   - Enter test AWS credentials (or real ones)
   - Should navigate to main application
   - Top navigation should show "Clear Credentials" instead of "Sign out"

5. **Check browser console:**
   - Open DevTools (F12)
   - Console tab should have no errors
   - Network tab should show all assets loading successfully

6. **Test on multiple browsers:**
   - Chrome/Edge
   - Firefox
   - Safari (if available)

---

## Maintenance

### Updating Your Deployment

When you make changes to the code or configuration:

**Manual Deployment:**

```bash
# Pull latest changes
git checkout main
git pull origin main

# Install any new dependencies
npm install

# Build
npm run build:lightning

# Deploy
git checkout gh-pages
git rm -rf .
git clean -fxd
cp -r dist/* .
git add .
git commit -m "Update deployment $(date +%Y-%m-%d)"
git push origin gh-pages
git checkout main
```

**GitHub Actions Deployment:**

```bash
# Pull latest changes
git checkout main
git pull origin main

# Make your changes
# ...

# Commit and push
git add .
git commit -m "Your changes"
git push origin main

# GitHub Actions will automatically build and deploy
```

### Managing Environment Variables

**To update environment variables:**

1. **Edit `.env` or `.env.lightning`:**

   ```bash
   nano .env.lightning
   ```

2. **Update values:**

   ```bash
   VITE_GITHUB_URL=https://github.com/new-org/threat-designer
   VITE_LIGHTNING_GUIDE_URL=https://new-url.com/guide
   ```

3. **Rebuild and redeploy:**
   ```bash
   npm run build:lightning
   # Then deploy using your chosen method
   ```

**For GitHub Actions:**

Update environment variables in `.github/workflows/deploy.yml`:

```yaml
- name: Build Lightning mode
  run: npm run build:lightning
  env:
    VITE_GITHUB_URL: https://github.com/new-org/threat-designer
    VITE_LIGHTNING_GUIDE_URL: https://new-url.com/guide
```

**Important:**

- ⚠️ Environment variables are embedded at build time
- ⚠️ Changes require a rebuild and redeployment
- ⚠️ Never commit sensitive credentials to `.env` files

---

## Next Steps

### For Users

Now that Lightning mode is deployed:

1. **Share the URL** with your team or users
2. **Provide the Quick Start Guide**: [Lightning Mode Quick Start](./lightning-mode-quick-start.md)
3. **Set up AWS credentials** following security best practices
4. **Try your first threat model**

### For Administrators

1. **Monitor usage**: Check GitHub Pages analytics (if enabled)
2. **Keep dependencies updated**: Run `npm audit` and `npm update` regularly
3. **Update documentation**: Keep URLs and guides current
4. **Consider full deployment**: For production use with persistent storage and all features

### Additional Resources

- **Lightning Mode Quick Start**: [Quick Start Guide](./lightning-mode-quick-start.md)
- **GitHub Pages Documentation**: [docs.github.com/pages](https://docs.github.com/en/pages)
- **Vite Documentation**: [vitejs.dev](https://vitejs.dev/)
- **Threat Designer Repository**: [github.com/awslabs/threat-designer](https://github.com/awslabs/threat-designer)

---

**Congratulations!** You've successfully deployed Threat Designer Lightning mode to GitHub Pages. Users can now access AI-powered threat modeling without any backend infrastructure.

**Remember**: Lightning mode is perfect for evaluation and quick assessments. For production use with persistent storage, Sentry assistant, and Threat Catalog, consider deploying the full stack version.
