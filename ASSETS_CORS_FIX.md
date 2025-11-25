# Fix CORS Issue for Netlify Assets Site

## The Problem

Your main app at Netlify is trying to load images from `https://trapstars-assets.netlify.app`, but that server isn't returning CORS headers. This causes the canvas to be "tainted" and prevents image generation.

## The Solution

You need to add CORS headers to your **trapstars-assets** Netlify site (this is a DIFFERENT site from your main app).

### Steps:

1. **Go to your trapstars-assets repository** (wherever it's hosted)

2. **Create a file named `_headers`** (no file extension) in the root of that repository

3. **Add this content to the `_headers` file:**

```
/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Access-Control-Allow-Headers: Content-Type
```

4. **Commit and push the changes**

5. **Wait for Netlify to redeploy** the assets site

6. **Test the fix** by trying the swap again in your main app

## What This Does

The `_headers` file tells Netlify to add CORS headers to ALL files (`/*`) served from your assets site. This allows your main app to load these images into a canvas and export them.

## Alternative: Quick Test with Local URLs

If you want to test immediately without fixing the assets site, you could temporarily switch back to local images:

1. Change `NETLIFY_ASSETS_BASE` in app.js to use local URLs instead
2. This would only work for development, not production

But the proper fix is to add the `_headers` file to your assets site.
