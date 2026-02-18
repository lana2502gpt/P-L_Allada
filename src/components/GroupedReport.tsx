import React, { useMemo, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import * as XLSX from 'xlsx';

type GroupMode = 'article' | 'counterparty' | 'counterparty-article' | 'article-counterparty';
type SortField = 'label' | 'subLabel' | 'count' | 'income' | 'expense' | 'balance';
type SortDir = 'asc' | 'desc';

interface FlatRow {
  label: string;
  subLabel: string;
  count: number;
  income: number;
  expense: number;
  balance: number;
}

type ColumnFilters = {
  label: string;
  subLabel: string;
  countMin: string;
  countMax: string;
  incomeMin: string;
  incomeMax: string;
  expenseMin: string;
  expenseMax: string;
  balanceMin: string;
  balanceMax: string;
};

const fmt = (n: number) =>
  n.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const initialFilters: ColumnFilters = {
  label: '',
  subLabel: '',
  countMin: '',
  countMax: '',
  incomeMin: '',
  incomeMax: '',
  expenseMin: '',
  expenseMax: '',
  balanceMin: '',
  balanceMax: '',
};

const parseOptionalNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const GroupedReport: React.FC = () => {
  const { filteredTransactions, cleanCounterparty } = useAppContext();
  const [mode, setMode] = useState<GroupMode>('counterparty-article');
  const [sortField, setSortField] = useState<SortField>('expense');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(initialFilters);

  const txs = filteredTransactions;

  const rows = useMemo<FlatRow[]>(() => {
    const map = new Map<string, { count: number; income: number; expense: number }>();

    for (const tx of txs) {
      const cpty = cleanCounterparty(tx.counterparty) || '(не указан)';
      const art = tx.article || '(без статьи)';
      let key: string;

      switch (mode) {
        case 'article':
          key = art;
          break;
        case 'counterparty':
          key = cpty;
          break;
        case 'counterparty-article':
          key = `${cpty}|||${art}`;
          break;
        case 'article-counterparty':
          key = `${art}|||${cpty}`;
          break;
      }

      const existing = map.get(key);
      const amount = tx.amount;
      const inc = tx.direction === 'in' ? amount : 0;
      const exp = tx.direction === 'out' ? amount : 0;

      if (existing) {
        existing.count += 1;
        existing.income += inc;
        existing.expense += exp;
      } else {
        map.set(key, { count: 1, income: inc, expense: exp });
      }
    }

    const result: FlatRow[] = [];
    for (const [key, val] of map) {
      let label: string;
      let subLabel: string;
      if (mode === 'counterparty-article' || mode === 'article-counterparty') {
        const parts = key.split('|||');
        label = parts[0] || '';
        subLabel = parts[1] || '';
      } else {
        label = key;
        subLabel = '';
      }
      result.push({
        label,
        subLabel,
        count: val.count,
        income: val.income,
        expense: val.expense,
        balance: val.income - val.expense,
      });
    }

    return result;
  }, [txs, mode, cleanCounterparty]);

  const filteredRows = useMemo(() => {
    const countMin = parseOptionalNumber(columnFilters.countMin);
    const countMax = parseOptionalNumber(columnFilters.countMax);
    const incomeMin = parseOptionalNumber(columnFilters.incomeMin);
    const incomeMax = parseOptionalNumber(columnFilters.incomeMax);
    const expenseMin = parseOptionalNumber(columnFilters.expenseMin);
    const expenseMax = parseOptionalNumber(columnFilters.expenseMax);
    const balanceMin = parseOptionalNumber(columnFilters.balanceMin);
    const balanceMax = parseOptionalNumber(columnFilters.balanceMax);

    return rows.filter((row) => {
      if (columnFilters.label && !row.label.toLowerCase().includes(columnFilters.label.toLowerCase().trim())) return false;
      if (columnFilters.subLabel && !row.subLabel.toLowerCase().includes(columnFilters.subLabel.toLowerCase().trim())) return false;

      if (countMin !== null && row.count < countMin) return false;
      if (countMax !== null && row.count > countMax) return false;
      if (incomeMin !== null && row.income < incomeMin) return false;
      if (incomeMax !== null && row.income > incomeMax) return false;
      if (expenseMin !== null && row.expense < expenseMin) return false;
      if (expenseMax !== null && row.expense > expenseMax) return false;
      if (balanceMin !== null && row.balance < balanceMin) return false;
      if (balanceMax !== null && row.balance > balanceMax) return false;

      return true;
    });
  }, [rows, columnFilters]);

  const sorted = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      if (typeof va === 'string') {
        const sa = va.toLowerCase();
        const sb = (vb as string).toLowerCase();
        return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [filteredRows, sortField, sortDir]);

  const totals = useMemo(() => {
    let count = 0;
    let income = 0;
    let expense = 0;
    for (const r of filteredRows) {
      count += r.count;
      income += r.income;
      expense += r.expense;
    }
    return { count, income, expense, balance: income - expense };
  }, [filteredRows]);

  const maxAmount = useMemo(() => {
    let m = 0;
    for (const r of filteredRows) {
      const total = Math.abs(r.income) + Math.abs(r.expense);
      if (total > m) m = total;
    }
    return m || 1;
  }, [filteredRows]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const setFilter = (key: keyof ColumnFilters, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const isTwoCol = mode === 'counterparty-article' || mode === 'article-counterparty';
  const col1Name = mode === 'counterparty-article' ? 'Контрагент' : mode === 'article-counterparty' ? 'Статья' : mode === 'counterparty' ? 'Контрагент' : 'Статья';
  const col2Name = mode === 'counterparty-article' ? 'Статья' : 'Контрагент';

  const exportToExcel = () => {
    try {
      const exportRows = sorted.map((r) => {
        const row: Record<string, string | number> = {};
        row[col1Name] = r.label;
        if (isTwoCol) row[col2Name] = r.subLabel;
        row['Кол-во операций'] = r.count;
        row['Поступления'] = r.income;
        row['Выбытия'] = r.expense;
        row['Сальдо'] = r.balance;
        return row;
      });

      const totalRow: Record<string, string | number> = {};
      totalRow[col1Name] = 'ИТОГО';
      if (isTwoCol) totalRow[col2Name] = '';
      totalRow['Кол-во операций'] = totals.count;
      totalRow['Поступления'] = totals.income;
      totalRow['Выбытия'] = totals.expense;
      totalRow['Сальдо'] = totals.balance;
      exportRows.push(totalRow);

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Отчёт');

      const keys = Object.keys(exportRows[0] || {});
      const colWidths = keys.map((key) => ({
        wch: Math.max(key.length, ...exportRows.map((r) => String(r[key] ?? '').length)) + 2,
      }));
      ws['!cols'] = colWidths;

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `отчет_${mode}_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export error:', e);
      alert('Ошибка при экспорте: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  if (txs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-400">
        <p className="text-lg">Нет данных для отчёта. Загрузите файлы и настройте фильтры.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-800">📊 Сводный отчёт</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-sm">
            {([
              ['article', 'Статьи'],
              ['counterparty', 'Контрагенты'],
              ['counterparty-article', 'Контрагент → Статья'],
              ['article-counterparty', 'Статья → Контрагент'],
            ] as [GroupMode, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                  mode === m
                    ? 'bg-white text-blue-700 shadow font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setColumnFilters(initialFilters)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100"
          >
            Сбросить фильтры
          </button>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium shadow-sm"
          >
            <span>📥</span> Экспорт Excel
          </button>
        </div>
      </div>

      <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-sm text-blue-700">
        Найдено <strong>{filteredRows.length}</strong> {isTwoCol ? 'комбинаций' : 'групп'}
        {' '}из <strong>{rows.length}</strong> · <strong>{totals.count}</strong> операций
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th
                className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('label')}
              >
                {col1Name} {sortIcon('label')}
              </th>
              {isTwoCol && (
                <th
                  className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => handleSort('subLabel')}
                >
                  {col2Name} {sortIcon('subLabel')}
                </th>
              )}
              <th
                className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none w-20"
                onClick={() => handleSort('count')}
              >
                Опер. {sortIcon('count')}
              </th>
              <th
                className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('income')}
              >
                Поступления {sortIcon('income')}
              </th>
              <th
                className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('expense')}
              >
                Выбытия {sortIcon('expense')}
              </th>
              <th
                className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => handleSort('balance')}
              >
                Сальдо {sortIcon('balance')}
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-32">Доля</th>
            </tr>
            <tr className="bg-gray-100 border-b border-gray-200">
              <th className="px-2 py-2"><input value={columnFilters.label} onChange={(e) => setFilter('label', e.target.value)} placeholder="Фильтр" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" /></th>
              {isTwoCol && <th className="px-2 py-2"><input value={columnFilters.subLabel} onChange={(e) => setFilter('subLabel', e.target.value)} placeholder="Фильтр" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" /></th>}
              <th className="px-2 py-2">
                <div className="grid grid-cols-2 gap-1">
                  <input value={columnFilters.countMin} onChange={(e) => setFilter('countMin', e.target.value)} placeholder="мин" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                  <input value={columnFilters.countMax} onChange={(e) => setFilter('countMax', e.target.value)} placeholder="макс" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                </div>
              </th>
              <th className="px-2 py-2">
                <div className="grid grid-cols-2 gap-1">
                  <input value={columnFilters.incomeMin} onChange={(e) => setFilter('incomeMin', e.target.value)} placeholder="мин" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                  <input value={columnFilters.incomeMax} onChange={(e) => setFilter('incomeMax', e.target.value)} placeholder="макс" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                </div>
              </th>
              <th className="px-2 py-2">
                <div className="grid grid-cols-2 gap-1">
                  <input value={columnFilters.expenseMin} onChange={(e) => setFilter('expenseMin', e.target.value)} placeholder="мин" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                  <input value={columnFilters.expenseMax} onChange={(e) => setFilter('expenseMax', e.target.value)} placeholder="макс" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                </div>
              </th>
              <th className="px-2 py-2">
                <div className="grid grid-cols-2 gap-1">
                  <input value={columnFilters.balanceMin} onChange={(e) => setFilter('balanceMin', e.target.value)} placeholder="мин" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                  <input value={columnFilters.balanceMax} onChange={(e) => setFilter('balanceMax', e.target.value)} placeholder="макс" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                </div>
              </th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const incAbs = Math.abs(row.income);
              const expAbs = Math.abs(row.expense);
              const incPct = maxAmount > 0 ? (incAbs / maxAmount) * 100 : 0;
              const expPct = maxAmount > 0 ? (expAbs / maxAmount) * 100 : 0;
              return (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-gray-800 font-medium max-w-xs truncate" title={row.label}>
                    {row.label}
                  </td>
                  {isTwoCol && (
                    <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate" title={row.subLabel}>
                      {row.subLabel}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right text-gray-600">{row.count}</td>
                  <td className="px-4 py-2.5 text-right text-green-600 font-medium">
                    {row.income !== 0 ? fmt(row.income) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-red-600 font-medium">
                    {row.expense !== 0 ? fmt(row.expense) : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-bold ${row.balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                    {fmt(row.balance)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex h-4 rounded-full overflow-hidden bg-gray-100" style={{ width: '100%' }}>
                      {row.income !== 0 && (
                        <div
                          className="bg-green-400 h-full"
                          style={{ width: `${incPct}%` }}
                          title={`Поступления: ${fmt(row.income)}`}
                        />
                      )}
                      {row.expense !== 0 && (
                        <div
                          className="bg-red-400 h-full"
                          style={{ width: `${expPct}%` }}
                          title={`Выбытия: ${fmt(row.expense)}`}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
              <td className="px-4 py-3 text-gray-800">ИТОГО</td>
              {isTwoCol && <td className="px-4 py-3" />}
              <td className="px-4 py-3 text-right text-gray-800">{totals.count}</td>
              <td className="px-4 py-3 text-right text-green-700">{fmt(totals.income)}</td>
              <td className="px-4 py-3 text-right text-red-700">{fmt(totals.expense)}</td>
              <td className={`px-4 py-3 text-right ${totals.balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {fmt(totals.balance)}
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
