import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Link, X, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { parseExcelFile, parseGoogleSheet } from '@/utils/parser';
import type { DataSource } from '@/types';

let sourceIdCounter = 0;

export function FileUpload() {
  const { state, dispatch } = useAppContext();
  const [googleUrl, setGoogleUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [counterpartyConfig, setCounterpartyConfig] = useState<{ sourceId: string; sheetName: string; columnName: string } | null>(null);
  const [articleConfig, setArticleConfig] = useState<{ sourceId: string; sheetName: string; columnName: string } | null>(null);
  const [dictionaryNotice, setDictionaryNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addSource = useCallback(async (
    name: string,
    type: 'file' | 'google_sheets',
    loader: () => ReturnType<typeof parseExcelFile>,
    url?: string,
  ) => {
    const normalizedUrl = (url || '').trim();
    const duplicateSource = state.sources.find((s) => {
      if (s.type !== type) return false;
      if (type === 'google_sheets') {
        return (s.url || '').trim() === normalizedUrl;
      }
      // Для файлов одинаковое имя не всегда означает дубликат
      // (например, выгрузки из разных банков с одинаковым названием).
      return false;
    });

    if (duplicateSource) {
      alert('Источник уже загружен. Удалите дубликат или добавьте другой файл/ссылку.');
      return;
    }

    const id = `src_${++sourceIdCounter}_${Date.now()}`;

    const source: DataSource = {
      id,
      name,
      type,
      url,
      status: 'loading',
      sheets: [],
      transactions: [],
      articles: [],
      counterparties: [],
      sheetProfiles: [],
    };

    dispatch({ type: 'ADD_SOURCE', payload: source });

    try {
      const result = await loader();
      // Заполняем sourceId в каждом листе
      const sheetsWithId = result.sheets.map(sh => ({ ...sh, sourceId: id }));
      dispatch({
        type: 'UPDATE_SOURCE',
        payload: {
          id,
          updates: {
            status: 'ready',
            sheets: sheetsWithId,
            transactions: result.transactions,
            articles: result.articles,
            counterparties: result.counterparties,
            sheetProfiles: result.sheetProfiles,
            name: result.name,
          },
        },
      });
    } catch (err) {
      dispatch({
        type: 'UPDATE_SOURCE',
        payload: {
          id,
          updates: {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          },
        },
      });
    }
  }, [dispatch, state.sources]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
        addSource(file.name, 'file', () => parseExcelFile(file));
      }
    });
  }, [addSource]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleGoogleSheetAdd = useCallback(() => {
    const url = googleUrl.trim();
    if (!url) return;
    addSource('Загрузка Google Sheet...', 'google_sheets', () => parseGoogleSheet(url), url);
    setGoogleUrl('');
  }, [googleUrl, addSource]);

  const removeSource = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_SOURCE', payload: id });
  }, [dispatch, state.sources]);

  const sheetTypeLabel = (type: string) => {
    switch (type) {
      case 'cash_journal': return '💰 Касса';
      case 'bank_journal': return '🏦 Р/С';
      case 'reference': return '📋 Справочник';
      default: return '❓ Неизвестный';
    }
  };

  const readySources = state.sources.filter(s => s.status === 'ready');
  const hasJournals = readySources.some(s => s.sheets.some(sh => sh.type === 'cash_journal' || sh.type === 'bank_journal'));


  const sourceOptions = readySources.map(source => ({
    sourceId: source.id,
    sourceName: source.name,
    profiles: source.sheetProfiles,
  }));


  const getActiveProfilesForSource = (sourceId?: string) => {
    if (!sourceId) return [];
    const source = readySources.find(s => s.id === sourceId);
    if (!source) return [];

    const activeSheetNames = new Set(
      source.sheets
        .filter(sh => sh.type !== 'unknown' && sh.rowCount > 0)
        .map(sh => sh.name),
    );

    return source.sheetProfiles.filter(profile => activeSheetNames.has(profile.sheetName));
  };



  useEffect(() => {
    if (readySources.length !== 1) return;

    const onlySource = readySources[0];
    const defaultProfile = onlySource.sheetProfiles[0];
    const defaultColumn = defaultProfile?.columns[0] || '';

    if (!counterpartyConfig) {
      setCounterpartyConfig({
        sourceId: onlySource.id,
        sheetName: defaultProfile?.sheetName || '',
        columnName: defaultColumn,
      });
    }

    if (!articleConfig) {
      setArticleConfig({
        sourceId: onlySource.id,
        sheetName: defaultProfile?.sheetName || '',
        columnName: defaultColumn,
      });
    }
  }, [readySources, counterpartyConfig, articleConfig]);

  const buildFallbackConfig = useCallback((
    target: 'counterparties' | 'articles',
  ): { sourceId: string; sheetName: string; columnName: string } | null => {
    const source = readySources[0];
    if (!source) return null;

    const profile = source.sheetProfiles[0];
    if (!profile) return null;

    const keyword = target === 'counterparties' ? 'контрагент' : 'статья';

    const columnByKeyword = profile.columns.find((col) => col.toLowerCase().includes(keyword));

    return {
      sourceId: source.id,
      sheetName: profile.sheetName,
      columnName: columnByKeyword || profile.columns[0] || '',
    };
  }, [readySources]);
  const getColumnsForConfig = (sourceId?: string, sheetName?: string) => {
    if (!sourceId || !sheetName) return [];
    const source = readySources.find(s => s.id === sourceId);
    const profile = source?.sheetProfiles.find(sp => sp.sheetName === sheetName);
    return profile?.columns || [];
  };

  const getValuesForConfig = (config: { sourceId: string; sheetName: string; columnName: string } | null) => {
    if (!config) return [] as string[];
    const source = readySources.find(s => s.id === config.sourceId);
    const profile = source?.sheetProfiles.find(sp => sp.sheetName === config.sheetName);
    if (!profile) return [] as string[];

    const values = (profile.valuesByColumn[config.columnName] || [])
      .map(v => String(v || '').trim())
      .filter(Boolean);

    return Array.from(new Set(values));
  };


  const applyReferenceFromColumn = useCallback((
    config: { sourceId: string; sheetName: string; columnName: string } | null,
    target: 'counterparties' | 'articles',
  ) => {
    const effectiveConfig = config && config.sourceId && config.sheetName && config.columnName
      ? config
      : buildFallbackConfig(target);

    if (!effectiveConfig || !effectiveConfig.sourceId || !effectiveConfig.sheetName || !effectiveConfig.columnName) {
      setDictionaryNotice({ kind: 'error', text: 'Выберите источник, лист и столбец.' });
      return;
    }

    const source = readySources.find(s => s.id === effectiveConfig.sourceId);
    const profile = source?.sheetProfiles.find(sp => sp.sheetName === effectiveConfig.sheetName);
    if (!source || !profile) {
      setDictionaryNotice({ kind: 'error', text: 'Не удалось найти выбранный источник или лист.' });
      return;
    }

    const values = getValuesForConfig(effectiveConfig);

    if (values.length === 0) {
      setDictionaryNotice({ kind: 'error', text: 'В выбранном столбце нет данных для загрузки.' });
      return;
    }

    if (target === 'counterparties') {
      dispatch({
        type: 'UPDATE_SOURCE',
        payload: {
          id: source.id,
          updates: { counterparties: values.map(v => ({ name: v })) },
        },
      });
      setDictionaryNotice({ kind: 'success', text: `Загружено контрагентов: ${values.length}` });
      return;
    }

    dispatch({
      type: 'UPDATE_SOURCE',
      payload: {
        id: source.id,
        updates: {
          articles: values.map(v => ({
            name: v,
            group: '',
            activityType: '',
            comment: '',
          })),
        },
      },
    });
    setDictionaryNotice({ kind: 'success', text: `Загружено статей: ${values.length}` });
  }, [dispatch, readySources, buildFallbackConfig]);


  useEffect(() => {
    setDictionaryNotice(null);
  }, [counterpartyConfig, articleConfig]);

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Загрузка данных</h2>
        <p className="mt-1 text-sm text-slate-500">
          Загрузите Excel-файлы или вставьте ссылки на Google Таблицы
        </p>
      </div>

      {/* Drag & Drop зона */}
      <div
        className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-all ${
          isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className={`mx-auto h-10 w-10 ${isDragOver ? 'text-blue-500' : 'text-slate-400'}`} />
        <p className="mt-3 text-sm font-medium text-slate-700">
          Перетащите файлы .xlsx сюда
        </p>
        <p className="mt-1 text-xs text-slate-500">
          или{' '}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-blue-600 underline hover:text-blue-700"
          >
            выберите файлы
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Google Sheets URL */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={googleUrl}
            onChange={(e) => setGoogleUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGoogleSheetAdd()}
            placeholder="Вставьте ссылку на Google Таблицу..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <button
          onClick={handleGoogleSheetAdd}
          disabled={!googleUrl.trim()}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Добавить
        </button>
      </div>

      {/* Список загруженных источников */}
      {state.sources.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Загруженные источники ({state.sources.length})
          </h3>
          <div className="space-y-2">
            {state.sources.map((source) => (
              <div
                key={source.id}
                className={`rounded-lg border p-4 transition-all ${
                  source.status === 'error'
                    ? 'border-red-200 bg-red-50'
                    : source.status === 'loading'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-green-200 bg-green-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    {source.status === 'loading' && (
                      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-600" />
                    )}
                    {source.status === 'ready' && (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                    )}
                    {source.status === 'error' && (
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {source.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {source.type === 'google_sheets' ? '(Google)' : '(Файл)'}
                        </span>
                      </div>

                      {source.status === 'error' && (
                        <p className="mt-1 text-xs text-red-600">{source.error}</p>
                      )}

                      {source.status === 'ready' && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-slate-600">
                            <span className="font-medium">{source.transactions.length}</span> операций
                            {source.articles.length > 0 && (
                              <> · <span className="font-medium">{source.articles.length}</span> статей</>
                            )}
                            {source.counterparties.length > 0 && (
                              <> · <span className="font-medium">{source.counterparties.length}</span> контрагентов</>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {source.sheets.map((sheet) => (
                              <span
                                key={sheet.name}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                  sheet.type === 'cash_journal'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : sheet.type === 'bank_journal'
                                    ? 'bg-blue-100 text-blue-700'
                                    : sheet.type === 'reference'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {sheetTypeLabel(sheet.type)} {sheet.name}
                                {sheet.type !== 'unknown' && (
                                  <span className="opacity-60">({sheet.rowCount})</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => removeSource(source.id)}
                    className="ml-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/60 hover:text-red-500"
                  >
                    {source.status === 'loading' ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {readySources.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wide">
              Настройка справочников
            </h3>
            <p className="mt-1 text-xs text-amber-700">
              Выберите лист и столбец для загрузки справочника контрагентов и статей затрат.
            </p>
          </div>

          {dictionaryNotice && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${
              dictionaryNotice.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              {dictionaryNotice.text}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-amber-200 bg-white p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-700">Контрагенты</p>
              <select
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                value={counterpartyConfig?.sourceId || ''}
                onChange={(e) => setCounterpartyConfig({ sourceId: e.target.value, sheetName: '', columnName: '' })}
              >
                <option value="">Источник</option>
                {sourceOptions.map(src => (
                  <option key={src.sourceId} value={src.sourceId}>{src.sourceName}</option>
                ))}
              </select>
              <select
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                value={counterpartyConfig?.sheetName || ''}
                onChange={(e) => setCounterpartyConfig(prev => prev ? { ...prev, sheetName: e.target.value, columnName: '' } : null)}
                disabled={!counterpartyConfig?.sourceId}
              >
                <option value="">Лист</option>
                {getActiveProfilesForSource(counterpartyConfig?.sourceId).map(profile => (
                  <option key={profile.sheetName} value={profile.sheetName}>{profile.sheetName}</option>
                ))}
              </select>
              <select
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                value={counterpartyConfig?.columnName || ''}
                onChange={(e) => setCounterpartyConfig(prev => prev ? { ...prev, columnName: e.target.value } : null)}
                disabled={!counterpartyConfig?.sheetName}
              >
                <option value="">Столбец</option>
                {getColumnsForConfig(counterpartyConfig?.sourceId, counterpartyConfig?.sheetName).map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">В выбранном столбце: {getValuesForConfig(counterpartyConfig).length}</p>
              <button
                type="button"
                onClick={() => applyReferenceFromColumn(counterpartyConfig, 'counterparties')}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Загрузить контрагентов
              </button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-white p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-700">Статьи затрат</p>
              <select
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                value={articleConfig?.sourceId || ''}
                onChange={(e) => setArticleConfig({ sourceId: e.target.value, sheetName: '', columnName: '' })}
              >
                <option value="">Источник</option>
                {sourceOptions.map(src => (
                  <option key={src.sourceId} value={src.sourceId}>{src.sourceName}</option>
                ))}
              </select>
              <select
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                value={articleConfig?.sheetName || ''}
                onChange={(e) => setArticleConfig(prev => prev ? { ...prev, sheetName: e.target.value, columnName: '' } : null)}
                disabled={!articleConfig?.sourceId}
              >
                <option value="">Лист</option>
                {getActiveProfilesForSource(articleConfig?.sourceId).map(profile => (
                  <option key={profile.sheetName} value={profile.sheetName}>{profile.sheetName}</option>
                ))}
              </select>
              <select
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                value={articleConfig?.columnName || ''}
                onChange={(e) => setArticleConfig(prev => prev ? { ...prev, columnName: e.target.value } : null)}
                disabled={!articleConfig?.sheetName}
              >
                <option value="">Столбец</option>
                {getColumnsForConfig(articleConfig?.sourceId, articleConfig?.sheetName).map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">В выбранном столбце: {getValuesForConfig(articleConfig).length}</p>
              <button
                type="button"
                onClick={() => applyReferenceFromColumn(articleConfig, 'articles')}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                Загрузить статьи
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === ВЫБОР ЛИСТОВ ДЛЯ АНАЛИЗА === */}
      {hasJournals && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-indigo-800 uppercase tracking-wide flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Выбор листов для анализа
            </h3>
            <p className="mt-1 text-xs text-indigo-600">
              Отметьте журналы, которые нужно включить в анализ. Снятые галочки исключат данные из отчётов.
            </p>
          </div>

          {readySources.map(source => {
            const journals = source.sheets.filter(sh => sh.type === 'cash_journal' || sh.type === 'bank_journal');
            if (journals.length === 0) return null;

            const allSelected = journals.every(sh => sh.selected);
            const noneSelected = journals.every(sh => !sh.selected);
            const someSelected = !allSelected && !noneSelected;

            return (
              <div key={source.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 truncate max-w-[200px]" title={source.name}>
                    📄 {source.name}
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={() =>
                        dispatch({
                          type: 'SET_ALL_SHEETS_SELECTION',
                          payload: { sourceId: source.id, selected: !allSelected },
                        })
                      }
                      className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-[10px] text-slate-500 font-medium">Все</span>
                  </label>
                </div>

                <div className="grid gap-1.5 sm:grid-cols-2">
                  {journals.map(sheet => {
                    const txCount = source.transactions.filter(t => t.sheet === sheet.name).length;
                    return (
                      <label
                        key={sheet.name}
                        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-all ${
                          sheet.selected
                            ? 'border-indigo-300 bg-white shadow-sm'
                            : 'border-slate-200 bg-slate-50 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={sheet.selected}
                          onChange={() =>
                            dispatch({
                              type: 'TOGGLE_SHEET_SELECTION',
                              payload: { sourceId: source.id, sheetName: sheet.name },
                            })
                          }
                          className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">
                              {sheet.type === 'cash_journal' ? '💰' : '🏦'}
                            </span>
                            <span className="text-xs font-medium text-slate-800 truncate">{sheet.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {txCount} операций · {sheet.type === 'cash_journal' ? 'Касса' : 'Р/С'}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Пустое состояние */}
      {state.sources.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Файлы ещё не загружены. Загрузите .xlsx файл или добавьте ссылку на Google Таблицу.
          </p>
        </div>
      )}
    </div>
  );
}
