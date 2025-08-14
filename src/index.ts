import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette } from '@jupyterlab/apputils';

import { LLMClientWidget } from './widget';

const PLUGIN_ID = 'llm-client-extension:plugin';

/**
 * Initialization data for the llm-client-extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'LLM Client Extension for JupyterLab',
  autoStart: true,
  requires: [ICommandPalette],
  activate: (app: JupyterFrontEnd, palette: ICommandPalette) => {
    console.log('JupyterLab extension llm-client-extension is activated!');

    // Create the widget
    const widget = new LLMClientWidget(app);
    widget.id = 'llm-client-extension';
    widget.title.iconClass = 'jp-MaterialIcon jp-BugIcon';
    widget.title.caption = 'LLM Client';

    // Add the widget to the left sidebar
    app.shell.add(widget, 'left', { rank: 300 });

    // Add command to open the widget
    const command = 'llm-client:open';
    app.commands.addCommand(command, {
      label: 'Open LLM Client',
      execute: () => {
        if (!widget.isAttached) {
          app.shell.add(widget, 'left');
        }
        app.shell.activateById(widget.id);
      }
    });

    // Add the command to the palette
    palette.addItem({ command, category: 'LLM Client' });
  }
};

export default plugin;
