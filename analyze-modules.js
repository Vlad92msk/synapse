// analyze-modules.js
import fs from 'fs'

import path from 'path'

// Анализ размеров модулей
function analyzeModuleSize(modulePath) {
  try {
    const content = fs.readFileSync(modulePath, 'utf8');
    const lines = content.split('\n').length;
    const chars = content.length;
    const imports = (content.match(/import.*from/g) || []).length;
    const exports = (content.match(/export/g) || []).length;

    return {
      path: modulePath,
      size: (chars / 1024).toFixed(2) + ' KB',
      lines,
      imports,
      exports,
      hasHeavyImports: checkHeavyImports(content)
    };
  } catch (error) {
    return { path: modulePath, error: error.message };
  }
}

function checkHeavyImports(content) {
  const heavyPatterns = [
    'rxjs/operators',
    'lodash',
    'moment',
    'date-fns',
    'immer',
    'reselect'
  ];

  return heavyPatterns.filter(pattern => content.includes(pattern));
}

// Анализируем исходники
const sourceModules = [
  'src/api/index.ts',
  'src/core/index.ts',
  'src/react/index.ts',
  'src/reactive/index.ts',
  'src/utils/index.ts',
  'src/index.ts'
];

console.log('🔍 Анализ исходных модулей:');
console.log('='.repeat(50));

sourceModules.forEach(module => {
  if (fs.existsSync(module)) {
    const analysis = analyzeModuleSize(module);
    console.log(`📁 ${module}:`);
    console.log(`   Размер: ${analysis.size}`);
    console.log(`   Строки: ${analysis.lines}`);
    console.log(`   Импорты: ${analysis.imports}`);
    console.log(`   Экспорты: ${analysis.exports}`);
    if (analysis.hasHeavyImports.length > 0) {
      console.log(`   ⚠️  Тяжелые импорты: ${analysis.hasHeavyImports.join(', ')}`);
    }
    console.log('');
  }
});

// Анализируем собранные модули
const distModules = [
  'dist/core/index.js',
  'dist/api/index.js',
  'dist/reactive/index.js',
  'dist/react/index.js',
  'dist/utils/index.js'
];

console.log('📦 Анализ собранных модулей:');
console.log('='.repeat(50));

distModules.forEach(module => {
  if (fs.existsSync(module)) {
    const stats = fs.statSync(module);
    const content = fs.readFileSync(module, 'utf8');

    // Ищем что именно занимает место
    const hasReact = content.includes('React') || content.includes('useState');
    const hasRxJS = content.includes('rxjs') || content.includes('Observable');
    const hasLargeObjects = content.match(/\{[^}]{500,}\}/g);

    console.log(`📁 ${module}:`);
    console.log(`   Размер: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   React код: ${hasReact ? '❌ Да' : '✅ Нет'}`);
    console.log(`   RxJS код: ${hasRxJS ? '❌ Да' : '✅ Нет'}`);
    console.log(`   Большие объекты: ${hasLargeObjects?.length || 0}`);
    console.log('');
  }
});

// Топ строк по размеру в бандле
console.log('🔍 Поиск самых тяжелых частей в full bundle:');
if (fs.existsSync('dist/bundles/synapse-full.js')) {
  const fullBundle = fs.readFileSync('dist/bundles/synapse-full.js', 'utf8');
  const lines = fullBundle.split('\n');

  const heavyLines = lines
    .map((line, index) => ({ line: line.trim(), index, length: line.length }))
    .filter(item => item.length > 200)
    .sort((a, b) => b.length - a.length)
    .slice(0, 10);

  heavyLines.forEach(item => {
    console.log(`Строка ${item.index}: ${item.length} символов`);
    console.log(`   ${item.line.substring(0, 100)}...`);
  });
}
