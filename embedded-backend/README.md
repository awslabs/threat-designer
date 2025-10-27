# Embedded Backend

Browser-compatible JavaScript implementation of the threat modeling backend using LangGraph and AWS Bedrock.

## Setup

Install dependencies:

```bash
npm install
```

## Browser Compatibility Testing

### Automated Verification

Run the setup verification script:

```bash
node verify-setup.js
```

This verifies that:
- ChatBedrockConverse can be imported
- All dependencies are installed correctly
- Module resolution is working

### Browser Testing

1. Start the development server:

```bash
npm run dev
```

2. Open http://localhost:5173/test.html in your browser

3. Run the tests:
   - **Initialization Test**: Verifies ChatBedrockConverse can be initialized with stub configurations
   - **Invocation Test**: Tests actual model invocation (requires valid AWS credentials)

## Project Structure

```
embedded-backend/
├── src/
│   ├── index.js              # Main entry point
│   ├── config/               # Configuration (credentials, etc.)
│   ├── stubs/                # Browser compatibility stubs
│   │   ├── empty.js          # AWS credential provider stubs
│   │   ├── fs.js             # Filesystem stubs
│   │   ├── child_process.js  # Process stubs
│   │   └── os.js             # OS stubs
│   └── test-bedrock.js       # Browser compatibility tests
├── package.json              # Dependencies
├── vite.config.js            # Build configuration
├── test.html                 # Browser test page
└── README.md                 # This file
```

## Browser Compatibility

The embedded backend uses stub implementations to make Node.js-specific modules work in the browser:

- **AWS Credential Providers**: Stubbed to force manual credential passing
- **File System (fs)**: Stubbed with no-op implementations
- **Child Process**: Stubbed with no-op implementations
- **OS Module**: Stubbed with browser-safe implementations

These stubs follow the patterns from the `working_example` folder and enable ChatBedrockConverse to work in browser environments.

## Build

Build the library:

```bash
npm run build
```

This creates a browser-compatible ES module bundle in the `dist/` directory.

## Next Steps

After verifying browser compatibility:

1. Implement state management (sessionStorage)
2. Implement credentials management
3. Convert Python agent to JavaScript LangGraph
4. Implement API adapter functions
5. Integrate with frontend application
