/// <reference types="vite/client" />

// The Bungie app's credentials, built into the page: from .env.local when
// developing, from the GitHub secrets in the deploy. The DIM API key comes the
// same way, registered for the same address; without one, DIM's tags and
// notes are skipped.
interface ImportMetaEnv {
  readonly VITE_BUNGIE_API_KEY: string
  readonly VITE_BUNGIE_CLIENT_ID: string
  readonly VITE_BUNGIE_CLIENT_SECRET: string
  readonly VITE_DIM_API_KEY?: string
}
