import * as XLSX from 'xlsx';
import type { Transaction, SheetType, ArticleDDS, CounterpartyRef, ParsedSheet, DataSource, SheetProfile } from '@/types';
// ParsedSheet now includes sourceId, sourceName, selected

let globalId = 0;
function nextId(): string {
  return `tx_${++globalId}_${Date.now()}`;
}

// ========== Определение типа листа ==========

function detectSheetTypeByName(sheetName: string): SheetType | null {
  const lower = sheetName.toLowerCase().trim();

  // Справочник
  if (
    lower.includes('справочник') ||
    lower.includes('статьи') ||
    lower.includes('статья ддс') ||
    lower === 'ддс' ||
    lower === 'ref' ||
    lower.includes('reference')
  ) {
    return 'reference';
  }

  // Журнал кассы — обычно содержит название точки
  if (
    lower.includes('журнал') ||
    lower.includes('касса') ||
    lower.includes('моби') ||
    lower.includes('леонов') ||
    lower.includes('мира') ||
    lower.includes('дик') ||
    lower.includes('точк')
  ) {
    return 'cash_journal';
  }

  // Расчётный счёт
  if (
    lower.includes('р/с') ||
    lower.includes('р\\с') ||
    lower.includes('расч') ||
    lower.includes('рс ') ||
    lower.startsWith('рс') ||
    lower.includes('банк') ||
    lower.includes('счет') ||
    lower.includes('счёт') ||
    lower.includes('bank')
  ) {
    return 'bank_journal';
  }

  return null;
}

function detectSheetTypeByHeaders(headers: string[]): SheetType {
  const joined = headers.map(h => (h || '').toLowerCase().trim().replace(/\n/g, ' ')).join('|');

  // Справочник статей
  if (joined.includes('статья ддс') && joined.includes('группа')) {
    return 'reference';
  }
  if (joined.includes('справочник контрагентов')) {
    return 'reference';
  }

  // Журнал по точке (касса) — гибкое определение
  if (
    joined.includes('дата оплаты') ||
    joined.includes('кошелек') ||
    joined.includes('кошелёк') ||
    (joined.includes('филиал') && joined.includes('статья дохода')) ||
    (joined.includes('контрагент') && joined.includes('статья дохода')) ||
    (joined.includes('сумма в рублях') && joined.includes('контрагент'))
  ) {
    return 'cash_journal';
  }

  // Журнал по р/с — гибкое определение
  if (
    (joined.includes('период') && joined.includes('аналитика')) ||
    (joined.includes('аналитика дт') || joined.includes('аналитика кт')) ||
    (joined.includes('сумма для ддс') && joined.includes('статья')) ||
    (joined.includes('документ') && joined.includes('дебет') && joined.includes('кредит'))
  ) {
    return 'bank_journal';
  }

  // Дополнительные эвристики
  if (joined.includes('статья дохода') || joined.includes('статья расхода')) {
    return 'cash_journal';
  }

  return 'unknown';
}

function detectSheetType(sheetName: string, headers: string[]): SheetType {
  // Сначала пробуем по названию
  const byName = detectSheetTypeByName(sheetName);
  if (byName) return byName;

  // Затем по заголовкам
  return detectSheetTypeByHeaders(headers);
}


function getColumnLetter(colIndex: number): string {
  let n = colIndex + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function buildSheetProfile(data: unknown[][], headerRowIndex: number): SheetProfile {
  const headers = (data[headerRowIndex] || []).map((h, idx) => {
    const title = String(h || '').trim();
    return title || `Колонка ${getColumnLetter(idx)}`;
  });

  const uniqueHeaders = headers.map((h, idx) => (headers.indexOf(h) === idx ? h : `${h} (${getColumnLetter(idx)})`));

  const valuesByColumn: Record<string, string[]> = {};
  uniqueHeaders.forEach((h) => {
    valuesByColumn[h] = [];
  });

  for (let r = headerRowIndex + 1; r < data.length; r++) {
    const row = data[r] || [];
    uniqueHeaders.forEach((header, c) => {
      const value = String(row[c] ?? '').trim();
      if (!value) return;
      const bucket = valuesByColumn[header];
      if (!bucket.includes(value)) {
        bucket.push(value);
      }
    });
  }

  uniqueHeaders.forEach((header) => {
    valuesByColumn[header] = valuesByColumn[header].slice(0, 300);
  });

  return {
    sheetName: '',
    columns: uniqueHeaders,
    valuesByColumn,
  };
}

// ========== Нахождение строки заголовков ==========

function findHeaderRow(data: unknown[][], maxRows: number = 10): { headerRowIndex: number; headers: string[] } {
  // Ищем строку, которая больше всего похожа на заголовки
  // Заголовки обычно содержат текстовые значения, не числа
  const keywords = [
    'дата', 'сумма', 'статья', 'контрагент', 'период', 'документ',
    'аналитика', 'кошелек', 'кошелёк', 'филиал', 'примечание',
    'кредит', 'дебет', 'сальдо', 'группа', 'справочник',
    'статья ддс', 'вид деятельности', 'назначение', 'поступлен'
  ];

  let bestRow = 0;
  let bestScore = 0;

  for (let i = 0; i < Math.min(data.length, maxRows); i++) {
    const row = data[i] || [];
    let score = 0;
    for (const cell of row) {
      const cellStr = String(cell || '').toLowerCase().trim().replace(/\n/g, ' ');
      if (!cellStr) continue;
      for (const kw of keywords) {
        if (cellStr.includes(kw)) {
          score += 2;
          break;
        }
      }
      // Текстовое значение (не число) тоже немного добавляет к скору
      if (isNaN(Number(cell)) && cellStr.length > 1) {
        score += 0.5;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  const headers = (data[bestRow] || []).map(h => String(h || ''));
  return { headerRowIndex: bestRow, headers };
}

// ========== Парсинг даты ==========

function parseDate(value: unknown): Date | null {
  if (!value) return null;

  // Если xlsx вернул число (серийный номер Excel)
  if (typeof value === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(value);
      return new Date(d.y, d.m - 1, d.d);
    } catch {
      return null;
    }
  }

  const str = String(value).trim();
  if (!str) return null;

  // ДД.ММ.ГГГГ
  const match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // ДД.ММ.ГГ
  const matchShort = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (matchShort) {
    const day = parseInt(matchShort[1], 10);
    const month = parseInt(matchShort[2], 10) - 1;
    let year = parseInt(matchShort[3], 10);
    year += year < 50 ? 2000 : 1900;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // ГГГГ-ММ-ДД
  const match2 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match2) {
    const d = new Date(parseInt(match2[1], 10), parseInt(match2[2], 10) - 1, parseInt(match2[3], 10));
    if (!isNaN(d.getTime())) return d;
  }

  // ДД/ММ/ГГГГ
  const match3 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match3) {
    const d = new Date(parseInt(match3[3], 10), parseInt(match3[2], 10) - 1, parseInt(match3[1], 10));
    if (!isNaN(d.getTime())) return d;
  }

  // Попытка стандартного парсинга
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null;
}

// ========== Парсинг суммы ==========

function parseAmount(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return Math.abs(value);

  const str = String(value)
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.\-]/g, '');

  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.abs(num);
}

// ========== Нормализация заголовков ==========

function normalizeHeader(h: string): string {
  return (h || '').toLowerCase().trim()
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');
}

function findColumnIndex(headers: string[], ...keywords: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    const idx = normalized.findIndex(h => h.includes(kwLower));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ========== Парсинг справочника ==========

function parseReferenceSheet(data: unknown[][], headerRowIndex: number): { articles: ArticleDDS[]; counterparties: CounterpartyRef[] } {
  const articles: ArticleDDS[] = [];
  const counterparties: CounterpartyRef[] = [];

  if (data.length <= headerRowIndex) return { articles, counterparties };

  const headers = (data[headerRowIndex] || []).map(h => normalizeHeader(String(h || '')));

  // Найти столбцы статей
  const articleCol = headers.findIndex(h => h.includes('статья ддс'));
  const groupCol = headers.findIndex(h => h.includes('группа'));
  const activityCol = headers.findIndex(h => h.includes('вид деятельности'));
  const commentCol = headers.findIndex(h => h.includes('комментарий'));

  // Найти столбец контрагентов (может быть правее)
  const counterpartyCol = headers.findIndex(h => h.includes('справочник контрагентов'));

  // Если столбец контрагентов не найден — ищем по всем столбцам
  let cpColFallback = -1;
  if (counterpartyCol === -1) {
    for (let c = 0; c < headers.length; c++) {
      if (headers[c].includes('контрагент')) {
        cpColFallback = c;
        break;
      }
    }
  }
  const cpCol = counterpartyCol !== -1 ? counterpartyCol : cpColFallback;

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i] || [];

    // Статьи
    if (articleCol !== -1) {
      const name = String(row[articleCol] || '').trim();
      if (name) {
        articles.push({
          name,
          group: String(row[groupCol] !== undefined ? (row[groupCol] || '') : '').trim(),
          activityType: String(row[activityCol] !== undefined ? (row[activityCol] || '') : '').trim(),
          comment: String(row[commentCol] !== undefined ? (row[commentCol] || '') : '').trim(),
        });
      }
    }

    // Контрагенты
    if (cpCol !== -1) {
      const cName = String(row[cpCol] || '').trim();
      if (cName && !cName.toLowerCase().includes('справочник')) {
        counterparties.push({ name: cName });
      }
    }
  }

  return { articles, counterparties };
}

// ========== Парсинг журнала кассы (тип А) ==========

function parseCashJournal(data: unknown[][], sheetName: string, sourceName: string, articlesRef: ArticleDDS[], headerRowIndex: number): Transaction[] {
  if (data.length < headerRowIndex + 2) return [];

  const headers = (data[headerRowIndex] || []).map(h => String(h || ''));

  const dateCol = findColumnIndex(headers, 'дата оплаты', 'дата поступления', 'дата');
  const walletCol = findColumnIndex(headers, 'кошелек', 'кошелёк');
  const amountCol = findColumnIndex(headers, 'сумма в рублях', 'сумма');
  const noteCol = findColumnIndex(headers, 'примечание', 'назначение');
  const branchCol = findColumnIndex(headers, 'филиал');
  const counterpartyCol = findColumnIndex(headers, 'контрагент');
  const articleCol = findColumnIndex(headers, 'статья дохода', 'статья расхода', 'статья');
  const accrualCol = findColumnIndex(headers, 'месяц начисления');

  const transactions: Transaction[] = [];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i] || [];

    const date = parseDate(dateCol !== -1 ? row[dateCol] : null);
    const amount = parseAmount(amountCol !== -1 ? row[amountCol] : 0);
    const article = String(articleCol !== -1 ? (row[articleCol] || '') : '').trim();

    // Пропускаем пустые строки
    if (!date && !amount && !article) continue;
    if (amount === 0) continue;

    // Определяем направление по справочнику статей
    const direction = getDirection(article, articlesRef);

    transactions.push({
      id: nextId(),
      date: date || new Date(0),
      source: sourceName,
      sheet: sheetName,
      sheetType: 'cash_journal',
      wallet: String(walletCol !== -1 ? (row[walletCol] || '') : '').trim(),
      amount,
      direction,
      note: String(noteCol !== -1 ? (row[noteCol] || '') : '').trim(),
      branch: String(branchCol !== -1 ? (row[branchCol] || '') : '').trim(),
      counterparty: String(counterpartyCol !== -1 ? (row[counterpartyCol] || '') : '').trim(),
      article,
      accrualMonth: String(accrualCol !== -1 ? (row[accrualCol] || '') : '').trim(),
      document: '',
    });
  }

  return transactions;
}

// ========== Парсинг журнала р/с (тип Б) ==========

function parseBankJournal(data: unknown[][], sheetName: string, sourceName: string, articlesRef: ArticleDDS[], headerRowIndex: number): Transaction[] {
  if (data.length < headerRowIndex + 2) return [];

  const headers = (data[headerRowIndex] || []).map(h => String(h || ''));

  const dateCol = findColumnIndex(headers, 'период', 'дата');
  const docCol = findColumnIndex(headers, 'документ');
  const dtCol = findColumnIndex(headers, 'аналитика дт');
  const ktCol = findColumnIndex(headers, 'аналитика кт');
  const amountCol = findColumnIndex(headers, 'сумма для ддс', 'сумма ддс', 'сумма');
  const articleCol = findColumnIndex(headers, 'статья');
  const accrualCol = findColumnIndex(headers, 'месяц начисления');

  const transactions: Transaction[] = [];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i] || [];

    const date = parseDate(dateCol !== -1 ? row[dateCol] : null);
    const amount = parseAmount(amountCol !== -1 ? row[amountCol] : 0);
    const article = String(articleCol !== -1 ? (row[articleCol] || '') : '').trim();

    if (!date && !amount && !article) continue;
    if (amount === 0) continue;

    const direction = getDirection(article, articlesRef);

    // Контрагент: расход — Аналитика Дт, приход — Аналитика Кт
    const counterparty = direction === 'out'
      ? String(dtCol !== -1 ? (row[dtCol] || '') : '').trim()
      : String(ktCol !== -1 ? (row[ktCol] || '') : '').trim();

    transactions.push({
      id: nextId(),
      date: date || new Date(0),
      source: sourceName,
      sheet: sheetName,
      sheetType: 'bank_journal',
      wallet: '',
      amount,
      direction,
      note: '',
      branch: '',
      counterparty,
      article,
      accrualMonth: String(accrualCol !== -1 ? (row[accrualCol] || '') : '').trim(),
      document: String(docCol !== -1 ? (row[docCol] || '') : '').trim(),
    });
  }

  return transactions;
}

// ========== Определение направления ==========

function getDirection(article: string, articlesRef: ArticleDDS[]): 'in' | 'out' {
  if (!article) return 'out';

  const found = articlesRef.find(a =>
    a.name.toLowerCase().trim() === article.toLowerCase().trim()
  );

  if (found) {
    const group = found.group.toLowerCase();
    if (group.includes('поступление')) return 'in';
    if (group.includes('выбытие')) return 'out';
  }

  // Эвристика по названию
  const lower = article.toLowerCase();
  if (lower.includes('поступлени') || lower.includes('доход') || lower.includes('вклад') || lower.includes('получени')) return 'in';
  return 'out';
}


function getVisibleSheetNames(workbook: XLSX.WorkBook): string[] {
  const all = workbook.SheetNames || [];
  const sheetMeta = workbook.Workbook?.Sheets;
  if (!sheetMeta || !Array.isArray(sheetMeta) || sheetMeta.length === 0) {
    return all;
  }

  const visible = all.filter((name, idx) => {
    const hidden = sheetMeta[idx]?.Hidden;
    return hidden === undefined || hidden === 0;
  });

  return visible.length > 0 ? visible : all;
}

// ========== Главная функция парсинга файла ==========

export function parseWorkbook(workbook: XLSX.WorkBook, sourceName: string): Omit<DataSource, 'id' | 'type' | 'url' | 'status' | 'error'> {
  const sheets: ParsedSheet[] = [];
  const sheetProfiles: SheetProfile[] = [];
  let articles: ArticleDDS[] = [];
  let counterparties: CounterpartyRef[] = [];
  const allTransactions: Transaction[] = [];

  const mkSheet = (name: string, type: SheetType, rowCount: number): ParsedSheet => ({
    name,
    type,
    rowCount,
    sourceId: '',      // будет заполнено после создания источника
    sourceName: sourceName,
    selected: type !== 'reference' && type !== 'unknown', // по умолчанию журналы выбраны
  });

  const visibleSheetNames = getVisibleSheetNames(workbook);

  // Первый проход: найти справочник
  for (const sheetName of visibleSheetNames) {
    const ws = workbook.Sheets[sheetName];
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length === 0) continue;

    const { headerRowIndex, headers } = findHeaderRow(data);
    const type = detectSheetType(sheetName, headers);
    const profile = buildSheetProfile(data, headerRowIndex);
    profile.sheetName = sheetName;
    sheetProfiles.push(profile);

    if (type === 'reference') {
      const ref = parseReferenceSheet(data, headerRowIndex);
      articles = ref.articles;
      counterparties = ref.counterparties;
      sheets.push(mkSheet(sheetName, 'reference', data.length - headerRowIndex - 1));
    }
  }

  // Второй проход: парсить журналы
  for (const sheetName of visibleSheetNames) {
    const ws = workbook.Sheets[sheetName];
    const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length === 0) continue;

    const { headerRowIndex, headers } = findHeaderRow(data);
    const type = detectSheetType(sheetName, headers);

    if (type === 'cash_journal') {
      const txs = parseCashJournal(data, sheetName, sourceName, articles, headerRowIndex);
      allTransactions.push(...txs);
      sheets.push(mkSheet(sheetName, 'cash_journal', txs.length));
    } else if (type === 'bank_journal') {
      const txs = parseBankJournal(data, sheetName, sourceName, articles, headerRowIndex);
      allTransactions.push(...txs);
      sheets.push(mkSheet(sheetName, 'bank_journal', txs.length));
    } else if (type !== 'reference') {
      // Не удалось определить — попробуем как кассу, если есть дата и сумма
      const fallbackTxs = tryParseFallback(data, sheetName, sourceName, articles, headerRowIndex);
      if (fallbackTxs.length > 0) {
        allTransactions.push(...fallbackTxs);
        sheets.push(mkSheet(sheetName, 'cash_journal', fallbackTxs.length));
      } else {
        sheets.push(mkSheet(sheetName, 'unknown', 0));
      }
    }
  }

  return {
    name: sourceName,
    sheets,
    sheetProfiles,
    transactions: allTransactions,
    articles,
    counterparties,
  };
}

// ========== Fallback парсинг для неопознанных листов ==========

function tryParseFallback(data: unknown[][], sheetName: string, sourceName: string, articlesRef: ArticleDDS[], headerRowIndex: number): Transaction[] {
  if (data.length < headerRowIndex + 2) return [];

  const headers = (data[headerRowIndex] || []).map(h => String(h || ''));

  // Ищем хотя бы столбец с датой и суммой
  const dateCol = findColumnIndex(headers, 'дата', 'период', 'date');
  const amountCol = findColumnIndex(headers, 'сумма', 'amount', 'итого');
  const articleCol = findColumnIndex(headers, 'статья', 'назначение', 'категория');

  if (dateCol === -1 && amountCol === -1) return [];

  const counterpartyCol = findColumnIndex(headers, 'контрагент', 'получатель', 'плательщик');
  const noteCol = findColumnIndex(headers, 'примечание', 'комментарий', 'описание', 'назначение');

  const transactions: Transaction[] = [];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i] || [];
    const date = parseDate(dateCol !== -1 ? row[dateCol] : null);
    const amount = parseAmount(amountCol !== -1 ? row[amountCol] : 0);
    const article = String(articleCol !== -1 ? (row[articleCol] || '') : '').trim();

    if (!date && !amount) continue;
    if (amount === 0) continue;

    const direction = getDirection(article, articlesRef);

    transactions.push({
      id: nextId(),
      date: date || new Date(0),
      source: sourceName,
      sheet: sheetName,
      sheetType: 'cash_journal',
      wallet: '',
      amount,
      direction,
      note: String(noteCol !== -1 ? (row[noteCol] || '') : '').trim(),
      branch: '',
      counterparty: String(counterpartyCol !== -1 ? (row[counterpartyCol] || '') : '').trim(),
      article,
      accrualMonth: '',
      document: '',
    });
  }

  return transactions;
}

// ========== Загрузка файла ==========

export function parseExcelFile(file: File): Promise<Omit<DataSource, 'id' | 'type' | 'url' | 'status' | 'error'>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        resolve(parseWorkbook(workbook, file.name));
      } catch (err) {
        reject(new Error(`Ошибка парсинга файла: ${err instanceof Error ? err.message : String(err)}`));
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsArrayBuffer(file);
  });
}

// ========== Загрузка Google Sheets ==========

function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export async function parseGoogleSheet(url: string): Promise<Omit<DataSource, 'id' | 'type' | 'url' | 'status' | 'error'>> {
  const spreadsheetId = extractSpreadsheetId(url);
  if (!spreadsheetId) {
    throw new Error('Не удалось извлечь ID таблицы из ссылки. Убедитесь, что ссылка имеет формат: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/...');
  }

  // Загружаем как xlsx через export URL
  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;

  try {
    const response = await fetch(exportUrl);
    if (!response.ok) {
      throw new Error(`Не удалось загрузить таблицу (HTTP ${response.status}). Убедитесь, что таблица доступна по ссылке.`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array', cellDates: false });

    const name = `Google Sheet (${spreadsheetId.substring(0, 8)}...)`;
    return parseWorkbook(workbook, name);
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('Ошибка CORS. Попробуйте скачать файл как .xlsx и загрузить вручную.');
    }
    throw err;
  }
}
