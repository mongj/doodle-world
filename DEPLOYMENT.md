# Deploying to Netlify

This guide will help you deploy your Rapier test project to Netlify.

## Prerequisites

1. Make sure your code is pushed to a Git repository (GitHub, GitLab, or Bitbucket)
2. Have a Netlify account (free at netlify.com)

## Deployment Steps

### Option 1: Deploy via Netlify UI (Recommended)

1. **Go to Netlify Dashboard**
   - Visit [netlify.com](https://netlify.com) and sign in
   - Click "Add new site" → "Import an existing project"

2. **Connect Your Repository**
   - Choose your Git provider (GitHub, GitLab, etc.)
   - Select your repository containing this project

3. **Configure Build Settings**
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - Click "Deploy site"

### Option 2: Deploy via Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Deploy**
   ```bash
   netlify deploy --prod
   ```

## Important Notes

- The `netlify.toml` file is already configured with the necessary settings
- WASM files will be served with the correct MIME type
- CORS headers are configured for SharedArrayBuffer support (required for Rapier)
- The site will automatically redeploy when you push changes to your repository

## Troubleshooting

If you encounter issues:

1. **Check build logs** in the Netlify dashboard
2. **Verify WASM files** are being served correctly
3. **Test locally** with `npm run build && npm run preview` before deploying

## File Size Considerations

Your project includes large assets:
- `tavern_splats.spz` (26MB)
- `tavern_mesh.glb` (11MB)
- `orc.glb` (4.8MB)

These will be uploaded to Netlify and served from their CDN. The first load might be slow, but subsequent loads will be cached. 