# Netlify Deployment Setup

## ⚠️ CRITICAL SECURITY UPDATE

**This application now uses a secure backend architecture.** Private keys are NEVER exposed to the frontend.

## Environment Variables

### Frontend Environment Variables (Netlify)

Add these **public** environment variables in Netlify Dashboard:

1. Open your site in Netlify
2. Go to **Site settings** → **Environment variables**
3. Add the following variables:

```
VITE_HELIUS_API_KEY = your_helius_api_key
VITE_COLLECTION_ADDRESS = your_collection_address
VITE_UPDATE_AUTHORITY = your_update_authority_public_key
VITE_RPC_ENDPOINT = https://mainnet.helius-rpc.com/?api-key=your_helius_api_key
VITE_LAYER_ORDER = ["background","body","shirt","mouth","face","eyes","eyebrows","hair","accessories","iceout chain","eyewear","meme","headwear","weapons"]
VITE_OPTIONAL_LAYERS = ["background","face","eyewear","headwear","accessories","weapons","iceout chain","meme"]
VITE_IMAGE_SIZE = 1750
VITE_SUPABASE_URL = your_supabase_project_url
VITE_SUPABASE_ANON_KEY = your_supabase_anon_key
VITE_FEE_RECIPIENT_WALLET = your_fee_wallet_address
VITE_SERVICE_FEE_SOL = 0.03
VITE_REIMBURSEMENT_SOL = 0.002
```

**Important Security Notes:**
- ❌ **DO NOT** add `VITE_UPDATE_AUTHORITY_PRIVATE_KEY` (removed for security)
- ✅ Only add the **public** update authority address
- ✅ All `VITE_` prefixed variables are PUBLIC and embedded in JavaScript
- ✅ Never put private keys in `VITE_` variables

### Backend Secrets (Supabase)

The private key is stored ONLY in Supabase Edge Function secrets:

1. Go to Supabase Dashboard
2. Navigate to **Edge Functions** → **Secrets**
3. Add these secrets:

```
UPDATE_AUTHORITY_PRIVATE_KEY = [your,private,key,array]
RPC_ENDPOINT = https://mainnet.helius-rpc.com/?api-key=your_api_key
COLLECTION_ADDRESS = your_collection_address
```

**Critical:** These secrets are server-side only and NEVER exposed to the browser.

## How the Secure Architecture Works

### Old Architecture (INSECURE ❌):
```
Browser → Private Key in JavaScript → Signs Transaction Directly
```
**Problem:** Anyone could extract the private key from your website's JavaScript.

### New Architecture (SECURE ✅):
```
Browser → Calls Supabase Edge Function → Server Signs Transaction → Returns Signature
```
**Security:** Private key stays on the server, never exposed to users.

## Deployment Steps

1. **Configure Netlify Environment Variables** (public frontend vars)
2. **Configure Supabase Secrets** (private backend secrets)
3. **Deploy Edge Function** (already deployed: `update-nft-metadata`)
4. **Redeploy Netlify Site**
   - Go to **Deploys** → **Trigger deploy** → **Deploy site**
   - Wait for build to complete

## Verify Security

After deployment, verify the private key is NOT in your JavaScript:

1. Visit your deployed site
2. Open Chrome DevTools → Sources
3. Search all JavaScript files for your private key array
4. **If you find it:** Your deployment is insecure - check your `.env` file

## Migration from Old Setup

If you previously had `VITE_UPDATE_AUTHORITY_PRIVATE_KEY`:

1. ✅ Remove it from Netlify environment variables
2. ✅ Remove it from your local `.env` file
3. ✅ Add it to Supabase Edge Function secrets (without `VITE_` prefix)
4. ✅ Redeploy both Netlify and ensure Edge Function is deployed
5. ⚠️ Consider rotating your update authority key if it was previously exposed

## Support

If you have questions about the secure architecture, refer to:
- Supabase Edge Functions documentation
- Metaplex NFT update authority best practices
