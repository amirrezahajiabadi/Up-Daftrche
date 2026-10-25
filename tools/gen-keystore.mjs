#!/usr/bin/env node
/**
 * tools/gen-keystore.mjs
 * ساخت کلید اختصاصی امضای ریلیز اندروید (daftarche-release.jks) برای انتشار در بازار و مایکت.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const KEYSTORE_PATH = path.join(ANDROID_DIR, 'daftarche-release.jks');
const PROPS_PATH = path.join(ANDROID_DIR, 'keystore.properties');

function findKeytool() {
  // 1. PATH
  try {
    const res = spawnSync('keytool', ['-help'], { stdio: 'ignore' });
    if (res.status === 0) return 'keytool';
  } catch {}

  // 2. Android Studio JBR (Windows)
  const asJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe';
  if (fs.existsSync(asJbr)) return asJbr;

  // 3. JAVA_HOME
  if (process.env.JAVA_HOME) {
    const envKeytool = path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
    if (fs.existsSync(envKeytool)) return envKeytool;
  }

  return null;
}

console.log('🔑 بررسی ابزار ساخت کلید امضا (keytool)...');
const keytool = findKeytool();
if (!keytool) {
  console.error('❌ دستور keytool یافت نشد. لطفاً JDK یا Android Studio را در PATH قرار دهید.');
  process.exit(1);
}

if (fs.existsSync(KEYSTORE_PATH)) {
  console.log(`⚠️  فایل کلید از قبل وجود دارد: ${KEYSTORE_PATH}`);
  console.log('جهت جلوگیری از باطل شدن امضا، فایل موجود بازنویسی نشد.');
  process.exit(0);
}

const password = process.argv[2] || 'daftarche144';
const alias = 'daftarche';
const dname = 'CN=Daftarche, OU=Mobile, O=Daftarche, L=Tehran, ST=Tehran, C=IR';

console.log(`🔨 در حال تولید کلید اختصاصی در: ${KEYSTORE_PATH}`);
const cmd = `"${keytool}" -genkeypair -v -keystore "${KEYSTORE_PATH}" -alias "${alias}" -keyalg RSA -keysize 2048 -validity 10000 -storepass "${password}" -keypass "${password}" -dname "${dname}"`;

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log('✅ فایل کلید امضا با موفقیت ساخته شد.');

  if (!fs.existsSync(PROPS_PATH)) {
    const content = `# تنظیمات امضای خودکار گرادل\nstoreFile=daftarche-release.jks\nstorePassword=${password}\nkeyAlias=${alias}\nkeyPassword=${password}\n`;
    fs.writeFileSync(PROPS_PATH, content, 'utf8');
    console.log(`✅ فایل تنظیمات ${PROPS_PATH} ایجاد شد.`);
  }
} catch (err) {
  console.error('❌ خطا در ساخت کلید:', err.message);
  process.exit(1);
}
