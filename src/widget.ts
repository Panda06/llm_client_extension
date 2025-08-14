import { Widget } from '@lumino/widgets';
import { JupyterFrontEnd } from '@jupyterlab/application';

/**
 * LLM Client Widget
 */
export class LLMClientWidget extends Widget {
  private app: JupyterFrontEnd;

  constructor(app: JupyterFrontEnd) {
    super();
    this.app = app;
    this.addClass('llm-client-widget');
    this.id = 'llm-client-widget';
    this.title.label = 'LLM Client';
    this.title.closable = true;
    this.createContent();
  }

  private createContent(): void {
    const container = document.createElement('div');
    container.className = 'llm-client-container';
    container.innerHTML = `
      <div class="llm-client-header">
        <h3>✨ LLM Assistant</h3>
      </div>
      
      <div class="llm-client-form">
        <div class="form-group">
          <label>Host:</label>
          <input type="text" id="llm-host" placeholder="10.1.5.1" />
        </div>
        
        <div class="form-group">
          <label>Port:</label>
          <input type="text" id="llm-port" placeholder="1088" />
        </div>
        
        <div class="form-group">
          <label>Model:</label>
          <input type="text" id="llm-model" placeholder="vllm_model" />
        </div>
        
        <div class="form-group">
          <label>💬 Your Message:</label>
          <textarea id="llm-prompt" rows="4" placeholder="Ask me anything..."></textarea>
        </div>
        
        <div class="form-actions">
          <button id="llm-send-btn" class="btn-primary">🚀 Send</button>
          <button id="llm-clear-btn" class="btn-secondary">🗑️ Clear</button>
        </div>
        
        <div class="form-group">
          <label>🤖 AI Response:</label>
          <div id="llm-response" class="response-area"></div>
          <button id="llm-insert-btn" class="btn-secondary">📝 Insert to Cell</button>
        </div>
        
        <div id="llm-status" class="status-area"></div>
      </div>
    `;

    this.node.appendChild(container);
    this.setupEventListeners();
    this.loadSettings();
  }

  private setupEventListeners(): void {
    const sendBtn = this.node.querySelector('#llm-send-btn') as HTMLButtonElement;
    const clearBtn = this.node.querySelector('#llm-clear-btn') as HTMLButtonElement;
    const insertBtn = this.node.querySelector('#llm-insert-btn') as HTMLButtonElement;
    const promptArea = this.node.querySelector('#llm-prompt') as HTMLTextAreaElement;

    sendBtn?.addEventListener('click', () => this.sendRequestViaKernel());
    clearBtn?.addEventListener('click', () => this.clearResponse());
    insertBtn?.addEventListener('click', () => this.insertToCell());

    // Ctrl+Enter support
    promptArea?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.sendRequestViaKernel();
      }
    });

    // Auto-save settings
    ['llm-host', 'llm-port', 'llm-model'].forEach(id => {
      const el = this.node.querySelector(`#${id}`) as HTMLInputElement;
      el?.addEventListener('input', () => this.saveSettings());
    });
  }

  private async sendRequest(): Promise<void> {
    const host = (this.node.querySelector('#llm-host') as HTMLInputElement)?.value?.trim();
    const port = (this.node.querySelector('#llm-port') as HTMLInputElement)?.value?.trim();
    const model = (this.node.querySelector('#llm-model') as HTMLInputElement)?.value?.trim();
    const prompt = (this.node.querySelector('#llm-prompt') as HTMLTextAreaElement)?.value?.trim();
    const responseDiv = this.node.querySelector('#llm-response') as HTMLDivElement;

    if (!host || !port || !model || !prompt) {
      this.showStatus('❌ Заполните все поля', 'error');
      return;
    }

    // Construct API URL with proper protocol
    const apiUrl = `http://${host}:${port}/v1/chat/completions`;

    // Clear previous results
    if (responseDiv) responseDiv.innerHTML = '';

    this.showStatus('⏳ Sending request...', 'info');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      // Simple prompt without thinking - always /no_think
      const finalPrompt = `${prompt} /no_think`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: finalPrompt }],
          stream: true,
          max_tokens: 32000,
          temperature: 0.6,
          top_p: 0.95
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream available');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      this.showStatus('📡 Receiving response...', 'info');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process SSE format
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const jsonStr = line.slice(6);
              if (jsonStr.trim() === '') continue;
              
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content;
              
              if (content) {
                fullText += content;
                if (responseDiv) responseDiv.innerHTML = this.formatMarkdown(fullText + '▌');
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }

      // Remove cursor at the end
      if (responseDiv) responseDiv.innerHTML = this.formatMarkdown(fullText);

      this.showStatus('✅ Response completed', 'success');
    } catch (error) {
      console.error('LLM request error:', error);
      this.showStatus(`❌ Error: ${(error as Error).message}`, 'error');
    }
  }

  private async sendRequestViaKernel(): Promise<void> {
    const host = (this.node.querySelector('#llm-host') as HTMLInputElement)?.value?.trim();
    const port = (this.node.querySelector('#llm-port') as HTMLInputElement)?.value?.trim();
    const model = (this.node.querySelector('#llm-model') as HTMLInputElement)?.value?.trim();
    const prompt = (this.node.querySelector('#llm-prompt') as HTMLTextAreaElement)?.value?.trim();

    if (!host || !port || !model || !prompt) {
      this.showStatus('❌ Заполните все поля', 'error');
      return;
    }

    // Получаем активную сессию kernel
    const notebookPanel = this.app.shell.currentWidget as any;
    const sessionContext = notebookPanel?.sessionContext;
    
    if (!sessionContext || !sessionContext.session?.kernel) {
      this.showStatus('❌ Нет активного kernel. Откройте notebook!', 'error');
      return;
    }

    const kernel = sessionContext.session.kernel;
    
    // Python код для отправки запроса
    const pythonCode = `
import requests
import json

try:
    response = requests.post(
        f"http://${host}:${port}/v1/chat/completions",
        json={
            "model": "${model}",
            "messages": [{"role": "user", "content": """${prompt} /no_think"""}],
            "stream": False,
            "max_tokens": 32000,
            "temperature": 0.6,
            "top_p": 0.95
        },
        timeout=30
    )
    
    if response.status_code == 200:
        result = response.json()
        content = result['choices'][0]['message']['content']
        print("LLM_RESPONSE_START")
        print(content)
        print("LLM_RESPONSE_END")
    else:
        print(f"LLM_ERROR: HTTP {response.status_code}: {response.text}")
        
except Exception as e:
    print(f"LLM_ERROR: {str(e)}")
  `;

    // Выполняем код в kernel
    const future = kernel.requestExecute({ code: pythonCode });
    
    this.showStatus('⏳ Отправка через kernel...', 'info');
    
    let responseText = '';
    let isCapturing = false;
    
    future.onIOPub = (msg) => {
      if (msg.header.msg_type === 'stream') {
        const content = (msg as any).content;
        
        if (content.name === 'stdout') {
          const text = content.text;
          
          // Если в тексте есть полный ответ - извлекаем его
          if (text.includes('LLM_RESPONSE_START') && text.includes('LLM_RESPONSE_END')) {
            const startMarker = 'LLM_RESPONSE_START';
            const endMarker = 'LLM_RESPONSE_END';
            const startIndex = text.indexOf(startMarker) + startMarker.length;
            const endIndex = text.indexOf(endMarker);
            
            if (startIndex > startMarker.length - 1 && endIndex > startIndex) {
              // Извлекаем и очищаем от лишних переносов
              const extractedResponse = text.substring(startIndex, endIndex)
                .replace(/^\n+/, '')  // Убираем переносы в начале
                .replace(/\n+$/, '')  // Убираем переносы в конце  
                .trim();
              
              const responseDiv = this.node.querySelector('#llm-response') as HTMLDivElement;
              if (responseDiv) {
                responseDiv.innerHTML = this.formatMarkdown(extractedResponse);
                // Сохраняем оригинальный текст для вставки
                responseDiv.setAttribute('data-original-text', extractedResponse);
              }
              this.showStatus('✅ Ответ получен', 'success');
            }
            return;
          }
          
          // Старая логика для разделенных сообщений
          if (text.includes('LLM_RESPONSE_START')) {
            isCapturing = true;
            return;
          }
          
          if (text.includes('LLM_RESPONSE_END')) {
            isCapturing = false;
            const responseDiv = this.node.querySelector('#llm-response') as HTMLDivElement;
            if (responseDiv) {
              responseDiv.innerHTML = this.formatMarkdown(responseText.trim());
            }
            this.showStatus('✅ Ответ получен', 'success');
            return;
          }
          
          if (text.includes('LLM_ERROR:')) {
            this.showStatus('❌ ' + text.replace('LLM_ERROR:', '').trim(), 'error');
            return;
          }
          
          if (isCapturing) {
            responseText += text;
          }
        }
      }
    };
  }

  private formatMarkdown(text: string): string {
    // Улучшенное форматирование markdown
    return text
      // Блоки кода (```code```)
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // Инлайн код (`code`)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Жирный текст
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Курсив
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Заголовки
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Переносы строк
      .replace(/\n/g, '<br>');
  }

  private clearResponse(): void {
    const responseDiv = this.node.querySelector('#llm-response') as HTMLDivElement;
    const statusDiv = this.node.querySelector('#llm-status') as HTMLDivElement;
    
    if (responseDiv) responseDiv.innerHTML = '';
    if (statusDiv) statusDiv.textContent = '';
  }

  private showStatus(message: string, type: string): void {
    const statusDiv = this.node.querySelector('#llm-status') as HTMLDivElement;
    if (!statusDiv) return;

    statusDiv.textContent = message;
    statusDiv.className = `status-area ${type}`;
    
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status-area';
    }, 3000);
  }

  private saveSettings(): void {
    const settings = {
      host: (this.node.querySelector('#llm-host') as HTMLInputElement)?.value || '10.1.5.1',
      port: (this.node.querySelector('#llm-port') as HTMLInputElement)?.value || '1088',
      model: (this.node.querySelector('#llm-model') as HTMLInputElement)?.value || 'vllm_model',
    };
    
    localStorage.setItem('llm-client-settings', JSON.stringify(settings));
  }

  private loadSettings(): void {
    const saved = localStorage.getItem('llm-client-settings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        
        if (settings.host) {
          const hostInput = this.node.querySelector('#llm-host') as HTMLInputElement;
          if (hostInput) hostInput.value = settings.host;
        }
        
        if (settings.port) {
          const portInput = this.node.querySelector('#llm-port') as HTMLInputElement;
          if (portInput) portInput.value = settings.port;
        }
        
        if (settings.model) {
          const modelInput = this.node.querySelector('#llm-model') as HTMLInputElement;
          if (modelInput) modelInput.value = settings.model;
        }
        
      } catch (e) {
        console.warn('Failed to load settings:', e);
      }
    } else {
      // Set default values if no settings are saved
      const hostInput = this.node.querySelector('#llm-host') as HTMLInputElement;
      const portInput = this.node.querySelector('#llm-port') as HTMLInputElement;
      const modelInput = this.node.querySelector('#llm-model') as HTMLInputElement;
      
      if (hostInput) hostInput.value = '10.1.5.1';
      if (portInput) portInput.value = '1088';
      if (modelInput) modelInput.value = 'vllm_model';
    }
  }

  private insertToCell(): void {
    const responseDiv = this.node.querySelector('#llm-response') as HTMLDivElement;
    if (!responseDiv || !responseDiv.textContent) {
      this.showStatus('❌ Нет ответа для вставки', 'error');
      return;
    }

    // Используем оригинальный текст вместо textContent
    const originalText = responseDiv.getAttribute('data-original-text');
    const plainText = originalText || responseDiv.textContent || responseDiv.innerText || '';
    
    // Используем ту же логику что и в sendRequestViaKernel
    const notebookPanel = this.app.shell.currentWidget as any;
    const sessionContext = notebookPanel?.sessionContext;
    
    if (!sessionContext || !notebookPanel.content) {
      this.showStatus('❌ Нет активного notebook. Откройте notebook!', 'error');
      return;
    }

    try {
      const notebook = notebookPanel.content;
      
      // Get the active cell
      const activeCell = notebook.activeCell;
      if (!activeCell) {
        this.showStatus('❌ Нет активной ячейки', 'error');
        return;
      }

      // Convert HTML back to plain text (remove HTML formatting)
      // const plainText = responseDiv.textContent || responseDiv.innerText || '';
      
      // Insert the text into the active cell  
      const editor = activeCell.editor;
      if (editor) {
        try {
          // Способ 1: Через модель ячейки
          const cellModel = activeCell.model;
          if (cellModel && cellModel.value) {
            const currentValue = cellModel.value.text || cellModel.sharedModel.getSource();
            const newValue = currentValue + (currentValue ? '\n' : '') + plainText;
            cellModel.value.text = newValue;
            this.showStatus('✅ Текст вставлен в ячейку', 'success');
          } else {
            // Способ 2: Прямо через editor (если CodeMirror)
            if (editor.replaceSelection) {
              editor.replaceSelection(plainText);
              this.showStatus('✅ Текст вставлен в ячейку', 'success');
            } else {
              // Способ 3: Через setValue
              const currentValue = editor.model?.value?.text || '';
              editor.model?.value?.insert(currentValue.length, plainText);
              this.showStatus('✅ Текст вставлен в ячейку', 'success');
            }
          }
        } catch (error) {
          console.error('Detailed insert error:', error);
          // Способ 4: Самый простой fallback
          navigator.clipboard.writeText(plainText).then(() => {
            this.showStatus('📋 Скопировано в буфер. Вставьте Ctrl+V', 'success');
          }).catch(() => {
            this.showStatus('❌ Ошибка вставки. Скопируйте вручную', 'error');
          });
        }
      } else {
        this.showStatus('❌ Нет доступа к редактору ячейки', 'error');
      }
    } catch (error) {
      console.error('Insert to cell error:', error);
      this.showStatus('❌ Ошибка вставки в ячейку', 'error');
    }
  }

  private htmlToPlainText(html: string): string {
    // Создаем временный элемент для конвертации
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Заменяем <br> на переносы строк
    tempDiv.querySelectorAll('br').forEach(br => {
      br.replaceWith('\n');
    });
    
    // Заменяем </p>, </div>, </h1-6> на переносы строк  
    tempDiv.innerHTML = tempDiv.innerHTML
      .replace(/<\/(p|div|h[1-6])>/g, '\n')
      .replace(/<\/pre>/g, '\n');
    
    return tempDiv.textContent || tempDiv.innerText || '';
  }
}
