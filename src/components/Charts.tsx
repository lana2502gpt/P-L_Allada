import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  Line,
  AreaChart, Area,
} from 'recharts';
import { BarChart3, PieChart as PieIcon, TrendingUp, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { format, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';

// ========== Цветовая палитра ==========
const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#d946ef',
  '#22c55e', '#eab308', '#64748b', '#f43f5e', '#2dd4bf',
];

function formatMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + ' млн';
  }
  if (Math.abs(n) >= 1_000) {
    return (n / 1_000).toFixed(0) + ' тыс';
  }
  return n.toFixed(0);
}

function formatMoneyFull(n: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

type ChartView = 'monthly' | 'articles' | 'dynamics' | 'counterparties';

// ========== Кастомный тултип для столбчатого графика ==========

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomBarTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-2 text-sm font-semibold text-slate-800">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-semibold text-slate-800">{formatMoneyFull(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ========== Кастомный тултип для круговой диаграммы ==========

interface PieTooltipPayloadItem {
  name: string;
  value: number;
  payload: { name: string; value: number; fill: string; percent: number };
}

interface PieTooltipProps {
  active?: boolean;
  payload?: PieTooltipPayloadItem[];
}

function CustomPieTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload || !payload[0]) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-sm font-semibold text-slate-800">{item.name}</p>
      <p className="text-sm text-slate-600">{formatMoneyFull(item.value)}</p>
      <p className="text-xs text-slate-400">{(item.payload.percent * 100).toFixed(1)}%</p>
    </div>
  );
}

// ========== Главный компонент ==========

export function Charts() {
  const { filteredTransactions } = useAppContext();
  const [activeChart, setActiveChart] = useState<ChartView>('monthly');
  const [showTopN, setShowTopN] = useState(15);
  const [expandedChart, setExpandedChart] = useState(true);

  // ========== Данные для столбчатого графика: помесячно ==========
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; sortKey: string; income: number; expense: number }>();

    for (const t of filteredTransactions) {
      if (!t.date || isNaN(t.date.getTime())) continue;
      const monthStart = startOfMonth(t.date);
      const key = format(monthStart, 'yyyy-MM');
      const label = format(monthStart, 'LLL yyyy', { locale: ru });

      if (!map.has(key)) {
        map.set(key, { month: label, sortKey: key, income: 0, expense: 0 });
      }
      const entry = map.get(key)!;
      if (t.direction === 'in') {
        entry.income += t.amount;
      } else {
        entry.expense += t.amount;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [filteredTransactions]);

  // ========== Данные для круговой диаграммы: по статьям ==========
  const articlesPieData = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of filteredTransactions) {
      const article = t.article || 'Без статьи';
      map.set(article, (map.get(article) || 0) + t.amount);
    }

    const sorted = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Топ N + "Прочие"
    if (sorted.length > showTopN) {
      const top = sorted.slice(0, showTopN);
      const otherSum = sorted.slice(showTopN).reduce((s, v) => s + v.value, 0);
      top.push({ name: `Прочие (${sorted.length - showTopN})`, value: otherSum });
      return top;
    }

    return sorted;
  }, [filteredTransactions, showTopN]);

  // ========== Данные для линейного графика: динамика ==========
  const dynamicsData = useMemo(() => {
    const map = new Map<string, { month: string; sortKey: string; total: number; cumulative: number }>();

    for (const t of filteredTransactions) {
      if (!t.date || isNaN(t.date.getTime())) continue;
      const monthStart = startOfMonth(t.date);
      const key = format(monthStart, 'yyyy-MM');
      const label = format(monthStart, 'LLL yyyy', { locale: ru });

      if (!map.has(key)) {
        map.set(key, { month: label, sortKey: key, total: 0, cumulative: 0 });
      }
      const entry = map.get(key)!;
      entry.total += t.direction === 'in' ? t.amount : -t.amount;
    }

    const sorted = Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Кумулятивное сальдо
    let cum = 0;
    for (const entry of sorted) {
      cum += entry.total;
      entry.cumulative = cum;
    }

    return sorted;
  }, [filteredTransactions]);

  // ========== Данные для графика по контрагентам ==========
  const counterpartyData = useMemo(() => {
    const map = new Map<string, { name: string; income: number; expense: number; total: number }>();

    for (const t of filteredTransactions) {
      const cp = t.counterparty || 'Не указан';
      if (!map.has(cp)) {
        map.set(cp, { name: cp, income: 0, expense: 0, total: 0 });
      }
      const entry = map.get(cp)!;
      if (t.direction === 'in') {
        entry.income += t.amount;
      } else {
        entry.expense += t.amount;
      }
      entry.total += t.amount;
    }

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
  }, [filteredTransactions]);

  if (filteredTransactions.length === 0) return null;

  const chartTabs: { key: ChartView; label: string; icon: React.ElementType }[] = [
    { key: 'monthly', label: 'По месяцам', icon: BarChart3 },
    { key: 'articles', label: 'По статьям', icon: PieIcon },
    { key: 'dynamics', label: 'Динамика', icon: TrendingUp },
    { key: 'counterparties', label: 'Контрагенты', icon: Users },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => setExpandedChart(!expandedChart)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-700 uppercase tracking-wide hover:text-slate-900"
        >
          <BarChart3 className="h-4 w-4" />
          Графики
          {expandedChart ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {expandedChart && (
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {chartTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveChart(tab.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  activeChart === tab.key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart Content */}
      {expandedChart && (
        <div className="p-4">
          {/* === Столбчатый: По месяцам === */}
          {activeChart === 'monthly' && (
            <div>
              <p className="mb-4 text-xs text-slate-500">Поступления и выбытия по месяцам</p>
              {monthlyData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Нет данных для отображения</p>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={formatMoney}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      iconType="circle"
                    />
                    <Bar dataKey="income" name="Поступления" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Выбытия" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* === Круговая: По статьям === */}
          {activeChart === 'articles' && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs text-slate-500">Распределение сумм по статьям ДДС</p>
                <select
                  value={showTopN}
                  onChange={(e) => setShowTopN(Number(e.target.value))}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value={10}>Топ 10</option>
                  <option value={15}>Топ 15</option>
                  <option value={20}>Топ 20</option>
                  <option value={30}>Топ 30</option>
                  <option value={999}>Все</option>
                </select>
              </div>

              {articlesPieData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Нет данных для отображения</p>
              ) : (
                <div className="flex flex-col items-center gap-6 lg:flex-row">
                  <div className="w-full lg:w-1/2">
                    <ResponsiveContainer width="100%" height={400}>
                      <PieChart>
                        <Pie
                          data={articlesPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={160}
                          paddingAngle={1}
                          dataKey="value"
                        >
                          {articlesPieData.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Легенда */}
                  <div className="w-full space-y-1 lg:w-1/2">
                    <div className="max-h-[400px] overflow-y-auto pr-2">
                      {articlesPieData.map((item, i) => {
                        const total = articlesPieData.reduce((s, v) => s + v.value, 0);
                        const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0';
                        return (
                          <div key={item.name} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <div
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: COLORS[i % COLORS.length] }}
                            />
                            <span className="flex-1 truncate text-xs text-slate-700" title={item.name}>
                              {item.name}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-slate-600">
                              {formatMoneyFull(item.value)}
                            </span>
                            <span className="shrink-0 w-12 text-right text-[10px] text-slate-400">
                              {percent}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === Линейный: Динамика === */}
          {activeChart === 'dynamics' && (
            <div>
              <p className="mb-4 text-xs text-slate-500">Чистый денежный поток и кумулятивное сальдо по месяцам</p>
              {dynamicsData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Нет данных для отображения</p>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={dynamicsData} margin={{ top: 5, right: 20, left: 20, bottom: 40 }}>
                    <defs>
                      <linearGradient id="gradCumulative" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={formatMoney}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      name="Кумулятивное сальдо"
                      stroke="#3b82f6"
                      fill="url(#gradCumulative)"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Чистый поток"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* === Горизонтальный бар: Контрагенты === */}
          {activeChart === 'counterparties' && (
            <div>
              <p className="mb-4 text-xs text-slate-500">Топ-20 контрагентов по суммам операций</p>
              {counterpartyData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Нет данных для отображения</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(400, counterpartyData.length * 35)}>
                  <BarChart
                    data={counterpartyData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={formatMoney}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      width={180}
                    />
                    <Tooltip content={<CustomBarTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                    <Bar dataKey="income" name="Поступления" fill="#10b981" radius={[0, 4, 4, 0]} stackId="stack" />
                    <Bar dataKey="expense" name="Выбытия" fill="#ef4444" radius={[0, 4, 4, 0]} stackId="stack" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
