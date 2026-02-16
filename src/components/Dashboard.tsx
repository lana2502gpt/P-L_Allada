import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Activity, Hash } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';

function formatMoney(n: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function Dashboard() {
  const { filteredTransactions } = useAppContext();

  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let count = 0;

    for (const t of filteredTransactions) {
      if (t.direction === 'in') totalIn += t.amount;
      else totalOut += t.amount;
      count++;
    }

    return {
      totalIn,
      totalOut,
      balance: totalIn - totalOut,
      count,
    };
  }, [filteredTransactions]);

  if (filteredTransactions.length === 0) return null;

  const cards = [
    {
      title: 'Поступления',
      value: formatMoney(stats.totalIn),
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
      iconBg: 'bg-green-100',
    },
    {
      title: 'Выбытия',
      value: formatMoney(stats.totalOut),
      icon: TrendingDown,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
      iconBg: 'bg-red-100',
    },
    {
      title: 'Сальдо',
      value: formatMoney(stats.balance),
      icon: Activity,
      color: stats.balance >= 0 ? 'text-blue-600' : 'text-orange-600',
      bg: stats.balance >= 0 ? 'bg-blue-50' : 'bg-orange-50',
      border: stats.balance >= 0 ? 'border-blue-200' : 'border-orange-200',
      iconBg: stats.balance >= 0 ? 'bg-blue-100' : 'bg-orange-100',
    },
    {
      title: 'Операций',
      value: stats.count.toLocaleString('ru-RU'),
      icon: Hash,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      iconBg: 'bg-purple-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`rounded-xl border ${card.border} ${card.bg} p-4 transition-shadow hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{card.title}</p>
            <div className={`rounded-lg ${card.iconBg} p-2`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </div>
          <p className={`mt-2 text-xl font-bold ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}
