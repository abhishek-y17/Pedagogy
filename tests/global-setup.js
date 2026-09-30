// Always run the suite against an EMPTY Supabase config, even when Playwright
// reuses an already-running dev server (whose startup command would otherwise be
// skipped) and js/generated/config.js holds real values from `npm run dev` or
// `npm run test:live`. Guarantees `npm test` can never touch the real database.
const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-config.js'), '--empty'], { stdio: 'ignore' });
};
