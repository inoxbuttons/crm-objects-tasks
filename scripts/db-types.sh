#!/bin/sh
# Генерирует src/lib/database.types.ts по схеме облачной БД
set -e
set -a; . ./.env.local; set +a
npx supabase gen types typescript --remote="$SUPABASE_DB_URL" --schema public > src/lib/database.types.ts.tmp
mv src/lib/database.types.ts.tmp src/lib/database.types.ts
