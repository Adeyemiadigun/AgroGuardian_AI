// Render (and some hosts) default to: `node index.js`.
// Our real entrypoint is compiled to dist/index.js.

try {
  require('./dist/index.js');
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Failed to start. Did you run `npm run build` so dist/ exists?');
  throw err;
}
