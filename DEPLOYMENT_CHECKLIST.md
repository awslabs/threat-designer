# GitLab Pages Deployment Checklist

Use this checklist to ensure a smooth deployment of Threat Designer Lightning Mode to GitLab Pages.

## Pre-Deployment Checklist

- [ ] **Test locally**
  ```bash
  npm ci
  cd embedded-backend && npm ci && cd ..
  npm run build:lightning
  npm run preview
  ```

- [ ] **Verify environment configuration**
  - [ ] `.env.lightning` file exists and is configured correctly
  - [ ] `VITE_BACKEND_MODE=lightning` is set
  - [ ] Other Lightning Mode settings are correct

- [ ] **Check base path configuration**
  - [ ] If deploying to subpath (e.g., `/threat-designer/`), update `base` in `vite.config.js`
  - [ ] If deploying to root domain, ensure `base: '/'` in `vite.config.js`

- [ ] **Verify GitLab CI configuration**
  - [ ] `.gitlab-ci.yml` file exists in repository root
  - [ ] File is committed to git

- [ ] **Check dependencies**
  - [ ] `package.json` is up to date
  - [ ] `embedded-backend/package.json` is up to date
  - [ ] No missing dependencies

## Deployment Steps

- [ ] **Commit all changes**
  ```bash
  git add .
  git commit -m "Deploy Lightning Mode to GitLab Pages"
  ```

- [ ] **Push to GitLab**
  ```bash
  git push origin main
  ```

- [ ] **Monitor pipeline**
  - [ ] Go to **CI/CD > Pipelines** in GitLab
  - [ ] Verify build stage completes successfully
  - [ ] Verify pages stage completes successfully

- [ ] **Check deployment**
  - [ ] Go to **Settings > Pages** in GitLab
  - [ ] Note the Pages URL
  - [ ] Wait 5-10 minutes for deployment to propagate

## Post-Deployment Verification

- [ ] **Access the site**
  - [ ] Open the GitLab Pages URL in a browser
  - [ ] Verify the application loads

- [ ] **Test core functionality**
  - [ ] Login page loads correctly
  - [ ] Can enter AWS credentials
  - [ ] Can create a new threat model
  - [ ] Can upload an architecture diagram
  - [ ] Threat modeling workflow executes
  - [ ] Results display correctly

- [ ] **Test navigation**
  - [ ] All routes work correctly
  - [ ] No 404 errors on page refresh
  - [ ] Back/forward buttons work

- [ ] **Test in different browsers**
  - [ ] Chrome/Edge
  - [ ] Firefox
  - [ ] Safari (if available)

- [ ] **Test on mobile**
  - [ ] Responsive design works
  - [ ] Touch interactions work

## Troubleshooting Checklist

If deployment fails:

- [ ] **Check pipeline logs**
  - [ ] Review build stage logs for errors
  - [ ] Review pages stage logs for errors

- [ ] **Verify build locally**
  - [ ] Run `npm run build:lightning` locally
  - [ ] Check for any build errors
  - [ ] Verify `dist/` directory is created

- [ ] **Check GitLab Pages settings**
  - [ ] Pages is enabled for the project
  - [ ] Correct branch is configured
  - [ ] No access restrictions preventing deployment

- [ ] **Clear caches**
  - [ ] Clear browser cache
  - [ ] Clear GitLab CI cache (in pipeline settings)

## Optional Enhancements

- [ ] **Add custom domain**
  - [ ] Configure DNS records
  - [ ] Add domain in GitLab Pages settings
  - [ ] Enable SSL certificate

- [ ] **Add status badge**
  - [ ] Add pipeline status badge to README
  - [ ] Add Pages deployment badge

- [ ] **Configure security headers**
  - [ ] Add `_headers` file for security policies
  - [ ] Test CSP configuration

- [ ] **Set up monitoring**
  - [ ] Configure error tracking (if available)
  - [ ] Set up uptime monitoring

## Maintenance Checklist

Regular maintenance tasks:

- [ ] **Update dependencies**
  ```bash
  npm update
  cd embedded-backend && npm update && cd ..
  ```

- [ ] **Test after updates**
  - [ ] Run local build and preview
  - [ ] Deploy to test branch first

- [ ] **Monitor pipeline performance**
  - [ ] Check build times
  - [ ] Optimize if builds are slow

- [ ] **Review GitLab Pages analytics**
  - [ ] Check access logs (if available)
  - [ ] Monitor for errors

## Notes

- Pipeline runs automatically on push to `main` or `master` branch
- Build artifacts are cached to speed up subsequent builds
- Pages deployment can take 5-10 minutes to propagate
- Users need their own AWS credentials to use the application

## Quick Commands Reference

```bash
# Local development
npm run dev:lightning

# Local build and preview
npm run build:lightning
npm run preview

# Install dependencies
npm ci
cd embedded-backend && npm ci && cd ..

# Check for outdated packages
npm outdated
cd embedded-backend && npm outdated && cd ..
```
