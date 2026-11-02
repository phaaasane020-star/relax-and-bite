// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';

// Use the Netlify adapter only when building for deployment,
// not during local development (npm run dev).
const isDev = process.argv.includes('dev');

export default defineConfig({
  output: 'server',
  adapter: isDev ? undefined : netlify(),
  // Start fetching a page when a finger or pointer lands on its link, so it's
  // often ready by the time the tap finishes
  prefetch: { prefetchAll: true, defaultStrategy: 'tap' },
  vite: {
    plugins: [tailwindcss()],
  },
});
