import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');

function fixImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Заменяем импорты без расширений на импорты с .js
  const fixedContent = content.replace(
    /from\s+['"](\.\/.+?)(?<!\.js)['"];?/g,
    (match, importPath) => {
      // Если путь заканчивается на /index, добавляем .js
      if (importPath.endsWith('/index')) {
        return match.replace(importPath, importPath + '.js');
      }
      // Если это файл (содержит точку в названии), добавляем .js
      if (importPath.includes('.') && !importPath.endsWith('/')) {
        return match.replace(importPath, importPath + '.js');
      }
      // Если это папка без /index, добавляем /index.js
      return match.replace(importPath, importPath + '/index.js');
    }
  );

  // Также исправляем export * from и export { } from
  const finalContent = fixedContent.replace(
    /export\s+.*?from\s+['"](\.\/.+?)(?<!\.js)['"];?/g,
    (match, importPath) => {
      if (importPath.endsWith('/index')) {
        return match.replace(importPath, importPath + '.js');
      }
      // Если это файл (содержит точку в названии), добавляем .js
      if (importPath.includes('.') && !importPath.endsWith('/')) {
        return match.replace(importPath, importPath + '.js');
      }
      return match.replace(importPath, importPath + '/index.js');
    }
  );

  if (content !== finalContent) {
    fs.writeFileSync(filePath, finalContent);
    console.log(`Fixed imports in: ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.js')) {
      fixImports(filePath);
    }
  }
}

console.log('Fixing ES module imports...');
walkDir(distDir);
console.log('Done!');
