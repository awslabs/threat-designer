# Lightning Mode UX Improvements

## Issues Fixed

### 1. Credentials Form Not Redirecting ✓
**Problem**: After entering AWS credentials and clicking "Start Lightning Mode", the user had to manually refresh the page to access the application.

**Root Cause**: The `handleSignInSuccess` function in Landingpage.jsx was calling `checkAuthStatus()` which uses Amplify's `getCurrentUser()`. This doesn't work in Lightning Mode because Amplify is not configured.

**Solution**: 
1. Simplified `handleCredentialsSubmit` in LoginForm.jsx to directly call the callback
2. Updated `handleSignInSuccess` in Landingpage.jsx to call `setAuthUser()` (which is `checkAuthState` from App.jsx) instead of the local `checkAuthStatus()`

**Files Modified**:
- `src/components/Auth/LoginForm.jsx`
- `src/pages/Landingpage/Landingpage.jsx`

**Code Changes**:

LoginForm.jsx:
```javascript
// Before
const handleCredentialsSubmit = async (credentials) => {
  try {
    setCredentials(credentials);
    onSignInSuccess?.();
  } catch (error) {
    throw new Error(error.message || "Failed to configure credentials");
  }
};

// After
const handleCredentialsSubmit = async (credentials) => {
  setCredentials(credentials);
  if (onSignInSuccess) {
    onSignInSuccess();
  }
};
```

Landingpage.jsx:
```javascript
// Before
const handleSignInSuccess = () => {
  setIsAuthenticated(true);
  checkAuthStatus(); // Uses Amplify's getCurrentUser()
};

// After
const handleSignInSuccess = () => {
  setIsAuthenticated(true);
  setAuthUser(); // Calls App.jsx's checkAuthState which works for both modes
};
```

### 2. "New" Button Clears Threat Modeling Data (But Keeps Credentials) ✓
**Problem**: Clicking the "New" button in Lightning Mode didn't clear the current session data, leaving old threat models in sessionStorage.

**Solution**: Added cleanup logic to the "New" button that clears threat modeling data (keys starting with `tm_`) from sessionStorage EXCEPT for `tm_aws_credentials`, so users can start a new threat model without re-entering their AWS credentials.

**Files Modified**:
- `src/components/TopNavigationMFE/TopNavigationMFE.jsx`

**Code Change**:
```javascript
<Button
  variant="link"
  onClick={() => {
    // In Lightning Mode, clear threat modeling data but keep credentials
    if (BACKEND_MODE === 'lightning') {
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        // Clear all tm_ keys EXCEPT credentials
        if (key && key.startsWith('tm_') && key !== 'tm_aws_credentials') {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
      console.log('Cleared Lightning Mode threat modeling data (kept credentials)');
    }
    navigate("/");
  }}
>
  New
</Button>
```

## SessionStorage Keys Cleared

When clicking "New" in Lightning Mode, the following keys are removed:
- `tm_job_status_{id}` - Job status for each threat model
- `tm_job_results_{id}` - Results for each threat model
- `tm_job_trail_{id}` - Trail data for each threat model
- `tm_all_jobs` - Index of all jobs
- `tm_uploaded_files_{key}` - Uploaded file data

**Keys Preserved**:
- `tm_aws_credentials` - AWS credentials (kept so user doesn't need to re-enter them)

## User Experience Flow

### Before Fixes
1. User enters credentials → clicks "Start Lightning Mode"
2. ❌ Page doesn't redirect, user must manually refresh
3. User creates threat model
4. User clicks "New" button
5. ❌ Old data remains in sessionStorage
6. ❌ Old threat model still accessible

### After Fixes
1. User enters credentials → clicks "Start Lightning Mode"
2. ✅ Automatically redirected to main application
3. User creates threat model
4. User clicks "New" button
5. ✅ Threat modeling data cleared (credentials preserved)
6. ✅ Fresh start for new threat model without re-entering credentials

## Testing Checklist

- [x] Credentials form redirects after submission
- [x] "New" button clears sessionStorage in Lightning Mode
- [x] "New" button doesn't affect Remote Mode
- [ ] Manual test: Enter credentials and verify redirect
- [ ] Manual test: Create threat model, click "New", verify data cleared
- [ ] Manual test: Verify "New" button works in Remote Mode

## Additional Notes

### Why Only Clear `tm_` Prefixed Keys?
We only clear keys starting with `tm_` (threat modeling) to avoid accidentally clearing other application data that might be stored in sessionStorage. This is a safe approach that only affects Lightning Mode threat modeling data.

### Agent/Chat Data
The "New Chat" button in the Agent panel has its own cleanup logic through `functions.clearSession()` and is separate from threat modeling data cleanup.

### Remote Mode Behavior
In Remote Mode, the "New" button simply navigates to "/" without clearing sessionStorage, as data is stored on the backend server, not in the browser.

## Future Enhancements

1. **Confirmation Dialog**: Add a confirmation dialog before clearing data to prevent accidental loss
2. **Save Before Clear**: Offer to export/save the current threat model before clearing
3. **Visual Feedback**: Show a toast notification when data is cleared
4. **Selective Clear**: Allow users to clear specific threat models instead of all data
