// Скрипт для проверки соответствия конфигураций
import fs from 'fs';
import path from 'path';

console.log('🔍 Проверка соответствия конфигураций...\n');

// Читаем конфигурации
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const tsupConfigContent = fs.readFileSync('./tsup.config.ts', 'utf8');

// Извлекаем entry из tsup.config.ts
const entryMatch = tsupConfigContent.match(/entry:\s*{([^}]*)}/s);
const entryEntries = [];
if (entryMatch) {
  const entryContent = entryMatch[1];
  const matches = entryContent.matchAll(/(\w+):\s*['"]([^'"]*)['"]/g);
  for (const match of matches) {
    entryEntries.push(match[1]);
  }
}

// Извлекаем external из tsup.config.ts
const externalMatch = tsupConfigContent.match(/external:\s*\[([^\]]*)\]/);
const externalDeps = [];
if (externalMatch) {
  const matches = externalMatch[1].matchAll(/['"]([^'"]*)['"]/g);
  for (const match of matches) {
    externalDeps.push(match[1]);
  }
}

console.log('📦 TSUP ENTRY:');
entryEntries.forEach(entry => {
  const exportPath = entry === 'index' ? '.' : `./${entry}`;
  const hasExport = packageJson.exports && packageJson.exports[exportPath];
  console.log(`  ${entry.padEnd(10)} → ${hasExport ? '✅' : '❌'} exports["${exportPath}"]`);
});

console.log('\n🔗 EXTERNAL DEPENDENCIES:');
externalDeps.forEach(dep => {
  const inPeer = packageJson.peerDependencies && packageJson.peerDependencies[dep];
  const inDeps = packageJson.dependencies && packageJson.dependencies[dep];
  const inDev = packageJson.devDependencies && packageJson.devDependencies[dep];

  console.log(`  ${dep.padEnd(12)} → ${inPeer ? '✅ peer' : '❌ peer'} ${inDeps ? '⚠️ deps' : '✅ no-deps'} ${inDev ? 'ℹ️ dev' : ''}`);
});

console.log('\n📁 СОЗДАННЫЕ ФАЙЛЫ:');
if (fs.existsSync('./dist')) {
  entryEntries.forEach(entry => {
    const jsFile = `./dist/${entry}.js`;
    const cjsFile = `./dist/${entry}.cjs`;
    const dtsFile = `./dist/${entry}.d.ts`;
    const dctsFile = `./dist/${entry}.d.cts`;

    console.log(`  ${entry.padEnd(10)}:`);
    console.log(`    ${fs.existsSync(jsFile) ? '✅' : '❌'} ${jsFile}`);
    console.log(`    ${fs.existsSync(cjsFile) ? '✅' : '❌'} ${cjsFile}`);
    console.log(`    ${fs.existsSync(dtsFile) ? '✅' : '❌'} ${dtsFile}`);
    console.log(`    ${fs.existsSync(dctsFile) ? '✅' : '❌'} ${dctsFile}`);
  });
} else {
  console.log('  ❌ Папка dist/ не найдена. Запустите: yarn build');
}

console.log('\n⚠️  ПОТЕНЦИАЛЬНЫЕ ПРОБЛЕМЫ:');

// Проверка dependencies vs peerDependencies
const problematicDeps = [];
if (packageJson.dependencies) {
  Object.keys(packageJson.dependencies).forEach(dep => {
    if (externalDeps.includes(dep)) {
      problematicDeps.push(dep);
    }
  });
}

if (problematicDeps.length > 0) {
  console.log('  ❌ Зависимости в dependencies, но external в tsup:');
  problematicDeps.forEach(dep => {
    console.log(`     - ${dep} (переместите в peerDependencies)`);
  });
} else {
  console.log('  ✅ Все external зависимости корректно настроены');
}

console.log('\n✨ Проверка завершена!');
