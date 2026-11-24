import {isDeepStrictEqual} from 'node:util';
import {readFile, writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findAvailableScan, findAvailableMasks} from './slot-search.mjs';

const MENU = [
  '',
  '1. Загрузить расписание из JSON',
  '2. Ввести расписание вручную',
  '3. Выбрать алгоритм',
  '4. Найти свободное время',
  '5. Сохранить результат в JSON',
  '6. Справка',
  '0. Выход',
].join('\n');

const HELP = [
  'Загрузите расписание или введите его вручную, затем запустите поиск.',
  'В примерах examples/input указано фиксированное время для воспроизводимого поиска.',
  'Коды видов спорта: badminton, table-tennis, volleyball, basketball, football, tennis.',
  'Выберите прямую проверку, битовые маски или сравнение обоих алгоритмов.',
  'Если желаемое начало занято, выводятся до трёх ближайших начал той же даты.',
  'При равном отклонении раньше показывается более раннее время.',
  'Для сохранения укажите путь к новому файлу.',
].join('\n');

function minutes(value, allowMidnight = false) {
  if (allowMidnight && value === '24:00') return 1440;
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value)) {
    throw new TypeError('Введите время в формате ЧЧ:ММ с шагом 30 минут.');
  }
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function nearestSlots(slots, target) {
  const byTime = new Map();
  for (const slot of slots) {
    const offsetMinutes = minutes(slot.start) - target;
    if (!byTime.has(offsetMinutes)) byTime.set(offsetMinutes, []);
    byTime.get(offsetMinutes).push({...slot, offsetMinutes});
  }
  const offsets = [...byTime.keys()].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  return offsets.slice(0, 3).flatMap(offset => byTime.get(offset));
}

export function search(input, algorithm = 'both', preferredStart = input?.preferredStart ?? null) {
  if (!['scan', 'masks', 'both'].includes(algorithm)) throw new TypeError('Выберите алгоритм.');
  const target = preferredStart === null ? null : minutes(preferredStart);
  const slots = algorithm === 'masks' ? findAvailableMasks(input) : findAvailableScan(input);
  const algorithmsAgree = algorithm === 'both'
    ? isDeepStrictEqual(slots, findAvailableMasks(input))
    : null;
  if (algorithmsAgree === false) throw new Error('Алгоритмы вернули разные результаты.');

  const matches = target === null ? slots : slots.filter(slot => slot.start === preferredStart);
  return {
    now: input.now,
    request: {...input.request},
    algorithm,
    algorithmsAgree,
    preferredStart,
    slots,
    matches,
    alternatives: target !== null && matches.length === 0 ? nearestSlots(slots, target) : [],
  };
}

export async function loadSchedule(path) {
  const content = await readFile(path, 'utf8');
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch {
    throw new SyntaxError('Некорректный JSON. Проверьте синтаксис файла.');
  }
}

export function saveResult(path, result) {
  return writeFile(path, JSON.stringify(result, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
}

function printResult(result, write) {
  if (result.algorithmsAgree) write('Результаты алгоритмов совпали.');
  if (result.preferredStart && !result.matches.length) {
    write(`На ${result.preferredStart} свободных площадок нет.`);
  }
  if (result.alternatives.length) write('Ближайшие варианты на эту дату:');
  if (!result.slots.length) write('В этот день подходящих интервалов нет.');
  for (const slot of result.matches.length ? result.matches : result.alternatives) {
    write(`Площадка №${slot.courtId} · ${slot.start}–${slot.end}`);
  }
}

const END_OF_INPUT = Symbol('End of input');

async function readManual(ask) {
  const now = await ask('Текущее время ISO с поясом (Enter — системное): ') || new Date().toISOString();
  const date = await ask('Дата игры (ГГГГ-ММ-ДД): ');
  const sportId = await ask('Код вида спорта (например badminton): ');
  const duration = Number(await ask('Длительность в минутах: '));
  const opening = await ask('Открытие (ЧЧ:ММ или «закрыто»): ');
  const openingHours = opening === 'закрыто' ? null : {
    opensAt: minutes(opening), closesAt: minutes(await ask('Закрытие (ЧЧ:ММ): '), true),
  };
  const preferredStart = await ask('Желаемое начало (ЧЧ:ММ или Enter): ') || null;
  const courts = [];
  while (true) {
    const line = await ask('Площадка (номер:спорт,спорт или Enter для завершения): ');
    if (!line) break;
    const match = /^(\d+)\s*:\s*(.+)$/.exec(line);
    if (!match) throw new TypeError('Введите площадку в формате 1:badminton,tennis.');
    courts.push({id: Number(match[1]), sports: match[2].split(',').map(sport => sport.trim())});
  }
  const array = async label => JSON.parse(await ask(`${label} (массив JSON или Enter): `) || '[]');
  const bookings = await array('Брони, см. examples/input/02-occupied.json');
  const blocks = await array('Блокировки, поля courtId, date, startMinute, endMinute, status');
  const adjacency = await array('Смежность, см. examples/input/03-shared-halls.json');
  return {now, request: {sportId, date, duration}, openingHours, preferredStart, courts, bookings, blocks, adjacency};
}

export async function runMenu(input = process.stdin, output = process.stdout) {
  const reader = createInterface({input, output, terminal: Boolean(input.isTTY && output.isTTY), crlfDelay: Infinity});
  const lines = reader[Symbol.asyncIterator]();
  const write = message => output.write(message + '\n');
  const ask = async prompt => {
    output.write(prompt);
    const line = await lines.next();
    if (line.done) throw END_OF_INPUT;
    return line.value.trim();
  };
  let schedule;
  let result;
  let algorithm = 'both';
  write('«Играем?» · Подбор спортивных площадок');
  try {
    while (true) {
      write(MENU);
      try {
        const choice = await ask('Пункт меню: ');
        switch (choice) {
          case '0': return;
          case '1':
          case '2': {
            const next = choice === '1'
              ? await loadSchedule(await ask('Путь к JSON: '))
              : await readManual(ask);
            // Verify the input before replacing the current session.
            search(next, 'masks');
            schedule = next;
            result = undefined;
            write(`Расписание загружено. Дата игры — ${schedule.request.date}. Время отсчёта — ${schedule.now}.`);
            break;
          }
          case '3': {
            const selected = await ask('Алгоритм (1 — интервалы, 2 — маски, 3 — оба): ');
            const next = new Map([['1', 'scan'], ['2', 'masks'], ['3', 'both']]).get(selected);
            if (!next) throw new TypeError('Выберите 1, 2 или 3.');
            algorithm = next;
            result = undefined;
            write('Алгоритм выбран.');
            break;
          }
          case '4':
            if (!schedule) throw new Error('Сначала загрузите или введите расписание.');
            result = search(schedule, algorithm);
            printResult(result, write);
            break;
          case '5':
            if (!result) throw new Error('Сначала выполните поиск.');
            await saveResult(await ask('Путь к новому JSON: '), result);
            write('Результат сохранён.');
            break;
          case '6': write(HELP); break;
          default: write('Выберите пункт из меню.');
        }
      } catch (error) {
        if (error === END_OF_INPUT) return;
        write(`Ошибка: ${error.code === 'EEXIST' ? 'файл уже существует. Укажите новое имя.' : error.message}`);
      }
    }
  } finally {
    reader.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runMenu();
}
