// === Унифицированная запись операции ===
export interface Transaction {
  id: string;
  date: Date;
  source: string;       // имя файла
  sheet: string;        // имя листа (журнала)
  sheetType: SheetType;
  wallet: string;
  amount: number;       // всегда положительное
  direction: 'in' | 'out';
  note: string;
  branch: string;
  counterparty: string;
  article: string;
  accrualMonth: string;
  document: string;     // для р/с журналов
}

// === Тип листа ===
export type SheetType = 'cash_journal' | 'bank_journal' | 'reference' | 'unknown';

// === Статья ДДС ===
export interface ArticleDDS {
  name: string;
  group: string;        // Поступление / Выбытие
  activityType: string; // Операционная / Инвестиционная / Финансовая / Техническая операция
  comment: string;      // Выручка, Переменные расходы, Постоянные расходы и т.д.
}

// === Справочник контрагентов ===
export interface CounterpartyRef {
  name: string;
}

// === Загруженный источник ===
export interface DataSource {
  id: string;
  name: string;
  type: 'file' | 'google_sheets';
  url?: string;
  status: 'loading' | 'ready' | 'error';
  error?: string;
  sheets: ParsedSheet[];
  transactions: Transaction[];
  articles: ArticleDDS[];
  counterparties: CounterpartyRef[];
}

// === Результат парсинга листа ===
export interface ParsedSheet {
  name: string;
  type: SheetType;
  rowCount: number;
  sourceId: string;      // ID источника, к которому принадлежит лист
  sourceName: string;    // имя файла/источника
  selected: boolean;     // выбран ли для анализа
}

// === Фильтры ===
export interface Filters {
  dateFrom: Date | null;
  dateTo: Date | null;
  articles: string[];
  branches: string[];
  counterparties: string[];
  sheets: string[];
  direction: 'all' | 'in' | 'out';
}

// === Группировка в отчёте ===
export type GroupByMode = 'counterparty' | 'article' | 'counterparty_article' | 'article_counterparty';

export interface GroupedRow {
  key: string;
  label: string;
  subLabel?: string;
  income: number;
  expense: number;
  balance: number;
  count: number;
  children?: GroupedRow[];
  expanded?: boolean;
}
