// Проверяет, что значение secret key не попало в собранный фронтенд (dist/).
// Просто grep "sb_secret" не подходит: эта подстрока есть в коде самой supabase-js.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './users.ts';

const secret = env('SUPABASE_SECRET_KEY');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

const leaked = files('dist').filter((f) => readFileSync(f, 'utf8').includes(secret));
if (leaked.length) {
  console.error('FAIL: secret key найден в', leaked);
  process.exit(1);
}
console.log(`PASS: secret key не найден в dist/ (${files('dist').length} файлов)`);
