# Meshy Webhook Setup Guide

This guide explains how to set up Meshy webhooks to replace the polling approach for real-time task status updates.

## Why Webhooks?

✅ **Real-time updates** - Get notified instantly when tasks complete  
✅ **Better performance** - No need to constantly poll the API  
✅ **Cost effective** - Reduces API calls and respects rate limits  
✅ **Scalable** - Handles multiple concurrent tasks efficiently  

## Setup Instructions

### 1. Configure Webhook in Meshy Dashboard

1. Log in to the [Meshy web application](https://app.meshy.ai/)
2. Navigate to **API Settings** page
3. Find the **"Webhooks"** section below your API Keys
4. Click **"Create Webhook"**
5. Enter your webhook URL:
   - **Production**: `https://your-domain.com/api/whiteboard/webhook`
   - **Development**: See local testing section below
6. **Enable** the webhook
7. Save the configuration

### 2. Local Development Testing

For local testing, you can use a webhook forwarding service like [smee.io](https://smee.io/):

#### Get a Webhook Proxy URL

1. Visit [https://smee.io/](https://smee.io/)
2. Click **"Start a new channel"**
3. Copy the **Webhook Proxy URL** (e.g., `https://smee.io/abc123...`)

#### Install smee-client

```bash
npm install --global smee-client
```

#### Forward Webhooks to Your Local Server

```bash
smee --url https://smee.io/YOUR_CHANNEL_ID --path /api/whiteboard/webhook --port 3000
```

You should see:
```
Forwarding https://smee.io/YOUR_CHANNEL_ID to http://127.0.0.1:3000/api/whiteboard/webhook
Connected https://smee.io/YOUR_CHANNEL_ID
```

#### Configure the Proxy URL in Meshy

Use the smee.io proxy URL when creating the webhook in the Meshy dashboard.

### 3. Start Your Development Server

```bash
npm run dev
```

Now when Meshy sends webhook events, they'll be forwarded to your local server!

## How It Works

### Before (Polling Approach)
```
1. Client submits image
2. Server creates Meshy task
3. Server polls every 5 seconds (up to 600 seconds)
4. Returns result when complete
```

### After (Webhook Approach)
```
1. Client submits image
2. Server creates Meshy task
3. Server returns task ID immediately
4. Meshy sends webhook updates as task progresses
5. Client polls /api/whiteboard/status for updates
```

## API Changes

### `/api/whiteboard/send` (POST)
- **Before**: Blocked for minutes while polling
- **After**: Returns immediately with task ID
- Response:
  ```json
  {
    "id": "task_abc123",
    "status": "PENDING",
    "message": "Task created. Status updates will be received via webhook."
  }
  ```

### `/api/whiteboard/webhook` (POST) - NEW
- Receives webhook events from Meshy
- Updates `meshy_status.json` with task progress
- Responds with 200 OK to acknowledge receipt

### `/api/whiteboard/status` (GET)
- Unchanged - still reads from `meshy_status.json`
- Now updated by webhook instead of polling

## Webhook Payload Structure

Meshy sends JSON payloads with this structure:

```typescript
{
  id: string;              // Task ID
  status: string;          // PENDING, IN_PROGRESS, SUCCEEDED, FAILED, EXPIRED
  progress: number;        // 0-100
  model_urls?: {           // Available when status is SUCCEEDED
    glb: string;
    fbx: string;
    usdz: string;
    // ... other formats
  };
  task_error?: {           // Present if status is FAILED
    message: string;
  };
}
```

## Troubleshooting

### Webhook Not Receiving Events

1. **Check webhook is enabled** in Meshy dashboard
2. **Verify URL** is correct and accessible from the internet
3. **Check logs** for incoming webhook requests:
   ```bash
   # Look for "[Meshy Webhook]" in your server logs
   ```
4. **Test connectivity** - Meshy must be able to reach your HTTPS endpoint

### Multiple Webhooks

- You can have up to **5 active webhooks** per Meshy account
- All webhooks receive all task updates
- Make sure you're using the correct one for this project

### Webhook Delivery Failures

- Your server **must respond with HTTP status < 400**
- Response codes ≥ 400 are treated as failed delivery
- Multiple failures may cause Meshy to auto-disable the webhook
- The webhook endpoint returns 200 even on internal errors to prevent retry storms

## Security Considerations

Currently, the webhook endpoint accepts any POST request. For production, consider:

1. **IP Allowlisting** - Only accept requests from Meshy's IP ranges
2. **Signature Verification** - Verify webhook signatures if Meshy provides them
3. **Rate Limiting** - Prevent abuse with rate limits
4. **HTTPS Only** - Meshy requires HTTPS for security

## References

- [Meshy Webhook Documentation](https://docs.meshy.ai/en/api/webhooks)
- [smee.io - Webhook payload delivery service](https://smee.io/)

