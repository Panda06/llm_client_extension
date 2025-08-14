# LLM Client Extension для JupyterLab

Расширение для JupyterLab, позволяющее отправлять запросы к LLM API прямо из интерфейса.

## Установка

```bash
# Установить зависимости
npm install

# Собрать расширение
npm run build

# Установить в JupyterLab
pip install -e .
```

## Использование

1. Откройте панель "LLM Assistant" в левом сайдбаре JupyterLab
2. Введите URL вашего LLM API
3. Напишите сообщение и нажмите "Send"
4. Используйте "Insert to Cell" для вставки ответа в активную ячейку

## Возможности

- ✨ Современный дизайн с эмодзи
- 🚀 Потоковые ответы в реальном времени
- 📝 Вставка ответов в ячейки Notebook
- 💾 Автосохранение настроек
- ⌨️ Горячие клавиши (Ctrl+Enter)

## Архитектура

- `src/` - исходный код TypeScript
- `style/` - CSS стили
- `schema/` - JSON схема настроек
- `llm_client_extension/` - Python пакет