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
    } else if (file.endsWith('.js') || file.endsWith('.cjs')) {
      const size = stat.size;
      totalSize += size;
      results.push({
        file: `${prefix}${file}`,
        size: size,
        sizeKB: Math.round(size / 1024 * 100) / 100
      });
    }
  }

  return { size: totalSize, breakdown: results };
}

const { size, breakdown } = analyzeSize('./dist');

console.log('📦 Анализ размера библиотеки synapse-storage:\n');

// Сортируем по размеру
breakdown.sort((a, b) => b.size - a.size);

console.log('🔥 Самые большие файлы:');
breakdown.slice(0, 10).forEach(({ file, sizeKB }) => {
  console.log(`${file.padEnd(25)} ${sizeKB} KB`);
});

console.log(`\n📊 Общий размер: ${Math.round(size / 1024)} KB`);

// Группировка по типам
const groups = {
  'ES Modules (.js)': breakdown.filter(f => f.file.endsWith('.js')),
  'CommonJS (.cjs)': breakdown.filter(f => f.file.endsWith('.cjs')),
};

console.log('\n📋 По форматам:');
Object.entries(groups).forEach(([type, files]) => {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  console.log(`${type}: ${Math.round(totalSize / 1024)} KB`);
});
