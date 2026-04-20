// Public env exposed to the browser via NEXT_PUBLIC_*
export const env = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.doctortot.com',
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '',
  sendblueNumber: process.env.NEXT_PUBLIC_SENDBLUE_NUMBER ?? '+15551234567',
};
