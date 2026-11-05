// Заполняет БД тестовыми данными.
// Secret key используется ТОЛЬКО для создания пользователей (auth.admin).
// Объекты, задачи и смены статусов делаются от имени обычных пользователей
// через publishable key — те же правила, что и в интерфейсе, история честная.
//
// Идемпотентно: пользователи создаются, если их нет; данные — если в БД нет объектов.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types.ts';
import { USERS, env, type UserKey } from './users.ts';

type Status = Database['public']['Enums']['task_status'];

const url = env('VITE_SUPABASE_URL');
const publishableKey = env('VITE_SUPABASE_PUBLISHABLE_KEY');
const secretKey = env('SUPABASE_SECRET_KEY');

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(url, secretKey, noSession);

async function ensureUsers() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  for (const u of Object.values(USERS)) {
    const existing = data.users.find((x) => x.email === u.email);
    if (existing) {
      console.log(`  пользователь ${u.email} уже есть`);
      continue;
    }
    const { error: e } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      app_metadata: { role: u.role },
      user_metadata: { full_name: u.full_name },
    });
    if (e) throw e;
    console.log(`  создан ${u.email} (${u.role})`);
  }
}

const clients = new Map<UserKey, { client: SupabaseClient<Database>; id: string }>();
async function as(key: UserKey) {
  const cached = clients.get(key);
  if (cached) return cached;
  const client = createClient<Database>(url, publishableKey, noSession);
  const { data, error } = await client.auth.signInWithPassword(USERS[key]);
  if (error) throw new Error(`Вход ${USERS[key].email}: ${error.message}`);
  const entry = { client, id: data.user.id };
  clients.set(key, entry);
  return entry;
}

async function move(taskId: string, who: UserKey, to: Status, comment?: string) {
  const { client } = await as(who);
  const { error } = await client.rpc('change_task_status', { p_task_id: taskId, p_to: to, p_comment: comment });
  if (error) throw new Error(`Переход ${to} от ${who}: ${error.message}`);
}

// Маршруты статусов от «Новая»
const PATHS: Record<Status, Array<[UserKey | 'assignee', Status, string?]>> = {
  new: [],
  in_progress: [['assignee', 'in_progress']],
  review: [['assignee', 'in_progress'], ['assignee', 'review']],
  accepted: [['assignee', 'in_progress'], ['assignee', 'review'], ['manager', 'accepted']],
  rework: [
    ['assignee', 'in_progress'],
    ['assignee', 'review'],
    ['manager', 'rework', 'Окна установлены с перекосом на 3 этаже, переделать по уровню.'],
  ],
};

const DATA: Array<{
  name: string;
  address: string;
  tasks: Array<{ title: string; description: string; assignee: UserKey; status: Status; extra?: boolean }>;
}> = [
  {
    name: 'ЖК «Северный», корпус 2',
    address: 'г. Москва, ул. Ленина, д. 10',
    tasks: [
      { title: 'Залить фундамент секции 2', description: 'Бетон М350, прогрев в холодное время.', assignee: 'executor1', status: 'accepted' },
      { title: 'Монтаж опалубки 3 этажа', description: 'Опалубка перекрытий, проверить по уровню.', assignee: 'executor1', status: 'in_progress' },
      { title: 'Проверить армирование колонн', description: 'Сверить с проектом КЖ, лист 12.', assignee: 'executor2', status: 'review' },
    ],
  },
  {
    name: 'БЦ «Гранит»',
    address: 'г. Москва, пр. Мира, д. 25',
    tasks: [
      { title: 'Установка окон 3 этажа', description: 'Профиль ПВХ, 24 окна.', assignee: 'executor2', status: 'rework' },
      { title: 'Прокладка электрики в офисах', description: 'Кабель ВВГнг-LS, по проекту ЭОМ.', assignee: 'executor1', status: 'new' },
      { title: 'Утепление фасада', description: 'Минвата 150 мм, дюбели тарельчатые.', assignee: 'executor2', status: 'in_progress', extra: true },
    ],
  },
  {
    name: 'Склад «Логистик»',
    address: 'Московская обл., Промзона, стр. 7',
    tasks: [
      { title: 'Подготовить котлован', description: 'Глубина 2,5 м, вывоз грунта.', assignee: 'executor1', status: 'new' },
    ],
  },
];

async function seedData() {
  const { client: mgr } = await as('manager');
  const { count, error } = await mgr.from('objects').select('id', { count: 'exact', head: true });
  if (error) throw error;
  if ((count ?? 0) > 0) {
    console.log('  объекты уже есть — данные не добавляю');
    return;
  }

  for (const obj of DATA) {
    const { data: o, error: oe } = await mgr.from('objects').insert({ name: obj.name, address: obj.address }).select().single();
    if (oe) throw oe;
    console.log(`  объект: ${o.name}`);

    for (const t of obj.tasks) {
      const assignee = await as(t.assignee);
      const { data: task, error: te } = await mgr
        .from('tasks')
        .insert({ title: t.title, description: t.description, object_id: o.id, assignee_id: assignee.id })
        .select()
        .single();
      if (te) throw te;

      for (const [who, to, comment] of PATHS[t.status]) {
        await move(task.id, who === 'assignee' ? t.assignee : who, to, comment);
      }
      if (t.extra) {
        // полный круг: на проверку → на доработку → снова в работу
        await move(task.id, t.assignee, 'review');
        await move(task.id, 'manager2', 'rework', 'Не закреплены откосы, доделать.');
        await move(task.id, t.assignee, 'in_progress');
      }
      console.log(`    задача: ${t.title} → ${t.status}`);
    }
  }
}

console.log('Пользователи:');
await ensureUsers();
console.log('Данные:');
await seedData();
console.log('Готово.');
