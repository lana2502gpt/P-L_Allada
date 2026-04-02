import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { DataSource, ArticleDDS, CounterpartyRef, Transaction, Filters } from '@/types';

// ========== Нормализация контрагентов ==========

function cleanCounterparty(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  if (!s) return '';

  // В выписках контрагент может быть не в первой строке (первая часто — служебная)
  const lines = s.split(/\r?\n/).map(part => part.trim()).filter(Boolean);
  if (lines.length > 0) {
    // Берём первую неслужебную строку, чтобы не использовать техническое описание операции.
    const operationMarkers = ['СПИСАНИЕ', 'ПОСТУПЛЕНИЕ', 'ОПЛАТА', 'ПЕРЕВОД', 'ВОЗВРАТ', 'НАЗНАЧЕНИЕ'];
    const isOperationLine = (line: string) => {
      const upperLine = line.toUpperCase();
      return operationMarkers.some(marker => upperLine.startsWith(marker));
    };

    const firstLine = lines[0];
    if (!isOperationLine(firstLine)) {
      s = firstLine;
    } else {
      const fallback = lines.find(line => !isOperationLine(line));
      if (fallback) s = fallback;
    }
  }

  // Замена английских букв на русские аналоги для унификации
  const engToRus: Record<string, string> = {
    'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'H': 'Н', 'K': 'К',
    'M': 'М', 'O': 'О', 'P': 'Р', 'T': 'Т', 'X': 'Х', 'V': 'В',
    'a': 'а', 'c': 'с', 'e': 'е', 'o': 'о', 'p': 'р', 'x': 'х', 'v': 'в',
  };
  s = Array.from(s).map(ch => engToRus[ch] ?? ch).join('');

  const upper = s.toUpperCase();

  // Стоп-фразы — обрезаем всё начиная с них
  const stopPhrases = [
    'БЕЗ ДОГОВОРА', 'ОСНОВНОЙ ДОГОВОР', 'СОГЛАШЕНИЕ', 'СПИСАНИЕ',
    'ПОСТУПЛЕНИЕ', 'ОПЛАТА', 'ПЕРЕВОД', 'ВОЗВРАТ',
    'ДОГОВОР №', 'ДОГОВОР N', 'ДОГОВОР ', 'СЧЕТ №', 'СЧЁТ №',
    'АКТ ', 'УПД ', 'НАКЛАДНАЯ', 'ПОСТУПЛЕНИЕ (АКТ',
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
  }

  s = s.replace(/[\s,;.-]+$/, '').trim();
  if (!s) return '';

  // Для юрлиц/организаций оставляем полное имя (не урезаем до "ООО")
  const orgForms = [
    'КОЛЛЕГИЯ АДВОКАТОВ', 'АДВОКАТСКОЕ БЮРО', 'АДВОКАТСКАЯ КОНТОРА',
    'УПРАВЛЯЮЩАЯ КОМПАНИЯ', 'СТРАХОВАЯ КОМПАНИЯ',
    'ООО', 'ОАО', 'ЗАО', 'ПАО', 'АО', 'НКО', 'НАО',
    'БАНК', 'ИП', 'ГБУЗ', 'ГБУ', 'МУП', 'ГУП', 'ФГУП', 'КФХ', 'ФБУЗ',
  ];

  const upperCleaned = s.toUpperCase();
  if (orgForms.some(form => upperCleaned.includes(form))) {
    return s;
  }

  // Физлица: оставляем до 3 слов
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 3) return words.join(' ');
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

const ORG_TOKENS = [
  'ооо', 'оао', 'зао', 'пао', 'ао', 'ип', 'нко', 'нао',
  'фбуз', 'гбуз', 'фгуп', 'гуп', 'муп', 'кфх', 'банк',
];

function stripOrgPrefix(normalized: string): string {
  const parts = normalized.split(' ').filter(Boolean);
  let idx = 0;
  while (idx < parts.length && ORG_TOKENS.includes(parts[idx])) {
    idx += 1;
  }
  return parts.slice(idx).join(' ').trim();
}

function trimTrailingShortTokens(normalized: string): string {
  const parts = normalized.split(' ').filter(Boolean);
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (/^[а-яёa-z]{1,2}$/i.test(last) && !ORG_TOKENS.includes(last)) {
      parts.pop();
      continue;
    }
    break;
  }
  return parts.join(' ').trim();
}

function stripOrgTokensAnywhere(normalized: string): string {
  return normalized
    .split(' ')
    .filter(Boolean)
    .filter(token => !ORG_TOKENS.includes(token))
    .join(' ')
    .trim();
}

function buildTokenSignature(normalized: string): string {
  if (!normalized) return '';

  const stopTokens = new Set([
    ...ORG_TOKENS,
    'и', 'в', 'по', 'на', 'для', 'от', 'с', 'к',
  ]);

  const tokens = normalized
    .split(' ')
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => !stopTokens.has(t))
    .filter(t => t.length >= 2)
    .filter(t => !/\d/.test(t))
    .filter(t => /^[a-zа-яё-]+$/i.test(t))
    .sort();

  return tokens.join('|');
}

// ========== State ==========

interface AppState {
  sources: DataSource[];
  filters: Filters;
  counterpartyArticleOverrides: Record<string, string>;
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
  counterpartyArticleOverrides: {},
};

// ========== Actions ==========

type Action =
  | { type: 'ADD_SOURCE'; payload: DataSource }
  | { type: 'UPDATE_SOURCE'; payload: { id: string; updates: Partial<DataSource> } }
  | { type: 'REMOVE_SOURCE'; payload: string }
  | { type: 'SET_FILTERS'; payload: Partial<Filters> }
  | { type: 'RESET_FILTERS' }
  | { type: 'SET_COUNTERPARTY_ARTICLE_OVERRIDE'; payload: { counterparty: string; article: string } }
  | { type: 'REMOVE_COUNTERPARTY_ARTICLE_OVERRIDE'; payload: { counterparty: string } }
  | { type: 'TOGGLE_SHEET_SELECTION'; payload: { sourceId: string; sheetName: string } }
  | { type: 'SET_ALL_SHEETS_SELECTION'; payload: { sourceId: string; selected: boolean } };

function normalizeCounterpartyOverrideKey(value: string): string {
  return String(value || '').trim().toLowerCase();
}

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

    case 'SET_COUNTERPARTY_ARTICLE_OVERRIDE': {
      const key = normalizeCounterpartyOverrideKey(action.payload.counterparty);
      if (!key || !action.payload.article.trim()) return state;
      return {
        ...state,
        counterpartyArticleOverrides: {
          ...state.counterpartyArticleOverrides,
          [key]: action.payload.article,
        },
      };
    }

    case 'REMOVE_COUNTERPARTY_ARTICLE_OVERRIDE': {
      const key = normalizeCounterpartyOverrideKey(action.payload.counterparty);
      if (!key || !state.counterpartyArticleOverrides[key]) return state;
      const next = { ...state.counterpartyArticleOverrides };
      delete next[key];
      return {
        ...state,
        counterpartyArticleOverrides: next,
      };
    }

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

function buildCounterpartyDictionary(sources: DataSource[]): {
  exactMap: Map<string, string>;
  tokenMap: Map<string, string>;
  hasReferences: boolean;
} {
  const exactMap = new Map<string, string>();
  const tokenMap = new Map<string, string>();
  let hasReferences = false;

  sources
    .filter(s => s.status === 'ready')
    .forEach(s => {
      s.counterparties.forEach((cp) => {
        const displayName = cp.name?.trim();
        if (!displayName) return;

        hasReferences = true;

        const cleaned = cleanCounterparty(displayName);
        const normalized = normalizeCounterpartyForMatch(cleaned);
        const stripped = stripOrgPrefix(normalized);
        const trimmed = trimTrailingShortTokens(normalized);
        const orgAgnostic = stripOrgTokensAnywhere(normalized);
        const signature = buildTokenSignature(trimmed || orgAgnostic || stripped || normalized);

        if (normalized && !exactMap.has(normalized)) {
          exactMap.set(normalized, displayName);
        }

        if (stripped && !exactMap.has(stripped)) {
          exactMap.set(stripped, displayName);
        }

        if (trimmed && !exactMap.has(trimmed)) {
          exactMap.set(trimmed, displayName);
        }

        if (orgAgnostic && !exactMap.has(orgAgnostic)) {
          exactMap.set(orgAgnostic, displayName);
        }

        if (signature && !tokenMap.has(signature)) {
          tokenMap.set(signature, displayName);
        }
      });
    });

  return { exactMap, tokenMap, hasReferences };
}

function resolveCounterpartyName(
  rawCounterparty: string,
  dictionary: { exactMap: Map<string, string>; tokenMap: Map<string, string>; hasReferences: boolean },
): string {
  const raw = String(rawCounterparty || '').trim();

  // Если в журнале/выписке контрагент пустой — оставляем пустым
  if (!raw) return '';

  const cleaned = cleanCounterparty(raw);
  const normalizedTx = normalizeCounterpartyForMatch(cleaned);
  const strippedTx = stripOrgPrefix(normalizedTx);
  const trimmedTx = trimTrailingShortTokens(normalizedTx);
  const orgAgnosticTx = stripOrgTokensAnywhere(normalizedTx);

  const found = dictionary.exactMap.get(normalizedTx)
    || dictionary.exactMap.get(strippedTx)
    || dictionary.exactMap.get(trimmedTx)
    || dictionary.exactMap.get(orgAgnosticTx);
  if (found) return found;

  const signature = buildTokenSignature(trimmedTx || orgAgnosticTx || strippedTx || normalizedTx);
  if (signature && dictionary.tokenMap.has(signature)) {
    return dictionary.tokenMap.get(signature) || cleaned;
  }

  // Если справочник не загружен — показываем очищенное исходное значение
  if (!dictionary.hasReferences) {
    return cleaned;
  }

  // Если справочник есть, но совпадение не найдено,
  // возвращаем очищенное исходное значение, чтобы не терять контрагента в отчётах.
  return cleaned;
}

function getAllTransactions(
  sources: DataSource[],
  counterpartyArticleOverrides: Record<string, string>,
): Transaction[] {
  const dictionary = buildCounterpartyDictionary(sources);

  return sources
    .filter(s => s.status === 'ready')
    .flatMap(s => {
      const selectedSheets = new Set(
        s.sheets
          .filter(sh => sh.selected)
          .map(sh => sh.name),
      );

      return s.transactions
        .filter(t => selectedSheets.has(t.sheet))
        .map(t => {
          const resolvedCounterparty = resolveCounterpartyName(t.counterparty, dictionary);
          const overrideKey = normalizeCounterpartyOverrideKey(resolvedCounterparty);
          const articleOverride = counterpartyArticleOverrides[overrideKey];

          return {
            ...t,
            counterparty: resolvedCounterparty,
            article: articleOverride || t.article,
          };
        });
    });
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

function normalizeFilterText(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function applyFilters(transactions: Transaction[], filters: Filters): Transaction[] {
  const articleSet = new Set(filters.articles.map(normalizeFilterText).filter(Boolean));
  const branchSet = new Set(filters.branches.map(normalizeFilterText).filter(Boolean));
  const counterpartySet = new Set(filters.counterparties.map(normalizeFilterText).filter(Boolean));
  const sheetSet = new Set(filters.sheets.map(normalizeFilterText).filter(Boolean));

  return transactions.filter(t => {
    if (filters.dateFrom && t.date < filters.dateFrom) return false;
    if (filters.dateTo) {
      const endOfDay = new Date(filters.dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      if (t.date > endOfDay) return false;
    }

    if (articleSet.size > 0 && !articleSet.has(normalizeFilterText(t.article))) return false;
    if (branchSet.size > 0 && !branchSet.has(normalizeFilterText(t.branch))) return false;
    if (counterpartySet.size > 0 && !counterpartySet.has(normalizeFilterText(t.counterparty))) return false;
    if (sheetSet.size > 0 && !sheetSet.has(normalizeFilterText(t.sheet))) return false;
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
  counterpartyArticleOverrides: Record<string, string>;
  cleanCounterparty: (raw: string) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const allTransactions = getAllTransactions(state.sources, state.counterpartyArticleOverrides);
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
      counterpartyArticleOverrides: state.counterpartyArticleOverrides,
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
