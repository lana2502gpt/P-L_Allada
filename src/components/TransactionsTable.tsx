import { useMemo, useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import type { Transaction } from '@/types';

const PAGE_SIZE = 50;

function formatDate(d: Date): string {
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

type SortKey = 'date' | 'amount' | 'article' | 'sheet' | 'counterparty' | 'branch';

export function TransactionsTable() {
  const { filteredTransactions } = useAppContext();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const arr = [...filteredTransactions];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'date': cmp = a.date.getTime() - b.date.getTime(); break;
        case 'amount': cmp = a.amount - b.amount; break;
        case 'article': cmp = a.article.localeCompare(b.article, 'ru'); break;
        case 'sheet': cmp = a.sheet.localeCompare(b.sheet, 'ru'); break;
        case 'counterparty': cmp = a.counterparty.localeCompare(b.counterparty, 'ru'); break;
        case 'branch': cmp = a.branch.localeCompare(b.branch, 'ru'); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [filteredTransactions, sortKey, sortAsc]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalSum = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const t of filteredTransactions) {
      if (t.direction === 'in') inSum += t.amount;
      else outSum += t.amount;
    }
    return { inSum, outSum };
  }, [filteredTransactions]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
    setPage(0);
  };

  if (filteredTransactions.length === 0) return null;

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide hover:text-slate-900"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? 'text-blue-600' : 'text-slate-400'}`} />
      </span>
    </th>
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
        Детализация операций ({filteredTransactions.length.toLocaleString('ru-RU')})
      </h3>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortHeader label="Дата" field="date" />
              <SortHeader label="Журнал" field="sheet" />
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Источник</th>
              <SortHeader label="Филиал" field="branch" />
              <SortHeader label="Контрагент" field="counterparty" />
              <SortHeader label="Статья" field="article" />
              <SortHeader label="Сумма" field="amount" />
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Примечание</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Мес. начисления</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageData.map((t: Transaction) => (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">{formatDate(t.date)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{t.sheet}</td>
                <td className="max-w-[120px] truncate px-3 py-2 text-xs text-slate-500" title={t.source}>{t.source}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{t.branch || '—'}</td>
                <td className="max-w-[160px] truncate px-3 py-2 text-xs text-slate-600" title={t.counterparty}>{t.counterparty || '—'}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-xs text-slate-700 font-medium" title={t.article}>{t.article || '—'}</td>
                <td className={`whitespace-nowrap px-3 py-2 text-xs font-semibold text-right ${
                  t.direction === 'in' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatMoney(t.amount)}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-500" title={t.note}>{t.note || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{t.accrualMonth || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-300">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-xs font-bold text-slate-700 text-right uppercase">
                Итого:
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                <div className="text-xs font-bold text-green-600">{formatMoney(totalSum.inSum)}</div>
                <div className="text-xs font-bold text-red-600">{formatMoney(totalSum.outSum)}</div>
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-slate-500">
            Показаны {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} из {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 7 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`h-7 min-w-[28px] rounded-lg px-2 text-xs font-medium transition-colors ${
                    page === pageNum
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
