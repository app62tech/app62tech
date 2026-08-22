import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const metadataDefinition = () =>
  z
    .object({
      title: z.string().optional(),
      ignoreTitleTemplate: z.boolean().optional(),

      canonical: z.string().url().optional(),

      robots: z
        .object({
          index: z.boolean().optional(),
          follow: z.boolean().optional(),
        })
        .optional(),

      description: z.string().optional(),

      openGraph: z
        .object({
          url: z.string().optional(),
          siteName: z.string().optional(),
          images: z
            .array(
              z.object({
                url: z.string(),
                width: z.number().optional(),
                height: z.number().optional(),
              })
            )
            .optional(),
          locale: z.string().optional(),
          type: z.string().optional(),
        })
        .optional(),

      twitter: z
        .object({
          handle: z.string().optional(),
          site: z.string().optional(),
          cardType: z.string().optional(),
        })
        .optional(),
    })
    .optional();

// One entry per offering (PRD §7.2). `order` controls display order on the
// Home and Services pages. Copy must come from the PRD verbatim — no
// invented differentiators.
const servicesCollection = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/data/services' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(), // short card copy (Home)
    description: z.string(), // full copy (Services page)
    suitsWho: z.string(), // "who it suits"
    icon: z.string(),
    order: z.number(),
    metadata: metadataDefinition(),
  }),
});

// One entry per case study — only Clique exists at launch (PRD §7.3, §11).
// No invented metrics/testimonials; `screenshots` stays empty until real
// assets are supplied.
const workCollection = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/data/work' }),
  schema: z.object({
    title: z.string(),
    client: z.string(),
    problem: z.string(),
    whatWasBuilt: z.string(),
    surfaces: z.string(),
    outcome: z.string(),
    siteUrl: z.string().url().optional(),
    appStoreUrl: z.string().url().optional(),
    screenshots: z.array(z.string()).default([]),
    metadata: metadataDefinition(),
  }),
});

export const collections = {
  services: servicesCollection,
  work: workCollection,
};
