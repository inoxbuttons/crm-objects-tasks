#!/bin/sh
# Применяет миграции supabase/migrations к облачной БД (SUPABASE_DB_URL из .env.local)
set -e
set -a; . ./.env.local; set +a
exec npx supabase db push --remote="$SUPABASE_DB_URL" --include-all --yes "$@"
