This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Meshy AI API (Primary 3D generation service)
MESHY_API_KEY=your_meshy_api_key
MESHY_IMAGE_TO_3D_URL=https://api.meshy.ai/v2/image-to-3d
MESHY_JOB_STATUS_URL_TEMPLATE=https://api.meshy.ai/v2/image-to-3d/{id}

# Gemini API (Image enhancement - optional)
GEMINI_API_KEY=your_gemini_api_key

# Tripo3D API (Fallback 3D generation service - optional)
# If Meshy doesn't complete within 10 seconds, automatically fallbacks to Tripo3D
TRIPO3D_API_KEY=your_tripo3d_api_key
```

### API Keys

- **Meshy AI**: Get your API key at [https://www.meshy.ai/](https://www.meshy.ai/)
- **Gemini**: Get your API key at [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- **Tripo3D**: Get your API key at [https://platform.tripo3d.ai/](https://platform.tripo3d.ai/)

### Fallback Logic

The system uses Meshy AI as the primary 3D generation service for both **image-to-3D** and **text-to-3D** generation. If Meshy doesn't complete within 10 seconds, it automatically falls back to Tripo3D (if configured). This ensures your models are always generated even if one service is slow or unavailable.

**Supported Endpoints with Fallback:**
- `/api/whiteboard/send` - Image-to-3D (from drawings or image uploads)
- `/api/whiteboard/text` - Text-to-3D (preview mode only)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
