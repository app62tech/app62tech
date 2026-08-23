import { getPermalink, getHomePermalink } from './utils/permalinks';

export const headerData = {
  links: [
    { text: 'Home', href: getHomePermalink() },
    { text: 'Services', href: getPermalink('/services') },
    { text: 'Work', href: getPermalink('/work') },
    { text: 'Contact', href: getPermalink('/contact') },
  ],
  actions: [{ text: 'Get in touch', href: getPermalink('/contact'), variant: 'primary' }],
};

export const footerData = {
  links: [],
  secondaryLinks: [
    { text: 'Privacy Policy', href: getPermalink('/privacy') },
    { text: 'Terms', href: getPermalink('/terms') },
  ],
  socialLinks: [
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: 'https://www.instagram.com/app62.tech' },
    { ariaLabel: 'YouTube', icon: 'tabler:brand-youtube', href: 'https://www.youtube.com/@app6239' },
  ],
  // TODO: replace "App62" with the registered legal entity name once available (PRD §9).
  footNote: `
    <a href="mailto:hello@app62.tech" class="text-accent underline">hello@app62.tech</a> · &copy; ${new Date().getFullYear()} App62. All rights reserved.
  `,
};
