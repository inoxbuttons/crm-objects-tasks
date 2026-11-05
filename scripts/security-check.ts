// «Атаки» в обход интерфейса: прямые запросы к Supabase с publishable key
// (тем же, что во фронтенде). Каждая проверка ожидает ОТКАЗ.
// Ни одна успешная проверка не меняет данные. Код выхода ≠ 0 при любом FAIL.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types.ts';
import { USERS, env, type UserKey } from './users.ts';

type Client = SupabaseClient<Database>;
type Res = { data: unknown; error: { message: string } | null };

const url = env('VITE_SUPABASE_URL');
const key = env('VITE_SUPABASE_PUBLISHABLE_KEY');
if (!key.startsWith('sb_publishable_')) throw new Error('security-check должен работать с publishable key');

const newClient = () => createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const sessions = new Map<UserKey, { c: Client; id: string }>();
async function as(k: UserKey) {
  const cached = sessions.get(k);
  if (cached) return cached;
  const c = newClient();
  const { data, error } = await c.auth.signInWithPassword(USERS[k]);
  if (error) throw new Error(`Вход ${USERS[k].email}: ${error.message}`);
  const s = { c, id: data.user.id };
  sessions.set(k, s);
  return s;
}

const results: Array<{ n: number; name: string; ok: boolean; info: string }> = [];
async function check(name: string, fn: () => Promise<[boolean, string]>) {
  let ok = false;
  let info = '';
  try {
    [ok, info] = await fn();
  } catch (e) {
    info = `исключение: ${(e as Error).message}`;
  }
  results.push({ n: results.length + 1, name, ok, info });
}

const empty = (d: unknown) => d == null || (Array.isArray(d) && d.length === 0);
/** отказ = ошибка или ни одной затронутой/прочитанной строки */
const denied = (r: Res): [boolean, string] =>
  r.error ? [true, r.error.message] : empty(r.data) ? [true, '0 строк'] : [false, `вернулись данные: ${JSON.stringify(r.data).slice(0, 80)}`];
/** отказ именно с этим текстом */
const deniedWith = (r: Res, text: string): [boolean, string] =>
  r.error ? [r.error.message.includes(text), r.error.message] : [false, 'запрос прошёл'];

// ---------- подготовка: id задач и объектов (смотрим как постановщик) ----------
const mgr = await as('manager');
const ex1 = await as('executor1');
const ex2 = await as('executor2');

const { data: tasksData, error: tErr } = await mgr.c.from('tasks').select('*');
if (tErr || !tasksData) throw tErr;
const allTasks = tasksData;
const { data: allObjects } = await mgr.c.from('objects').select('*');
const task = (pred: (t: (typeof allTasks)[number]) => boolean, what: string) => {
  const t = allTasks.find(pred);
  if (!t) throw new Error(`В БД нет задачи: ${what}. Запустите npm run seed`);
  return t;
};
const ex1New = task((t) => t.assignee_id === ex1.id && t.status === 'new', 'новая у исполнителя-1');
const ex1Any = task((t) => t.assignee_id === ex1.id, 'любая у исполнителя-1');
const ex2Review = task((t) => t.assignee_id === ex2.id && t.status === 'review', 'на проверке у исполнителя-2');
const ex2InWork = task((t) => t.assignee_id === ex2.id && t.status === 'in_progress', 'в работе у исполнителя-2');
const accepted = task((t) => t.status === 'accepted', 'принятая');
const objNoEx2 = allObjects?.find((o) => !allTasks.some((t) => t.object_id === o.id && t.assignee_id === ex2.id));
const objWithTasks = allObjects?.find((o) => allTasks.some((t) => t.object_id === o.id));
if (!objNoEx2 || !objWithTasks) throw new Error('Не хватает объектов. Запустите npm run seed');

const historyCount = async () =>
  (await mgr.c.from('task_status_history').select('id', { count: 'exact', head: true })).count;
const historyBefore = await historyCount();

// ---------- проверки ----------
await check('Открытая регистрация (signUp) отключена', async () => {
  // публичные настройки Auth проекта
  const settings = (await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json()) as {
    disable_signup?: boolean;
  };
  if (settings.disable_signup !== true) {
    return [false, 'регистрация включена: Auth → Sign In / Providers → выключить «Allow new users to sign up»'];
  }
  const r = await newClient().auth.signUp({ email: `check${Date.now()}@example.com`, password: 'Hacker-12345!' });
  return r.error ? [true, r.error.message] : [false, 'signUp прошёл'];
});

await check('Анонимный вход отключён', async () => {
  const r = await newClient().auth.signInAnonymously();
  return r.error ? [true, r.error.message] : [false, 'анонимный вход прошёл'];
});

await check('Исполнитель-1 читает чужую задачу по id', async () =>
  denied(await ex1.c.from('tasks').select('*').eq('id', ex2Review.id)));

await check('Исполнитель-1 читает историю чужой задачи', async () =>
  denied(await ex1.c.from('task_status_history').select('*').eq('task_id', ex2Review.id)));

await check('Исполнитель-2 читает объект, где у него нет задач', async () =>
  denied(await ex2.c.from('objects').select('*').eq('id', objNoEx2.id)));

await check('Исполнитель видит только свои задачи (список)', async () => {
  const { data, error } = await ex1.c.from('tasks').select('assignee_id');
  if (error) return [false, error.message];
  const foreign = data.filter((t) => t.assignee_id !== ex1.id).length;
  return [foreign === 0 && data.length > 0, `своих ${data.length}, чужих ${foreign}`];
});

await check('Исполнитель тянет чужие задачи через вложенный запрос objects→tasks', async () => {
  const { data, error } = await ex1.c.from('objects').select('id, tasks(assignee_id)');
  if (error) return [true, error.message];
  const foreign = data.flatMap((o) => o.tasks).filter((t) => t.assignee_id !== ex1.id).length;
  return [foreign === 0, `объектов ${data.length}, чужих задач во вложении ${foreign}`];
});

await check('Исполнитель видит историю только своих задач (список)', async () => {
  const [{ data: h, error }, { data: own }] = await Promise.all([
    ex1.c.from('task_status_history').select('task_id'),
    ex1.c.from('tasks').select('id'),
  ]);
  if (error || !h || !own) return [false, error?.message ?? 'нет данных'];
  const ids = new Set(own.map((t) => t.id));
  const foreign = h.filter((r) => !ids.has(r.task_id)).length;
  return [foreign === 0, `записей ${h.length}, чужих ${foreign}`];
});

await check('Служебные функции схемы private недоступны через API', async () =>
  denied(await ex1.c.rpc('is_manager' as never)));

await check('Исполнитель меняет статус прямым UPDATE', async () =>
  denied(await ex1.c.from('tasks').update({ status: 'accepted' } as never).eq('id', ex1Any.id).select()));

await check('Постановщик меняет статус прямым UPDATE', async () =>
  denied(await mgr.c.from('tasks').update({ status: 'accepted' } as never).eq('id', ex2Review.id).select()));

await check('Исполнитель меняет название своей задачи', async () =>
  denied(await ex1.c.from('tasks').update({ title: 'взлом' }).eq('id', ex1Any.id).select()));

await check('Исполнитель принимает свою задачу через RPC', async () =>
  deniedWith(await ex2.c.rpc('change_task_status', { p_task_id: ex2Review.id, p_to: 'accepted' }), 'Недостаточно прав'));

await check('Исполнитель-2 двигает задачу исполнителя-1 через RPC', async () =>
  deniedWith(await ex2.c.rpc('change_task_status', { p_task_id: ex1New.id, p_to: 'in_progress' }), 'Задача не найдена'));

await check('Постановщик берёт задачу в работу за исполнителя', async () =>
  deniedWith(await mgr.c.rpc('change_task_status', { p_task_id: ex1New.id, p_to: 'in_progress' }), 'Только назначенный исполнитель'));

await check('Запрещённый переход new → accepted', async () =>
  deniedWith(await mgr.c.rpc('change_task_status', { p_task_id: ex1New.id, p_to: 'accepted' }), 'Переход запрещён'));

await check('Исполнитель перескакивает in_progress → accepted', async () =>
  deniedWith(await ex2.c.rpc('change_task_status', { p_task_id: ex2InWork.id, p_to: 'accepted' }), 'Переход запрещён'));

await check('На доработку без комментария', async () =>
  deniedWith(await mgr.c.rpc('change_task_status', { p_task_id: ex2Review.id, p_to: 'rework', p_comment: '   ' }), 'Комментарий обязателен'));

for (const [who, s] of [['исполнитель', ex1], ['постановщик', mgr]] as const) {
  await check(`История: INSERT (${who})`, async () =>
    denied(await s.c.from('task_status_history').insert({ task_id: ex1Any.id, to_status: 'accepted', changed_by: s.id } as never).select()));
  await check(`История: UPDATE (${who})`, async () =>
    denied(await s.c.from('task_status_history').update({ comment: 'подделка' } as never).eq('task_id', ex1Any.id).select()));
  await check(`История: DELETE (${who})`, async () =>
    denied(await s.c.from('task_status_history').delete().eq('task_id', ex1Any.id).select()));
}
await check('История не изменилась после попыток', async () => {
  const after = await historyCount();
  return [after === historyBefore, `до ${historyBefore}, после ${after}`];
});

await check('Исполнитель меняет себе роль в profiles', async () =>
  denied(await ex1.c.from('profiles').update({ role: 'manager' } as never).eq('id', ex1.id).select()));

await check('Исполнитель пишет role в user_metadata — роль не меняется', async () => {
  const c = newClient();
  await c.auth.signInWithPassword(USERS.executor2);
  await c.auth.updateUser({ data: { role: 'manager' } });
  const r = await c.from('objects').insert({ name: 'взлом', address: 'взлом' }).select();
  const { data: p } = await c.from('profiles').select('role').eq('id', ex2.id).single();
  await c.auth.updateUser({ data: { role: null } });
  return [!!r.error && p?.role === 'executor', `роль в profiles: ${p?.role}; insert: ${r.error?.message ?? 'прошёл!'}`];
});

await check('Исполнитель создаёт объект', async () =>
  denied(await ex1.c.from('objects').insert({ name: 'взлом', address: 'взлом' }).select()));

await check('Исполнитель создаёт задачу', async () =>
  denied(await ex1.c.from('tasks').insert({ title: 'взлом', object_id: objWithTasks.id, assignee_id: ex1.id }).select()));

await check('Исполнитель удаляет свою задачу', async () =>
  denied(await ex1.c.from('tasks').delete().eq('id', ex1New.id).select()));

await check('Постановщик меняет author_id задачи', async () =>
  denied(await mgr.c.from('tasks').update({ author_id: ex1.id } as never).eq('id', ex1New.id).select()));

await check('Постановщик меняет created_at задачи', async () =>
  denied(await mgr.c.from('tasks').update({ created_at: '2000-01-01T00:00:00Z' } as never).eq('id', ex1New.id).select()));

await check('Постановщик редактирует принятую задачу', async () =>
  denied(await mgr.c.from('tasks').update({ title: 'правка' }).eq('id', accepted.id).select()));

await check('Постановщик удаляет задачу прямым DELETE (история ушла бы каскадом)', async () =>
  denied(await mgr.c.from('tasks').delete().eq('id', ex1New.id).select()));

await check('Постановщик удаляет задачу не в статусе «Новая» (RPC)', async () =>
  deniedWith(await mgr.c.rpc('delete_task', { p_task_id: accepted.id }), 'только задачу в статусе «Новая»'));

await check('Исполнитель удаляет свою задачу через RPC', async () =>
  deniedWith(await ex1.c.rpc('delete_task', { p_task_id: ex1New.id }), 'Недостаточно прав'));

await check('Постановщик назначает исполнителем постановщика', async () =>
  denied(await mgr.c.from('tasks').update({ assignee_id: mgr.id }).eq('id', ex1New.id).select()));

await check('Постановщик удаляет объект прямым DELETE', async () =>
  denied(await mgr.c.from('objects').delete().eq('id', objWithTasks.id).select()));

await check('Постановщик удаляет объект с задачами (RPC)', async () =>
  deniedWith(await mgr.c.rpc('delete_object', { p_object_id: objWithTasks.id }), 'есть задачи'));

await check('Исполнитель удаляет объект через RPC', async () =>
  deniedWith(await ex1.c.rpc('delete_object', { p_object_id: objNoEx2.id }), 'Недостаточно прав'));

const anon = newClient();
for (const table of ['profiles', 'objects', 'tasks', 'task_status_history', 'status_transitions'] as const) {
  await check(`Без входа (anon): чтение ${table}`, async () => denied(await anon.from(table).select('*')));
}
await check('Без входа (anon): RPC change_task_status', async () =>
  denied(await anon.rpc('change_task_status', { p_task_id: ex1New.id, p_to: 'in_progress' })));
await check('Без входа (anon): RPC delete_task', async () =>
  denied(await anon.rpc('delete_task', { p_task_id: ex1New.id })));

// ---------- вывод ----------
const w = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${String(r.n).padStart(2)}. ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(w)}  ${r.info}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\nИтого: ${results.length - failed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
