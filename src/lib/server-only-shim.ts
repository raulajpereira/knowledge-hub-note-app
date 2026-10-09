// The worker, CLI and seed bundles (esbuild, plain Node) aren't React Server
// Components: `server-only` would throw there, so these bundles alias it to
// this empty module. In the Next app it keeps guarding against client imports.
export {};
