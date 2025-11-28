/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    lang: 'en' | 'de';
  }
}

interface ImportMetaEnv {
  readonly DIRECTUS_URL: string;
  readonly DIRECTUS_ADMIN_EMAIL: string;
  readonly DIRECTUS_ADMIN_PASSWORD: string;
  readonly PUBLIC_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

