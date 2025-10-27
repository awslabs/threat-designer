# GitLab Pages Deployment Guide for Threat Designer Lightning Mode

This guide explains how to deploy the Threat Designer Lightning Mode to GitLab Pages.

## Overview

Lightning Mode is a fully client-side version of Threat Designer that runs entirely in the browser with an embedded JavaScript backend. This makes it perfect for static hosting on GitLab Pages.

## Prerequisites

1. A GitLab repository with your Threat Designer code
2. GitLab Pages enabled for your project (available on all GitLab tiers)
3. Node.js 20+ installed locally for testing

## Deployment Steps

### 1. Configure Your Repository

The repository already includes a `.gitlab-ci.yml` file that automates the build and deployment process.

### 2. Environment Configuration

The Lightning Mode uses the `.env.lightning` file for configuration. The key settings are:

```env
VITE_BACKEND_MODE=lightning
VITE_SENTRY_ENABLED=false
VITE_THREAT_CATALOG_ENABLED=false
VITE_REASONING_ENABLED=true
```

These settings are already configured correctly for GitLab Pages deployment.

### 3. Base Path Configuration (if needed)

If your GitLab Pages site is deployed to a subpath (e.g., `https://username.gitlab.io/threat-designer/`), you need to configure the base path in `vite.config.js`:

```javascript
export default defineConfig(({ mode }) => {
  const config = {
    // ... other config
    base: '/threat-designer/', // Change this to match your project name
  };
  return config;
});
```

For a root domain deployment (e.g., `https://username.gitlab.io/`), use:
```javascript
base: '/',
```

### 4. Push to GitLab

Once you push to the `main` or `master` branch, GitLab CI/CD will automatically:

1. Install dependencies for both the main app and embedded backend
2. Build the Lightning Mode version using `npm run build:lightning`
3. Deploy the built files to GitLab Pages

```bash
git add .
git commit -m "Deploy Lightning Mode to GitLab Pages"
git push origin main
```

### 5. Monitor the Pipeline

1. Go to your GitLab project
2. Navigate to **CI/CD > Pipelines**
3. Watch the build and deploy stages complete
4. The pipeline should show two stages:
   - **build**: Compiles the application
   - **pages**: Deploys to GitLab Pages

### 6. Access Your Deployment

After the pipeline completes successfully:

1. Go to **Settings > Pages** in your GitLab project
2. You'll see your Pages URL (e.g., `https://username.gitlab.io/threat-designer/`)
3. Click the URL to access your deployed application

## Pipeline Configuration Details

### Build Stage

The build stage:
- Uses Node.js 20 Docker image
- Installs dependencies with `npm ci` (faster and more reliable than `npm install`)
- Builds both the main app and embedded backend
- Creates build artifacts in the `dist/` directory

### Deploy Stage

The deploy stage:
- Moves the `dist/` directory to `public/` (required by GitLab Pages)
- Creates a `.nojekyll` file to prevent Jekyll processing
- Publishes the `public/` directory as your GitLab Pages site

## Testing Locally Before Deployment

Before pushing to GitLab, test the Lightning Mode build locally:

```bash
# Install dependencies
npm ci
cd embedded-backend && npm ci && cd ..

# Build Lightning Mode
npm run build:lightning

# Preview the build
npm run preview
```

This will start a local server (usually at `http://localhost:4173`) where you can test the built application.

## Troubleshooting

### Pipeline Fails at Build Stage

**Issue**: Dependencies fail to install or build fails

**Solution**:
1. Check that both `package.json` and `embedded-backend/package.json` are committed
2. Verify Node.js version compatibility (should be 20+)
3. Check the pipeline logs for specific error messages

### Pages Not Updating

**Issue**: Changes aren't reflected on the deployed site

**Solution**:
1. Clear your browser cache (Ctrl+Shift+R or Cmd+Shift+R)
2. Check that the pipeline completed successfully
3. Wait a few minutes for GitLab Pages to update (can take 5-10 minutes)

### 404 Errors on Page Refresh

**Issue**: Refreshing the page or accessing routes directly returns 404

**Solution**: Add a `public/_redirects` file (for Netlify) or configure your server. For GitLab Pages, you may need to use hash routing instead of browser routing.

To switch to hash routing, update your router configuration in `src/App.jsx`:

```javascript
import { HashRouter as Router } from 'react-router-dom';
// Instead of BrowserRouter
```

### Base Path Issues

**Issue**: Assets not loading or routes not working

**Solution**: Ensure the `base` path in `vite.config.js` matches your GitLab Pages URL structure.

## Custom Domain

To use a custom domain with GitLab Pages:

1. Go to **Settings > Pages** in your GitLab project
2. Click **New Domain**
3. Enter your custom domain
4. Follow the DNS configuration instructions
5. Add SSL certificate (Let's Encrypt is available)

## Security Considerations

### AWS Credentials

Lightning Mode requires users to provide their own AWS credentials through the UI. These credentials:
- Are stored only in browser sessionStorage
- Never leave the user's browser
- Are used directly to call AWS Bedrock APIs from the browser

**Important**: Users should use IAM credentials with minimal permissions (only Bedrock access).

### Content Security Policy

Consider adding security headers. Create a `public/_headers` file:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
```

## Performance Optimization

### Build Size

The Lightning Mode build includes the embedded backend, which increases the bundle size. To optimize:

1. The build already uses code splitting
2. Dependencies are bundled efficiently
3. Source maps are generated for debugging

### Caching

GitLab Pages automatically caches static assets. The pipeline configuration caches `node_modules/` to speed up builds.

## Continuous Deployment

The current configuration deploys automatically when you push to:
- `main` branch
- `master` branch

To deploy from other branches, modify `.gitlab-ci.yml`:

```yaml
only:
  - main
  - master
  - develop  # Add more branches as needed
```

## Monitoring

### Pipeline Status Badge

Add a pipeline status badge to your README:

```markdown
[![pipeline status](https://gitlab.com/username/threat-designer/badges/main/pipeline.svg)](https://gitlab.com/username/threat-designer/-/commits/main)
```

### Pages Status

Check Pages deployment status at **Settings > Pages** in your GitLab project.

## Additional Resources

- [GitLab Pages Documentation](https://docs.gitlab.com/ee/user/project/pages/)
- [GitLab CI/CD Documentation](https://docs.gitlab.com/ee/ci/)
- [Vite Build Documentation](https://vitejs.dev/guide/build.html)

## Support

For issues specific to:
- **GitLab Pages**: Check GitLab documentation or support
- **Lightning Mode**: Review the embedded backend documentation in `embedded-backend/README.md`
- **Build Issues**: Check the Vite configuration in `vite.config.js`
