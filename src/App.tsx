import { useState } from 'react';
import { BarChart3, Upload, Table2, Menu, X } from 'lucide-react';
import { AppProvider, useAppContext } from '@/context/AppContext';
import { FileUpload } from '@/components/FileUpload';
import { FilterSidebar } from '@/components/FilterSidebar';
import { Dashboard } from '@/components/Dashboard';
import { Charts } from '@/components/Charts';
import { GroupedReport } from '@/components/GroupedReport';
import { TransactionsTable } from '@/components/TransactionsTable';

type Tab = 'upload' | 'analysis';

function AppContent() {
  const { allTransactions } = useAppContext();
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const hasData = allTransactions.length > 0;

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile sidebar toggle */}
            {activeTab === 'analysis' && hasData && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600">
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-lg font-bold text-slate-800">Анализ ДДС</h1>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                activeTab === 'upload'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Загрузка</span>
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              disabled={!hasData}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                activeTab === 'analysis'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Table2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Анализ</span>
              {hasData && (
                <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-100 px-1.5 text-[10px] font-bold text-blue-700">
                  {allTransactions.length}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'upload' && (
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="mx-auto max-w-3xl">
              <FileUpload />

              {/* Подсказка для перехода к анализу */}
              {hasData && (
                <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
                  <p className="text-sm text-blue-800">
                    Данные загружены!{' '}
                    <button
                      onClick={() => setActiveTab('analysis')}
                      className="font-semibold underline hover:text-blue-900"
                    >
                      Перейти к анализу →
                    </button>
                  </p>
                </div>
              )}
            </div>
          </main>
        )}

        {activeTab === 'analysis' && hasData && (
          <>
            {/* Sidebar с фильтрами */}
            {/* Мобильный оверлей */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/30 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <aside
              className={`fixed inset-y-14 left-0 z-40 w-72 transform overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-lg transition-transform lg:relative lg:inset-y-0 lg:z-0 lg:translate-x-0 lg:shadow-none ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            >
              <FilterSidebar />
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto p-4 lg:p-6">
              <div className="space-y-6">
                <Dashboard />
                <Charts />
                <GroupedReport />
                <TransactionsTable />
              </div>
            </main>
          </>
        )}

        {activeTab === 'analysis' && !hasData && (
          <main className="flex flex-1 items-center justify-center p-8">
            <div className="text-center">
              <Upload className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                Сначала загрузите данные на вкладке «Загрузка»
              </p>
              <button
                onClick={() => setActiveTab('upload')}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Загрузить данные
              </button>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
