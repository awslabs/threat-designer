# Lightning Mode Testing Checklist

## Build Verification ✓

- [x] Build:lightning command completed successfully
- [x] Embedded backend bundle included in dist/assets/embeddedBackend-*.js
- [x] No build errors or warnings (except chunk size warning)
- [x] Dev server starts successfully with `npm run dev:lightning`

## Code Changes Completed ✓

- [x] Added async_hooks stub for browser compatibility
- [x] Updated vite.config.js to include async_hooks alias
- [x] Fixed top-level await issue in apiAdapter.js
- [x] Conditionally configured Amplify only in Remote Mode (bootstrap.jsx)
- [x] Updated auth.js to handle Lightning Mode authentication
- [x] Credentials form properly integrated in LoginForm.jsx
- [x] Fixed uploadFile function to handle Lightning Mode (lightning:// protocol)
- [x] Updated agentExecutor to parse uploaded file data correctly from sessionStorage

## Manual Testing Required

### 1. Credentials Form Display
- [ ] Open http://localhost:5173 in browser
- [ ] Verify "Lightning Mode" title displays
- [ ] Verify credentials form shows:
  - AWS Access Key ID field (password type)
  - AWS Secret Access Key field (password type)
  - AWS Session Token field (password type, optional)
  - AWS Region dropdown (with all regions)
  - "Start Lightning Mode" button

### 2. Credentials Submission
- [ ] Enter valid AWS credentials
- [ ] Select an AWS region
- [ ] Click "Start Lightning Mode"
- [ ] Verify navigation to main application
- [ ] Verify no console errors

### 3. Threat Modeling Workflow
- [ ] Navigate to Threat Modeling page
- [ ] Fill in threat model form:
  - Title
  - Description
  - Assumptions
- [ ] Submit threat model
- [ ] Verify processing starts
- [ ] Monitor browser console for errors
- [ ] Wait for completion
- [ ] Verify results display correctly

### 4. SessionStorage Verification
- [ ] Open browser DevTools > Application > Session Storage
- [ ] Verify keys are created:
  - `tm_aws_credentials` (contains credentials)
  - `tm_job_status_{id}` (contains job status)
  - `tm_job_results_{id}` (contains results)
  - `tm_job_trail_{id}` (contains trail data)
  - `tm_all_jobs` (contains job index)

### 5. State Persistence During Session
- [ ] Create a threat model
- [ ] Refresh the page (F5)
- [ ] Verify credentials are still valid (no re-login required)
- [ ] Verify threat model results are still accessible
- [ ] Navigate between pages
- [ ] Verify state persists

### 6. State Clears on Browser Close
- [ ] Create a threat model
- [ ] Close the browser tab/window
- [ ] Open a new tab and navigate to http://localhost:5173
- [ ] Verify credentials form displays (not logged in)
- [ ] Verify sessionStorage is empty

### 7. Error Handling
- [ ] Try submitting with invalid credentials
- [ ] Verify error message displays
- [ ] Try submitting without required fields
- [ ] Verify validation errors display

### 8. Feature Flags
- [ ] Verify Sentry agent is NOT accessible in Lightning Mode
- [ ] Verify Threat Catalog is NOT accessible in Lightning Mode
- [ ] Check navigation menu for disabled features

## Known Issues / Notes

1. **Chunk Size Warning**: The build produces large chunks (>500KB). This is expected for Lightning Mode as it includes the entire LangGraph agent and AWS SDK.

2. **vite-plugin-node-polyfills Warning**: The warning about the plugin not being found can be ignored if the build succeeds. The plugin is loaded dynamically.

3. **Browser Compatibility**: Lightning Mode requires modern browsers with ES2020+ support.

4. **AWS Credentials**: Users need IAM permissions for `bedrock:InvokeModel` on the models used (e.g., Claude 3 Haiku, Claude 3.5 Sonnet).

## Testing with Real AWS Credentials

To test the full workflow, you'll need:

1. AWS Access Key ID
2. AWS Secret Access Key
3. IAM permissions for Bedrock model invocation
4. A region where Bedrock is available (e.g., us-east-1, us-west-2)

Example IAM policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-20240307-v1:0",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0"
      ]
    }
  ]
}
```

## Next Steps

After manual testing confirms everything works:

1. Test Remote Mode build (`npm run build:remote`)
2. Verify Remote Mode still works with Python backend
3. Cross-browser testing (Chrome, Firefox, Safari)
4. Performance testing with large threat models
5. Test replay functionality
6. Test restore functionality
7. Test update functionality
8. Test delete functionality
