#!/usr/bin/env node
/**
 * tools/build-apk.mjs
 * ساخت خودکار فایل نصبی نهایی اندروید (.apk) با آخرین تغییرات وب و امضای اختصاصی.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');

console.log('🚀 ۱. همگام‌سازی کدهای وب و دارایی‌ها با پروژهٔ اندروید...');
execSync('npm run cap:sync', { cwd: ROOT, stdio: 'inherit' });

// یافتن JDK مناسب (پیش‌فرض C:\jdk21 یا محیط)
let javaHome = process.env.JAVA_HOME;
const localJdk21 = 'C:\\jdk21\\jdk-21.0.12.1+1';
if (fs.existsSync(path.join(localJdk21, 'bin', 'java.exe'))) {
  javaHome = localJdk21;
}

// یافتن Android SDK
let androidHome = process.env.ANDROID_HOME;
const defaultSdk = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
if (!androidHome && fs.existsSync(defaultSdk)) {
  androidHome = defaultSdk;
}

const isRelease = !process.argv.includes('--debug');
const task = isRelease ? 'assembleRelease' : 'assembleDebug';

console.log(`🔨 ۲. شروع فرآیند ساخت گرادل (${task})...`);
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
};

execSync(`${gradlew} ${task}`, {
  cwd: ANDROID_DIR,
  stdio: 'inherit',
  env,
});

const outFolder = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', isRelease ? 'release' : 'debug');
const apkName = isRelease ? 'app-release.apk' : 'app-debug.apk';
const apkPath = path.join(outFolder, apkName);

if (fs.existsSync(apkPath)) {
  const stat = fs.statSync(apkPath);
  const sizeMb = (stat.size / 1024 / 1024).toFixed(2);
  console.log('\n========================================');
  console.log(`🎉 فایل APK با موفقیت تولید شد!`);
  console.log(`📦 مسیر فایل: ${apkPath}`);
  console.log(`⚖️  حجم فایل: ${sizeMb} مگابایت`);
  console.log('========================================\n');
} else {
  console.error(`❌ فایل ${apkName} در پوشهٔ خروجی یافت نشد.`);
  process.exit(1);
}
