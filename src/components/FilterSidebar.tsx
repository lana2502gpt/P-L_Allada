import { useState, useMemo, useEffect, useRef } from 'react';
import { Filter, RotateCcw, ChevronDown, ChevronUp, Search, X, CalendarDays } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Поиск...',
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(lower));
  }, [options, search]);

  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter(s => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectAll = () => {
    onChange(Array.from(new Set(options)));
  };

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
      >
        <span className="flex items-center gap-2">
          {label}
          {selected.length > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
              {selected.length}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="relative p-2">
            <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-md border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mx-2 mb-1 flex gap-1">
            <button
              onClick={selectAll}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
            >
              Выбрать все
            </button>
            {selected.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
              >
                <X className="h-3 w-3" /> Снять все
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto px-2 pb-2">
            {filtered.length === 0 ? (
              <p className="py-2 text-center text-xs text-slate-400">Ничего не найдено</p>
            ) : (
              filtered.map(item => (
                <label
                  key={item}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(item)}
                    onChange={() => toggle(item)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="truncate text-slate-700">{item}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function parseDateInput(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;

  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const d = new Date(year, month, day);

  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() != year || d.getMonth() != month || d.getDate() != day) return null;

  return d;
}

function formatDateInput(date: Date | null): string {
  if (!date) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}


function formatDateForNative(date: Date | null): string {
  if (!date) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseNativeDate(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

export function FilterSidebar() {
  const {
    state,
    dispatch,
    allArticles,
    uniqueBranches,
    uniqueSheets,
    uniqueCounterpartiesFromTx,
    allTransactions,
  } = useAppContext();

  const { filters } = state;
  const hasData = allTransactions.length > 0;

  const [dateFromInput, setDateFromInput] = useState(formatDateInput(filters.dateFrom));
  const [dateToInput, setDateToInput] = useState(formatDateInput(filters.dateTo));
  const dateFromNativeRef = useRef<HTMLInputElement | null>(null);
  const dateToNativeRef = useRef<HTMLInputElement | null>(null);


  useEffect(() => {
    setDateFromInput(formatDateInput(filters.dateFrom));
  }, [filters.dateFrom]);

  useEffect(() => {
    setDateToInput(formatDateInput(filters.dateTo));
  }, [filters.dateTo]);

  const articleNames = useMemo(() =>
    allArticles.filter(a => a.name).map(a => a.name),
    [allArticles]
  );

  const hasActiveFilters = filters.articles.length > 0
    || filters.branches.length > 0
    || filters.counterparties.length > 0
    || filters.sheets.length > 0
    || filters.direction !== 'all'
    || filters.dateFrom !== null
    || filters.dateTo !== null;

  if (!hasData) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 uppercase tracking-wide">
          <Filter className="h-4 w-4" />
          Фильтры
        </h3>
        {hasActiveFilters && (
          <button
            onClick={() => dispatch({ type: 'RESET_FILTERS' })}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <RotateCcw className="h-3 w-3" />
            Сбросить
          </button>
        )}
      </div>

      {/* Период */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">Период</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500">С</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                placeholder="дд/мм/гггг"
                value={dateFromInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateFromInput(value);
                  const parsed = parseDateInput(value);
                  if (parsed || !value.trim()) {
                    dispatch({
                      type: 'SET_FILTERS',
                      payload: { dateFrom: parsed },
                    });
                  }
                }}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => dateFromNativeRef.current?.showPicker?.()}
                className="rounded-md border border-slate-200 px-2 text-slate-500 hover:bg-slate-100"
                title="Открыть календарь"
              >
                <CalendarDays className="h-3.5 w-3.5" />
              </button>
              <input
                ref={dateFromNativeRef}
                type="date"
                value={formatDateForNative(filters.dateFrom)}
                onChange={(e) => {
                  const parsed = parseNativeDate(e.target.value);
                  dispatch({ type: 'SET_FILTERS', payload: { dateFrom: parsed } });
                }}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500">По</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                placeholder="дд/мм/гггг"
                value={dateToInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setDateToInput(value);
                  const parsed = parseDateInput(value);
                  if (parsed || !value.trim()) {
                    dispatch({
                      type: 'SET_FILTERS',
                      payload: { dateTo: parsed },
                    });
                  }
                }}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => dateToNativeRef.current?.showPicker?.()}
                className="rounded-md border border-slate-200 px-2 text-slate-500 hover:bg-slate-100"
                title="Открыть календарь"
              >
                <CalendarDays className="h-3.5 w-3.5" />
              </button>
              <input
                ref={dateToNativeRef}
                type="date"
                value={formatDateForNative(filters.dateTo)}
                onChange={(e) => {
                  const parsed = parseNativeDate(e.target.value);
                  dispatch({ type: 'SET_FILTERS', payload: { dateTo: parsed } });
                }}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>

        {/* Быстрые пресеты */}
        <div className="flex flex-wrap gap-1">
          {[
            { label: 'Текущий месяц', fn: () => {
              const now = new Date();
              return { dateFrom: new Date(now.getFullYear(), now.getMonth(), 1), dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
            }},
            { label: 'Прошлый месяц', fn: () => {
              const now = new Date();
              return { dateFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1), dateTo: new Date(now.getFullYear(), now.getMonth(), 0) };
            }},
            { label: 'Квартал', fn: () => {
              const now = new Date();
              const q = Math.floor(now.getMonth() / 3);
              return { dateFrom: new Date(now.getFullYear(), q * 3, 1), dateTo: new Date(now.getFullYear(), q * 3 + 3, 0) };
            }},
            { label: 'Год', fn: () => {
              const now = new Date();
              return { dateFrom: new Date(now.getFullYear(), 0, 1), dateTo: new Date(now.getFullYear(), 11, 31) };
            }},
          ].map(preset => (
            <button
              key={preset.label}
              onClick={() => dispatch({ type: 'SET_FILTERS', payload: preset.fn() })}
              className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Направление */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">Направление</label>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {[
            { value: 'all' as const, label: 'Все' },
            { value: 'in' as const, label: 'Поступления' },
            { value: 'out' as const, label: 'Выбытия' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => dispatch({ type: 'SET_FILTERS', payload: { direction: opt.value } })}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                filters.direction === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Статьи */}
      <MultiSelect
        label="Статьи ДДС"
        options={articleNames}
        selected={filters.articles}
        onChange={(articles) => dispatch({ type: 'SET_FILTERS', payload: { articles } })}
        placeholder="Поиск статей..."
      />

      {/* Филиалы */}
      {uniqueBranches.length > 0 && (
        <MultiSelect
          label="Филиалы"
          options={uniqueBranches}
          selected={filters.branches}
          onChange={(branches) => dispatch({ type: 'SET_FILTERS', payload: { branches } })}
          placeholder="Поиск филиалов..."
        />
      )}

      {/* Контрагенты */}
      {uniqueCounterpartiesFromTx.length > 0 && (
        <MultiSelect
          label="Контрагенты"
          options={uniqueCounterpartiesFromTx}
          selected={filters.counterparties}
          onChange={(counterparties) => dispatch({ type: 'SET_FILTERS', payload: { counterparties } })}
          placeholder="Поиск контрагентов..."
        />
      )}

      {/* Журналы */}
      {uniqueSheets.length > 0 && (
        <MultiSelect
          label="Журналы (листы)"
          options={uniqueSheets}
          selected={filters.sheets}
          onChange={(sheets) => dispatch({ type: 'SET_FILTERS', payload: { sheets } })}
          placeholder="Поиск журналов..."
        />
      )}
    </div>
  );
}
