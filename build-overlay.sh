#!/bin/bash

# Скрипт сборки overlay-only расширения ZeroOmega Failure Catcher
echo "🔨 Сборка overlay-only расширения ZeroOmega Failure Catcher..."

# Создаем директорию для сборки
BUILD_DIR="build-overlay"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Копируем только overlay файлы
echo "📁 Копирование overlay файлов..."
cp -r omega-target-chromium-extension/overlay/* "$BUILD_DIR/"

# Создаем README для установки
cat > "$BUILD_DIR/INSTALL.md" << 'EOF'
# Установка расширения ZeroOmega Failure Catcher

## Способ 1: Unpacked Extension (рекомендуется для разработки)

1. Откройте Orion или Chromium
2. Перейдите в **Settings → Extensions** (или **chrome://extensions/**)
3. Включите **Developer Mode** (переключатель в правом верхнем углу)
4. Нажмите **Load Unpacked**
5. Выберите папку с этим расширением
6. Расширение будет установлено и появится в списке

## Способ 2: Упакованное расширение

1. В браузере перейдите в **Settings → Extensions**
2. Включите **Developer Mode**
3. Нажмите **Pack Extension**
4. Выберите папку с этим расширением
5. Скачайте .crx файл
6. Перетащите .crx файл в окно браузера для установки

## Проверка работы

После установки:
1. Откройте popup расширения (иконка в панели инструментов)
2. Попробуйте зайти на несуществующий сайт (например, test123456789.com)
3. В popup должен появиться неудачный домен
4. Нажмите "Add selected to Proxy" для отправки на локальный endpoint

## Локальный endpoint

Расширение отправляет данные на: http://127.0.0.1:9099/add-domain
Убедитесь, что у вас запущен соответствующий сервис.

## Функции

- ✅ Захват неудачных сетевых запросов (network errors + HTTP ≥ 400)
- ✅ Список доменов с чекбоксами (сортировка по времени)
- ✅ Select all / Clear selection / Clear all
- ✅ Фильтрация доменов
- ✅ Добавление выбранных доменов в прокси
- ✅ Ручное добавление доменов
- ✅ Автоматическое удаление успешно добавленных доменов (PRUNE)
- ✅ Подробное логирование всех действий
- ✅ Подсчет hits для повторяющихся ошибок

## Архитектура

- **MV3 classic service worker** (без модулей)
- **Ring buffer** - максимум ~200 элементов
- **Debounce** - подавление дублирующихся событий
- **Normalize** - фильтрация IPs и telemetry/CDN noise
- **Message API** - GET/CLEAR/PRUNE/ADD_TO_PROXY
EOF

echo "✅ Сборка завершена!"
echo "📁 Файлы расширения находятся в папке: $BUILD_DIR"
echo "📖 Инструкция по установке: $BUILD_DIR/INSTALL.md"
echo ""
echo "🚀 Для установки в Orion/Chromium:"
echo "1. Откройте Settings → Extensions"
echo "2. Включите Developer Mode"
echo "3. Нажмите Load Unpacked"
echo "4. Выберите папку: $BUILD_DIR"
echo ""
echo "📦 Файлы в сборке:"
ls -la "$BUILD_DIR"
