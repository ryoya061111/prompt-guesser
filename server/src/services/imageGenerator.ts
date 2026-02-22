import fs from 'fs';
import path from 'path';

const STABILITY_API_URL = 'https://api.stability.ai/v2beta/stable-image/generate/core';

export async function generateImage(prompt: string): Promise<string> {
  const apiKey = process.env.STABILITY_API_KEY;

  if (!apiKey) {
    console.log('[Mock] API key not set, returning mock image');
    return generateMockImage(prompt);
  }

  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('output_format', 'png');
  formData.append('aspect_ratio', '4:3');

  const response = await fetch(STABILITY_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'image/*',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stability AI API error: ${response.status} ${errorText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const base64 = buffer.toString('base64');
  return `data:image/png;base64,${base64}`;
}

function generateMockImage(prompt: string): string {
  // Generate a simple SVG as mock image
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
  const color = colors[Math.abs(hashCode(prompt)) % colors.length];
  const bgColor = colors[(Math.abs(hashCode(prompt)) + 3) % colors.length];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="384" viewBox="0 0 512 384">
      <rect width="512" height="384" fill="${bgColor}"/>
      <rect x="40" y="40" width="432" height="304" rx="16" fill="${color}" opacity="0.5"/>
      <text x="256" y="160" text-anchor="middle" font-size="24" fill="#333" font-family="sans-serif">AI Generated Image</text>
      <text x="256" y="196" text-anchor="middle" font-size="16" fill="#666" font-family="sans-serif">(Mock Mode)</text>
      <text x="256" y="260" text-anchor="middle" font-size="14" fill="#555" font-family="sans-serif">Prompt hint:</text>
      <text x="256" y="288" text-anchor="middle" font-size="18" fill="#333" font-family="sans-serif">${escapeXml(prompt.substring(0, 30))}...</text>
    </svg>
  `;

  const base64 = Buffer.from(svg.trim()).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
