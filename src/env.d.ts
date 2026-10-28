/// <reference types="vite/client" />

// The Bungie app's credentials, built into the page: from .env.local when
// developing, from the GitHub secrets in the deploy.
interface ImportMetaEnv {
  readonly VITE_BUNGIE_API_KEY: string
  readonly VITE_BUNGIE_CLIENT_ID: string
  readonly VITE_BUNGIE_CLIENT_SECRET: string
}
