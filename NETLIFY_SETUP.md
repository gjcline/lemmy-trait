# Netlify Deployment Setup

## Environment Variables

Your app is now configured to work with Netlify environment variables. Follow these steps to set them up:

### 1. Go to Netlify Dashboard

1. Open your site in Netlify
2. Go to **Site settings** → **Environment variables**

### 2. Add These Environment Variables

Add each of the following variables with your actual values:

```
VITE_HELIUS_API_KEY = your_helius_api_key
VITE_COLLECTION_ADDRESS = your_collection_address
VITE_UPDATE_AUTHORITY = your_update_authority_wallet
VITE_UPDATE_AUTHORITY_PRIVATE_KEY = [your,private,key,array]
VITE_RPC_ENDPOINT = https://mainnet.helius-rpc.com/?api-key=your_helius_api_key
VITE_LAYER_ORDER = ["background","body","shirt","weapons","accessories","logo","meme","iceout chain","face","mouth","eyes","eyebrows","hair","eyewear","headwear"]
VITE_OPTIONAL_LAYERS = ["face","eyewear","headwear","accessories","weapons","iceout chain"]
VITE_IMAGE_SIZE = 1750
```

**Important Notes:**
- For `VITE_UPDATE_AUTHORITY_PRIVATE_KEY`, copy the entire array from your `config.json` file
- For `VITE_LAYER_ORDER` and `VITE_OPTIONAL_LAYERS`, copy the exact JSON arrays as shown
- Make sure there are no extra spaces or line breaks

### 3. Redeploy Your Site

After adding the environment variables, trigger a new deployment:
- Go to **Deploys** → **Trigger deploy** → **Deploy site**

### 4. How It Works

The app now:
- **Local Development**: Uses `config.json` file (not committed to git)
- **Production (Netlify)**: Uses environment variables

This keeps your private keys secure while allowing the app to work in both environments.

### 5. Verify It's Working

After deployment:
1. Visit your Netlify URL
2. The "Configuration Required" warning should be gone
3. You should be able to connect your wallet and see your NFTs
