# Security Fix - Private Key Exposure Resolved

## ⚠️ Critical Security Issue (RESOLVED)

This document explains the security vulnerability that was fixed and how to complete the migration.

## What Was Wrong

### The Vulnerability
Your update authority private key was exposed in the frontend JavaScript bundle because it was stored in an environment variable with the `VITE_` prefix.

**In Vite (the build tool):**
- Variables prefixed with `VITE_` are **intentionally made public**
- They get embedded into the JavaScript bundle
- Anyone visiting your website could extract them

**Your compromised wallet:**
- Address: `27G5udze2GjVmZQS3XyHWHHBFfpuXZV4mpkNcHHxeeTK`
- Private key was in: `.env` as `VITE_UPDATE_AUTHORITY_PRIVATE_KEY`
- This wallet was **drained by someone who extracted the key**

### How the Attack Happened
1. Attacker visited your website
2. Opened browser DevTools → Sources
3. Searched JavaScript files for the byte array `[103,109,190,...]`
4. Copied your private key
5. Imported it into their wallet
6. Drained your funds

### Why Phantom Flagged It
Phantom detected:
- Unauthorized transactions from your update authority wallet
- Wallet was compromised and used for suspicious activity
- Multiple transfers you didn't initiate

## What Was Fixed

### Code Changes

1. **Removed private key from frontend**
   - Deleted `VITE_UPDATE_AUTHORITY_PRIVATE_KEY` from `.env`
   - Removed from `app.js` configuration loading
   - Removed from `blockchain.js` private key handling

2. **Created secure Edge Function**
   - New function: `update-nft-metadata`
   - Runs on Supabase servers (not in browser)
   - Private key stored in Supabase Secrets (encrypted, server-side)

3. **Updated NFT update flow**
   - Frontend now calls Edge Function instead of signing directly
   - Edge Function validates request and signs transaction
   - Private key never leaves the server

### Architecture Comparison

**Before (INSECURE):**
```
User Browser
  ↓ Downloads JavaScript with private key
  ↓ Signs NFT update transaction directly
  ↓ Anyone can extract key from JS
```

**After (SECURE):**
```
User Browser
  ↓ Calls Supabase Edge Function
  ↓ Edge Function (Server)
    ↓ Reads private key from secure secrets
    ↓ Signs transaction
    ↓ Returns signature
  ↓ Private key NEVER exposed
```

## What You Need to Do

### ⚠️ IMMEDIATE ACTIONS (CRITICAL)

1. **Create New Update Authority Wallet**
   - The old wallet (`27G5udze...`) is **permanently compromised**
   - Create a brand new wallet in Phantom/Solflare
   - Export the private key as a byte array (you'll need this for Supabase)
   - **NEVER** share this private key or put it in `VITE_` variables

2. **Transfer NFT Collection Update Authority**
   - Transfer update authority from old wallet to new wallet
   - Use Metaplex CLI or web interface
   - This ensures the attacker can't modify your NFTs anymore

3. **Configure Supabase Secrets**
   - Go to Supabase Dashboard → Edge Functions → Secrets
   - Add secret: `UPDATE_AUTHORITY_PRIVATE_KEY` = `[new,private,key,array]`
   - Add secret: `RPC_ENDPOINT` = your RPC URL
   - Add secret: `COLLECTION_ADDRESS` = your collection address
   - **Note:** These are server-side only, NOT prefixed with `VITE_`

4. **Update Netlify Environment Variables**
   - Remove: `VITE_UPDATE_AUTHORITY_PRIVATE_KEY` (delete completely)
   - Update: `VITE_UPDATE_AUTHORITY` = new wallet **public** address only
   - Keep all other `VITE_` variables (they're safe - they're public data)

5. **Redeploy Everything**
   - Redeploy Netlify site (to remove old compromised key from JS)
   - Edge Function is already deployed
   - Test with a non-production NFT first

### Verification Steps

After completing the above:

1. **Verify private key is NOT in JavaScript:**
   ```
   1. Visit your deployed site
   2. Open DevTools → Sources
   3. Search all JS files for your private key
   4. Should find NOTHING
   ```

2. **Verify Edge Function works:**
   ```
   1. Connect wallet
   2. Try a trait swap
   3. Should complete successfully
   4. Check transaction on Solscan
   ```

3. **Monitor new wallet:**
   ```
   1. Watch for any unauthorized transactions
   2. If you see any, the key is still exposed somewhere
   3. Repeat the process with a fresh wallet
   ```

## Security Best Practices

### ✅ DO:
- Store private keys in Supabase Secrets (server-side)
- Use `VITE_` prefix only for public data (API URLs, public addresses)
- Sign transactions on the backend
- Use environment-specific secrets
- Rotate keys if ever exposed

### ❌ DON'T:
- Put private keys in `VITE_` environment variables
- Embed private keys in JavaScript
- Commit private keys to Git
- Share private keys in documentation
- Use the same key after exposure

## Files Modified

- `.env` - Removed `VITE_UPDATE_AUTHORITY_PRIVATE_KEY`
- `app.js` - Removed private key loading from config
- `blockchain.js` - Replaced direct signing with Edge Function calls
- `swap.js` - Updated to pass user wallet to update function
- `supabase/functions/update-nft-metadata/` - New secure Edge Function
- `NETLIFY_SETUP.md` - Updated with secure architecture instructions

## Technical Details

### Edge Function Implementation
- Location: `supabase/functions/update-nft-metadata/index.ts`
- Method: POST
- Authentication: Supabase Anon Key (public is OK for this)
- Input: `{ assetId, newMetadataUri, userWallet }`
- Output: `{ success, signature }`
- Supports: Core NFTs and Compressed NFTs

### Environment Variables

**Frontend (PUBLIC - can be in VITE_):**
- API endpoints
- Public wallet addresses
- Collection addresses
- Configuration settings
- Supabase project URL
- Supabase anon key (public by design)

**Backend (PRIVATE - never in VITE_):**
- Private keys
- Service role keys
- Signing authorities
- Internal API keys

## Support

If you need help completing the migration:
1. Check this document first
2. Verify all steps are completed
3. Test with a non-production NFT
4. Only use production NFTs after verification

**Remember:** The old wallet is permanently compromised. Never use it for anything sensitive again.
