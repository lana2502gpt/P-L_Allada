import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { DataSource, ArticleDDS, CounterpartyRef, Transaction, Filters } from '@/types';

// ========== Нормализация контрагентов ==========

function cleanCounterparty(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  if (!s) return '';

  // Замена английских букв на русские аналоги для унификации
  const engToRus: Record<string, string> = {
    'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н', 'K': 'К',
    'M': 'М', 'O': 'О', 'P': 'Р', 'T': 'Т', 'X': 'Х',
    'a': 'а', 'c': 'с', 'e': 'е', 'o': 'о', 'p': 'р', 'x': 'х',
  };
  let normalized = '';
  for (const ch of s) {
    normalized += engToRus[ch] ?? ch;
  }

  const upper = normalized.toUpperCase();

  // Стоп-фразы — обрезаем всё начиная с них
  const stopPhrases = [
    'БЕЗ ДОГОВОРА', 'ОСНОВНОЙ ДОГОВОР', 'СОГЛАШЕНИЕ', 'СПИСАНИЕ',
    'ПОСТУПЛЕНИЕ', 'ОПЛАТА', 'ПЕРЕВОД', 'ВОЗВРАТ',
    'ДОГОВОР №', 'ДОГОВОР N', 'СЧЕТ №', 'СЧЁТ №',
    'АКТ ', 'УПД ', 'НАКЛАДНАЯ',
    ' ОТ ',
  ];

  let cutPos = upper.length;
  for (const phrase of stopPhrases) {
    const idx = upper.indexOf(phrase);
    if (idx > 0 && idx < cutPos) {
      cutPos = idx;
    }
  }
  if (cutPos < upper.length) {
    s = s.substring(0, cutPos).trim();
    normalized = normalized.substring(0, cutPos).trim();
  }

  // Убираем номера документов (типа 45/21, 10/АЛ-А/22, 202212...)
  // Паттерн: если после организационной формы идёт что-то с цифрами/слешами
  const normUpper = normalized.toUpperCase();

  // Список организационных форм
  const orgForms = [
    'КОЛЛЕГИЯ АДВОКАТОВ', 'АДВОКАТСКОЕ БЮРО', 'АДВОКАТСКАЯ КОНТОРА',
    'УПРАВЛЯЮЩАЯ КОМПАНИЯ', 'СТРАХОВАЯ КОМПАНИЯ',
    'ООО', 'ОАО', 'ЗАО', 'ПАО', 'АО', 'НКО', 'НАО',
    'БАНК', 'ИП', 'ГБУЗ', 'ГБУ', 'МУП', 'ГУП', 'ФГУП', 'КФХ',
  ];

  for (const form of orgForms) {
    const idx = normUpper.indexOf(form);
    if (idx !== -1) {
      // Берём всё до конца организационной формы
      const endPos = idx + form.length;
      let result = s.substring(0, endPos).trim();
      // Убираем trailing мусор
      result = result.replace(/[\s,;.\-]+$/, '');
      if (result.length >= 2) {
        return result;
      }
    }
  }

  // Если организационная форма не найдена — считаем что это ФИО
  // Берём первые 3 слова
  const words = s.split(/\s+/).filter(w => w.length > 0);
  if (words.length <= 3) return words.join(' ');

  // Проверяем, не начинается ли 4-е слово с цифры
  return words.slice(0, 3).join(' ');
}

function normalizeCounterpartyForMatch(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/["«»']/g, '')
    .replace(/[.,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripOrgPrefix(normalized: string): string {
  const prefixes = [
    'ооо', 'оао', 'зао', 'пао', 'ао', 'ип', 'нко', 'нао',
    'фбуз', 'гбуз', 'фгуп', 'гуп', 'муп', 'кфх', 'банк',
  ];

  const parts = normalized.split(' ').filter(Boolean);
  let idx = 0;
  while (idx < parts.length && prefixes.includes(parts[idx])) {
    idx += 1;
  }
  return parts.slice(idx).join(' ').trim();
}

// ========== State ==========

interface AppState {
  sources: DataSource[];
  filters: Filters;
}

const initialFilters: Filters = {
  dateFrom: null,
  dateTo: null,
  articles: [],
  branches: [],
  counterparties: [],
  sheets: [],
  direction: 'all',
};

const initialState: AppState = {
  sources: [],
  filters: initialFilters,
};

// ========== Actions ==========

type Action =
  | { type: 'ADD_SOURCE'; payload: DataSource }
  | { type: 'UPDATE_SOURCE'; payload: { id: string; updates: Partial<DataSource> } }
  | { type: 'REMOVE_SOURCE'; payload: string }
  | { type: 'SET_FILTERS'; payload: Partial<Filters> }
  | { type: 'RESET_FILTERS' }
  | { type: 'TOGGLE_SHEET_SELECTION'; payload: { sourceId: string; sheetName: string } }
  | { type: 'SET_ALL_SHEETS_SELECTION'; payload: { sourceId: string; selected: boolean } };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_SOURCE':
      return { ...state, sources: [...state.sources, action.payload] };

    case 'UPDATE_SOURCE':
      return {
        ...state,
        sources: state.sources.map(s =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
      };

    case 'REMOVE_SOURCE':
      return {
        ...state,
        sources: state.sources.filter(s => s.id !== action.payload),
      };

    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };

    case 'RESET_FILTERS':
      return { ...state, filters: initialFilters };

    case 'TOGGLE_SHEET_SELECTION':
      return {
        ...state,
        sources: state.sources.map(s => {
          if (s.id !== action.payload.sourceId) return s;
          return {
            ...s,
            sheets: s.sheets.map(sh =>
              sh.name === action.payload.sheetName
                ? { ...sh, selected: !sh.selected }
                : sh
            ),
          };
        }),
      };

    case 'SET_ALL_SHEETS_SELECTION':
      return {
        ...state,
        sources: state.sources.map(s => {
          if (s.id !== action.payload.sourceId) return s;
          return {
            ...s,
            sheets: s.sheets.map(sh =>
              sh.type !== 'reference' && sh.type !== 'unknown'
                ? { ...sh, selected: action.payload.selected }
                : sh
            ),
          };
        }),
      };

    default:
      return state;
  }
}

// ========== Derived data helpers ==========

function getSelectedSheetNames(sources: DataSource[]): Set<string> {
  const set = new Set<string>();
  sources
    .filter(s => s.status === 'ready')
    .forEach(s => {
      s.sheets.forEach(sh => {
        if (sh.selected) set.add(sh.name);
      });
    });
  return set;
}

function buildCounterpartyDictionary(sources: DataSource[]): {
  exactMap: Map<string, string>;
  normalizedRefs: Array<{ normalized: string; displayName: string }>;
} {
  const exactMap = new Map<string, string>();

  sources
    .filter(s => s.status === 'ready')
    .forEach(s => {
      s.counterparties.forEach((cp) => {
        const displayName = cp.name?.trim();
        if (!displayName) return;

        const normalized = normalizeCounterpartyForMatch(displayName);
        const stripped = stripOrgPrefix(normalized);

        if (normalized && !exactMap.has(normalized)) {
          exactMap.set(normalized, displayName);
        }
        if (stripped && !exactMap.has(stripped)) {
          exactMap.set(stripped, displayName);
        }
      });
    });

  const normalizedRefs = Array.from(exactMap.entries())
    .map(([normalized, displayName]) => ({ normalized, displayName }))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  return { exactMap, normalizedRefs };
}

function resolveCounterpartyName(
  rawCounterparty: string,
  dictionary: { exactMap: Map<string, string>; normalizedRefs: Array<{ normalized: string; displayName: string }> },
): string {
  const raw = String(rawCounterparty || '').trim();
  const normalizedTx = normalizeCounterpartyForMatch(raw);
  const strippedTx = stripOrgPrefix(normalizedTx);
  if (!normalizedTx) return '';

  const exact = dictionary.exactMap.get(normalizedTx) || dictionary.exactMap.get(strippedTx);
  if (exact) return exact;

  const contains = dictionary.normalizedRefs.find((ref) =>
    normalizedTx.includes(ref.normalized)
    || ref.normalized.includes(normalizedTx)
    || (strippedTx && (strippedTx.includes(ref.normalized) || ref.normalized.includes(strippedTx))),
  );

  if (contains) return contains.displayName;

  return raw;
}

function getAllTransactions(sources: DataSource[]): Transaction[] {
  const selectedSheets = getSelectedSheetNames(sources);
  const dictionary = buildCounterpartyDictionary(sources);

  return sources
    .filter(s => s.status === 'ready')
    .flatMap(s =>
      s.transactions
        .filter(t => selectedSheets.has(t.sheet))
        .map(t => ({
          ...t,
          counterparty: resolveCounterpartyName(t.counterparty, dictionary),
        })),
    );
}

function getAllArticles(sources: DataSource[]): ArticleDDS[] {
  const map = new Map<string, ArticleDDS>();
  sources
    .filter(s => s.status === 'ready')
    .forEach(s => {
      s.articles.forEach(a => {
        if (!map.has(a.name)) map.set(a.name, a);
      });
    });
  return Array.from(map.values());
}

function getAllCounterparties(sources: DataSource[]): CounterpartyRef[] {
  const map = new Map<string, CounterpartyRef>();
  sources
    .filter(s => s.status === 'ready')
    .forEach(s => {
      s.counterparties.forEach(c => {
        if (!map.has(c.name)) map.set(c.name, c);
      });
    });
  return Array.from(map.values());
}

function getUniqueBranches(transactions: Transaction[]): string[] {
  const set = new Set<string>();
  transactions.forEach(t => { if (t.branch) set.add(t.branch); });
  return Array.from(set).sort();
}

function getUniqueSheets(transactions: Transaction[]): string[] {
  const set = new Set<string>();
  transactions.forEach(t => { if (t.sheet) set.add(t.sheet); });
  return Array.from(set).sort();
}

function getUniqueCounterpartiesFromTx(transactions: Transaction[]): string[] {
  const set = new Set<string>();
  transactions.forEach(t => {
    if (t.counterparty) {
      set.add(t.counterparty);
    }
  });
  return Array.from(set).sort();
}

function applyFilters(transactions: Transaction[], filters: Filters): Transaction[] {
  return transactions.filter(t => {
    if (filters.dateFrom && t.date < filters.dateFrom) return false;
    if (filters.dateTo) {
      const endOfDay = new Date(filters.dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      if (t.date > endOfDay) return false;
    }
    if (filters.articles.length > 0 && !filters.articles.includes(t.article)) return false;
    if (filters.branches.length > 0 && !filters.branches.includes(t.branch)) return false;
    if (filters.counterparties.length > 0) {
      if (!filters.counterparties.includes(t.counterparty)) return false;
    }
    if (filters.sheets.length > 0 && !filters.sheets.includes(t.sheet)) return false;
    if (filters.direction !== 'all' && t.direction !== filters.direction) return false;
    return true;
  });
}

// ========== Context ==========

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  // Computed
  allTransactions: Transaction[];
  filteredTransactions: Transaction[];
  allArticles: ArticleDDS[];
  allCounterparties: CounterpartyRef[];
  uniqueBranches: string[];
  uniqueSheets: string[];
  uniqueCounterpartiesFromTx: string[];
  cleanCounterparty: (raw: string) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const allTransactions = getAllTransactions(state.sources);
  const filteredTransactions = applyFilters(allTransactions, state.filters);
  const allArticles = getAllArticles(state.sources);
  const allCounterparties = getAllCounterparties(state.sources);
  const uniqueBranches = getUniqueBranches(allTransactions);
  const uniqueSheets = getUniqueSheets(allTransactions);
  const uniqueCounterpartiesFromTx = getUniqueCounterpartiesFromTx(allTransactions);

  return (
    <AppContext.Provider value={{
      state,
      dispatch,
      allTransactions,
      filteredTransactions,
      allArticles,
      allCounterparties,
      uniqueBranches,
      uniqueSheets,
      uniqueCounterpartiesFromTx,
      cleanCounterparty,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
