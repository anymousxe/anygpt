# Halo Chat

Local-first AI chat for home use.

## Included

- Rounded black-and-white glass UI
- One private local workspace
- Site key gate before the app opens
- Folders for organizing chats
- Local memory storage the model can write into with tool calls
- Image upload for vision chat
- Image generation mode powered by `gpt-image-1.5`
- Export and restore backups for chats, memories, folders, and saved images

## Local setup

1. Copy `.env.local.example` to `.env.local`
2. Add your `OPENAI_API_KEY`
3. Add `SITE_ACCESS_KEY`
4. Run `npm install`
5. Run `npm run dev`

## Default models

- Chat: `gpt-5.4-nano`
- Images: `gpt-image-1.5`

Override both in `.env.local` or in Vercel project environment variables if you want.

## Vercel

Set these environment variables in Vercel:

- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`
- `OPENAI_IMAGE_MODEL`
- `SITE_ACCESS_KEY`

Then deploy normally.

## Storage model

- Chats, folders, memories, and generated images are stored in browser storage on the device
- Backups are manual export/import JSON files
- If browser storage is wiped, restoring a backup brings everything back
