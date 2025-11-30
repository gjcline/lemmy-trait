# Deployment Instructions

## Step 1: Deploy Edge Function

You have two options:

### Option A: Use the MCP Tool (Recommended)
Since you're already in this chat interface, you can deploy directly using:

```
Hey Claude, deploy the upload-to-arweave edge function with these settings:
- name: upload-to-arweave
- slug: upload-to-arweave  
- verify_jwt: false
- Include the index.ts file from supabase/functions/upload-to-arweave/
```

### Option B: Manual Deployment via Supabase CLI
If you have Supabase CLI installed:

```bash
# Navigate to project directory
cd /path/to/trap-stars-production

# Login to Supabase (if not already)
supabase login

# Link to your project
supabase link --project-ref wpozbvpfyeadifgaqcnr

# Deploy the function
supabase functions deploy upload-to-arweave --no-verify-jwt

# Set the secret (if not already set)
supabase secrets set UPDATE_AUTHORITY_PRIVATE_KEY="[103,109,190,251,30,201,24,197,15,124,150,237,86,124,158,23,85,92,65,240,88,10,95,220,188,152,126,186,24,11,206,241,16,118,58,94,170,151,60,114,189,171,27,154,84,54,158,118,202,4,133,245,250,214,94,126,0,151,38,182,246,103,174,226]"
```

## Step 2: Verify Deployment

Test the edge function directly:

```bash
curl -X POST "https://wpozbvpfyeadifgaqcnr.supabase.co/functions/v1/upload-to-arweave" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwb3pidnBmeWVhZGlmZ2FxY25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4NTA3MDMsImV4cCI6MjA3OTQyNjcwM30.pe2W6kTt-i67ZBjUhjDc1aV-bobz6amINrZJtZrivr8" \
  -H "Content-Type: application/json" \
  -d '{"data": {"test": "metadata"}, "type": "metadata"}'
```

Expected response:
```json
{
  "success": true,
  "url": "https://gateway.irys.xyz/...",
  "id": "...",
  "timestamp": ...
}
```

## Step 3: Fund the Wallet

The update authority wallet needs SOL for Arweave uploads:

**Wallet Address**: `27G5udze2GjVmZQS3XyHWHHBFfpuXZV4mpkNcHHxeeTK`

Send at least **0.1 SOL** to cover ~100 swaps.

Check balance:
```bash
solana balance 27G5udze2GjVmZQS3XyHWHHBFfpuXZV4mpkNcHHxeeTK
```

## Step 4: Test a Swap

1. Open your app in browser
2. Open DevTools console (F12)
3. Connect wallet
4. Select an NFT and perform a swap
5. Watch console logs for:
   - `✅ Image uploaded to Arweave: https://gateway.irys.xyz/...`
   - `✅ Metadata uploaded to Arweave: https://gateway.irys.xyz/...`
6. Click the URLs to verify they're accessible
7. Wait 2-3 minutes
8. Refresh NFT list and verify attributes display

## Step 5: Verify in Wallet & Marketplaces

- **Phantom Wallet**: Should show updated image and traits
- **Magic Eden**: Check your collection
- **Tensor**: Verify NFT appears correctly
- **Solscan**: Check on-chain metadata URI

## Troubleshooting

### "Edge function not found"
- Verify deployment completed successfully
- Check function name is exactly `upload-to-arweave`
- Wait 1-2 minutes after deployment

### "UPDATE_AUTHORITY_PRIVATE_KEY not configured"
- Set the secret in Supabase dashboard or via CLI
- Redeploy the function after setting secrets

### "Insufficient funds"
- Check wallet balance
- Ensure at least 0.01 SOL in update authority wallet

### URLs not accessible
- Check if transaction went through (look for transaction ID in logs)
- Verify Irys node status
- Try alternative gateway: `https://[transaction-id].irys.xyz`

## Success Checklist

- [ ] Edge function deployed successfully
- [ ] UPDATE_AUTHORITY_PRIVATE_KEY secret configured
- [ ] Update authority wallet funded (≥0.1 SOL)
- [ ] Test upload returns Arweave URL
- [ ] URL accessible in browser
- [ ] Swap transaction completes without errors
- [ ] Console shows Arweave URLs (not Pinata)
- [ ] NFT shows all 15 attributes after indexer refresh
- [ ] Actual generated image displays (not placeholder)
- [ ] NFT appears correctly in wallet and marketplaces

## Next Steps After Successful Deployment

1. Monitor first few swaps closely
2. Check Arweave upload costs vs. expected
3. Monitor update authority wallet balance
4. Set up alerts for low balance
5. Consider adding balance check in UI before swaps
