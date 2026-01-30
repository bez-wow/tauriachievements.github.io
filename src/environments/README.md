# Environment Configuration

## Setup Instructions

The actual environment files with API keys are **not committed to Git** for security reasons.

### First Time Setup

1. Copy the template files and remove `.template` from the filename:
   ```bash
   cp environment.template.ts environment.ts
   cp environment.prod.template.ts environment.prod.ts
   cp environment.dev-proxy.template.ts environment.dev-proxy.ts
   ```

2. Edit each file and replace the placeholder values:
   - Replace `YOUR_API_KEY_HERE` with your actual Tauri API key
   - Replace `YOUR_SECRET_HERE` with your actual API secret

### Files

- **environment.template.ts** - Template for development config
- **environment.prod.template.ts** - Template for production config  
- **environment.dev-proxy.template.ts** - Template for development with proxy

- **environment.ts** - Your actual development config (gitignored)
- **environment.prod.ts** - Your actual production config (gitignored)
- **environment.dev-proxy.ts** - Your actual dev proxy config (gitignored)

## Important

⚠️ **Never commit files containing real API keys!**

The `.gitignore` file is configured to exclude:
- `environment.ts`
- `environment.prod.ts`
- `environment.dev-proxy.ts`

Only the `.template.ts` files should be committed to version control.
