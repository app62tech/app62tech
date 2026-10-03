import path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import icon from 'astro-icon';
import compress from 'astro-compress';
import cloudflare from '@astrojs/cloudflare';

import astrowind from './vendor/integration';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://app62.tech',

  // The site is a single page; old multi-page URLs land on their section.
  redirects: {
    '/services': '/#services',
    '/contact': '/#contact',
    '/work': '/#work',
    '/work/clique': '/#work',
    '/work/cardlynk': '/#work',
    '/work/menu-gen-ai': '/#work',
    '/work/vetra': '/#work',
  },

  // Default 'static' output — every page prerenders to a static file served
  // straight from the assets binding. Only the contact API route opts out
  // via `export const prerender = false`, which is what triggers the Worker
  // build for that one route.
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    // Every page is prerendered, so Sharp does all image optimization at
    // build time — 'compile' bakes that in and avoids Cloudflare's runtime
    // image service, which this static site never needs.
    imageService: 'compile',
  }),

  // Inline the (small) stylesheet so first paint doesn't wait on a CSS request.
  build: {
    inlineStylesheets: 'always',
  },

  integrations: [
    sitemap(),
    mdx(),
    icon({
      include: {
        tabler: ['*'],
      },
    }),

    compress({
      // csso off on purpose: its parser doesn't understand the media range
      // syntax Tailwind v4 emits for breakpoints (`@media (width>=48rem)`) and
      // silently drops every one of those blocks — the site then renders as if
      // all `md:`/`lg:` classes were missing. lightningcss parses it correctly.
      CSS: { csso: false, lightningcss: { minify: true } },
      HTML: {
        'html-minifier-terser': {
          removeAttributeQuotes: false,
        },
      },
      Image: false,
      JavaScript: true,
      SVG: false,
      Logger: 1,
    }),

    astrowind({
      config: './src/config.yaml',
    }),
  ],

  image: {
    responsiveStyles: true,
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // Allows the local dev server to be reached through a Cloudflare
      // Tunnel at dev.app62.tech for on-device/preview testing.
      allowedHosts: ['dev.app62.tech'],
    },
  },
});
