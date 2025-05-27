// Скрипт для анализа размера библиотеки
import fs from 'fs';
import path from 'path';

function analyzeSize(dir, prefix = '') {
  const files = fs.readdirSync(dir);
  let totalSize = 0;
  const results = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      const { size, breakdown } = analyzeSize(filePath, `${prefix}${file}/`);
      totalSize += size;
      results.push(...breakdown);
    } else {
      const size = stat.size;
      totalSize += size;
      results.push({
        file: `${prefix}${file}`,
        size: size,
        sizeKB: Math.round(size / 1024 * 100) / 100,
        type: getFileType(file)
      });
    }
  }

  return { size: totalSize, breakdown: results };
}

function getFileType(filename) {
  if (filename.endsWith('.js')) return 'ES Module';
  if (filename.endsWith('.cjs')) return 'CommonJS';
  if (filename.endsWith('.d.ts')) return 'Types';
  if (filename.endsWith('.d.cts')) return 'CJS Types';
  if (filename.endsWith('.map')) return 'Source Map';
  return 'Other';
}

const { size, breakdown } = analyzeSize('./dist');

console.log('📦 Анализ размера библиотеки synapse-storage:\n');

// Сортируем по размеру
breakdown.sort((a, b) => b.size - a.size);

console.log('🔥 Самые большие файлы:');
breakdown.slice(0, 10).forEach(({ file, sizeKB, type }) => {
  console.log(`${file.padEnd(25)} ${sizeKB.toString().padStart(8)} KB  [${type}]`);
});

console.log(`\n📊 Общий размер: ${Math.round(size / 1024)} KB`);

// Группировка по типам
const groups = {};
breakdown.forEach(f => {
  if (!groups[f.type]) groups[f.type] = [];
  groups[f.type].push(f);
});

console.log('\n📋 По типам файлов:');
Object.entries(groups).forEach(([type, files]) => {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const count = files.length;
  console.log(`${type.padEnd(15)}: ${Math.round(totalSize / 1024).toString().padStart(4)} KB (${count} файлов)`);
});

// Размер который увидят на npm
const npmSize = breakdown.filter(f =>
  !f.file.includes('.map') ||
  f.type !== 'Source Map'
).reduce((sum, f) => sum + f.size, 0);

console.log(`\n🌐 Размер на npm (без source maps): ${Math.round(npmSize / 1024)} KB`);
