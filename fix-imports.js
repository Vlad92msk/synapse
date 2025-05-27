import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');

function fixImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Простая логика: заменяем все импорты без .js
  let fixedContent = content;

  // Исправляем все виды экспортов и импортов
  fixedContent = fixedContent.replace(
    /((?:import|export).*?from\s+['"])(\.\/.+?)(?<!\.js)(['"])/g,
    (match, prefix, importPath, suffix) => {
      // Если уже есть .js - не трогаем
      if (importPath.endsWith('.js')) {
        return match;
      }

      // Если путь содержит точку (файл типа base-storage.service) - добавляем .js
      if (importPath.match(/\.[a-zA-Z-]+[^/]*$/)) {
        return prefix + importPath + '.js' + suffix;
      }

      // Если это простое имя (папка) - добавляем /index.js
      return prefix + importPath + '/index.js' + suffix;
    }
  );

  if (content !== fixedContent) {
    fs.writeFileSync(filePath, fixedContent);
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
