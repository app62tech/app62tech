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

// One entry per offering. `order` controls display order on the home page.
// No invented differentiators.
const servicesCollection = defineCollection({
  loader: glob({ pattern: '*.md', base: 'src/data/services' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(), // short copy (hero, service cards)
    description: z.string(), // long copy
    suitsWho: z.string(), // "who it suits"
    icon: z.string(),
    order: z.number(),
    page: z.string().optional(), // has its own page/section; not listed with the development services
    partOf: z.string().optional(), // id of an umbrella service this one is delivered within
    metadata: metadataDefinition(),
  }),
});

// One entry per shipped app, shown in the home page's Work grid (screenshots
// are imported there). No invented metrics/testimonials.
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
    metadata: metadataDefinition(),
  }),
});

export const collections = {
  services: servicesCollection,
  work: workCollection,
};
