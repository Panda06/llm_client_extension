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
    console.log('🔥 sendRequestViaKernel запущен');
    
    const host = (this.node.querySelector('#llm-host') as HTMLInputElement)?.value?.trim();
    const port = (this.node.querySelector('#llm-port') as HTMLInputElement)?.value?.trim();
    const model = (this.node.querySelector('#llm-model') as HTMLInputElement)?.value?.trim();
    const prompt = (this.node.querySelector('#llm-prompt') as HTMLTextAreaElement)?.value?.trim();

    console.log('📝 Параметры:', { host, port, model, prompt });

    if (!host || !port || !model || !prompt) {
      this.showStatus('❌ Заполните все поля', 'error');
      return;
    }

    // Получаем активную сессию kernel
    const notebookPanel = this.app.shell.currentWidget as any;
    console.log('📋 Текущий виджет:', notebookPanel);
    
    const sessionContext = notebookPanel?.sessionContext;
    console.log('🔗 Session context:', sessionContext);
    
    if (!sessionContext || !sessionContext.session?.kernel) {
      this.showStatus('❌ Нет активного kernel. Откройте notebook!', 'error');
      console.log('❌ Kernel не найден');
      return;
    }

    const kernel = sessionContext.session.kernel;
    console.log('🐍 Kernel найден:', kernel);
    
    // Python код для отправки запроса
    const pythonCode = `
print("=== LLM REQUEST START ===")
import requests
import json

try:
    print(f"Отправка запроса к http://${host}:${port}/v1/chat/completions")
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
    
    print(f"Status code: {response.status_code}")
    
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
    import traceback
    traceback.print_exc()

print("=== LLM REQUEST END ===")
  `;

    console.log('📤 Отправляем Python код:', pythonCode);

    // Выполняем код в kernel
    const future = kernel.requestExecute({ code: pythonCode });
    console.log('🚀 Future создан:', future);
    
    this.showStatus('⏳ Отправка через kernel...', 'info');
    
    let responseText = '';
    let isCapturing = false;
    
    future.onIOPub = (msg) => {
      console.log('📨 IOPub сообщение:', msg);
      
      if (msg.header.msg_type === 'stream') {
        const content = (msg as any).content;
        console.log('📺 Stream content:', content);
        
        if (content.name === 'stdout') {
          const text = content.text;
          console.log('📝 stdout text:', text);
          
          // Если в тексте есть полный ответ - извлекаем его
          if (text.includes('LLM_RESPONSE_START') && text.includes('LLM_RESPONSE_END')) {
            console.log('🎯 Полный ответ в одном сообщении');
            const startIndex = text.indexOf('LLM_RESPONSE_START') + 'LLM_RESPONSE_START'.length;
            const endIndex = text.indexOf('LLM_RESPONSE_END');
            
            if (startIndex > -1 && endIndex > startIndex) {
              const extractedResponse = text.substring(startIndex, endIndex).trim();
              console.log('✂️ Извлеченный ответ:', extractedResponse);
              
              const responseDiv = this.node.querySelector('#llm-response') as HTMLDivElement;
              if (responseDiv) {
                responseDiv.innerHTML = this.formatMarkdown(extractedResponse);
              }
              this.showStatus('✅ Ответ получен', 'success');
              console.log('✅ Ответ установлен в UI');
            }
            return;
          }
          
          // Старая логика для разделенных сообщений
          if (text.includes('LLM_RESPONSE_START')) {
            console.log('🟢 Начинаем захват ответа');
            isCapturing = true;
            return;
          }
          
          if (text.includes('LLM_RESPONSE_END')) {
            console.log('🔴 Заканчиваем захват ответа');
            isCapturing = false;
            const responseDiv = this.node.querySelector('#llm-response') as HTMLDivElement;
            if (responseDiv) {
              responseDiv.innerHTML = this.formatMarkdown(responseText);
            }
            this.showStatus('✅ Ответ получен', 'success');
            console.log('✅ Ответ установлен в UI');
            return;
          }
          
          if (text.includes('LLM_ERROR:')) {
            console.log('❌ Ошибка LLM:', text);
            this.showStatus('❌ ' + text.replace('LLM_ERROR:', '').trim(), 'error');
            return;
          }
          
          if (isCapturing) {
            console.log('📋 Добавляем к ответу:', text);
            responseText += text;
          }
        }
      }
    };

    future.onDone = () => {
      console.log('✅ Future завершен');
    };

    future.onReply = (msg) => {
      console.log('💬 Reply сообщение:', msg);
    };
  }

  private formatMarkdown(text: string): string {
    // Simple markdown-like formatting
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
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
      this.showStatus('❌ No response to insert', 'error');
      return;
    }

    // Get the current notebook panel
    const shell = this.app.shell;
    const currentWidget = shell.currentWidget;

    if (!currentWidget || !currentWidget.hasClass('jp-Notebook')) {
      this.showStatus('❌ No active notebook found', 'error');
      return;
    }

    try {
      // Access the notebook through the widget
      const notebookPanel = currentWidget as any;
      const notebook = notebookPanel.content;
      
      if (!notebook) {
        this.showStatus('❌ Cannot access notebook content', 'error');
        return;
      }

      // Get the active cell
      const activeCell = notebook.activeCell;
      if (!activeCell) {
        this.showStatus('❌ No active cell found', 'error');
        return;
      }

      // Convert HTML back to plain text (remove HTML formatting)
      const plainText = responseDiv.textContent || responseDiv.innerText || '';
      
      // Insert the text into the active cell
      const editor = activeCell.editor;
      if (editor) {
        const cursor = editor.getCursorPosition();
        editor.replaceRange(cursor, cursor, plainText);
        this.showStatus('✅ Text inserted to cell', 'success');
      } else {
        this.showStatus('❌ Cannot access cell editor', 'error');
      }
    } catch (error) {
      console.error('Insert to cell error:', error);
      this.showStatus('❌ Failed to insert to cell', 'error');
    }
  }
}
