const fs = require('fs');
const glob = require('glob');
const files = glob.sync('src/Controllers/**/*.ts');
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/req\.query\.([a-zA-Z0-9_]+)/g, '(req.query.$1 as string)');
  c = c.replace(/req\.params\.([a-zA-Z0-9_]+)/g, '(req.params.$1 as string)');
  fs.writeFileSync(f, c);
}
