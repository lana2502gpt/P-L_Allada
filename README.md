# Cash Flow Report Analysis (SPA)

Клиентское веб-приложение для сводного анализа движения денежных средств по сети клиник.

## Быстрый старт (Windows / macOS / Linux)

> Если вы видите ошибку `"vite" не является внутренней или внешней командой`, **не запускайте `vite` напрямую**.
> Запускайте проект только через npm-скрипты.

### 1) Установить зависимости

```bash
npm install
```

### 2) Запустить dev-сервер

```bash
npm run dev
```

### 3) Сборка production

```bash
npm run build
```

### 4) Локальный preview production-сборки

```bash
npm run preview
```

## Почему возникает ошибка с `vite`

Команда `vite` обычно доступна из `node_modules/.bin` внутри npm-скриптов.
Если запускать `vite` напрямую в терминале (особенно в PowerShell), он может быть не найден в `PATH`.

Поэтому используйте:

- ✅ `npm run dev`
- ✅ `npm run build`
- ✅ `npm run preview`
- ❌ `vite`

## Требования

- Node.js 18+ (рекомендуется LTS)
- npm 9+
