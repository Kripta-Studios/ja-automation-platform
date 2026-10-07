import type { AssistantLocale } from './types';

export const assistantCopy = {
  en: {
    launcher: 'Find a task',
    title: 'What would you like to do?',
    description: 'Find the right workspace or form. You review and save any changes there.',
    query: 'Describe your task',
    placeholder: 'For example, create a new project',
    examples: 'Try a task',
    available: 'Available tasks',
    matches: 'Matching tasks',
    empty:
      'No matching task is available for your account. Try a shorter description or browse the tasks below.',
    unsupported: 'I can help you find pages and forms in this app. Try a task from the list below.',
    close: 'Close',
    back: 'Back to tasks',
    records: 'Choose a record',
    recordQuery: 'Find a record on this page',
    recordDescription:
      'These records are available on your current page. Choose the one you want to open.',
    recordEmpty: 'No matching record on this page.',
    register: 'Open the register instead',
    selectInWorkspace: 'Select the record in this workspace to continue.',
    failed:
      'The requested page or form could not be opened. Use the workspace navigation or try another task.',
    opening: 'Opening workspace…',
    dismiss: 'Dismiss message',
  },
  es: {
    launcher: 'Buscar una tarea',
    title: '¿Qué quieres hacer?',
    description: 'Encuentra el espacio o formulario adecuado. Allí revisas y guardas los cambios.',
    query: 'Describe tu tarea',
    placeholder: 'Por ejemplo, crear un proyecto nuevo',
    examples: 'Prueba una tarea',
    available: 'Tareas disponibles',
    matches: 'Tareas coincidentes',
    empty:
      'No hay una tarea coincidente disponible para tu cuenta. Prueba una descripción más corta o consulta las tareas de abajo.',
    unsupported:
      'Puedo ayudarte a encontrar páginas y formularios de esta aplicación. Prueba una tarea de la lista de abajo.',
    close: 'Cerrar',
    back: 'Volver a las tareas',
    records: 'Elige un registro',
    recordQuery: 'Buscar un registro en esta página',
    recordDescription:
      'Estos registros están disponibles en tu página actual. Elige el que quieres abrir.',
    recordEmpty: 'No hay registros coincidentes en esta página.',
    register: 'Abrir la lista de registros',
    selectInWorkspace: 'Selecciona el registro en este espacio para continuar.',
    failed:
      'No se pudo abrir la página o el formulario solicitado. Usa la navegación de la aplicación o prueba otra tarea.',
    opening: 'Abriendo el espacio…',
    dismiss: 'Cerrar mensaje',
  },
  pt: {
    launcher: 'Encontrar uma tarefa',
    title: 'O que você quer fazer?',
    description: 'Encontre a área ou o formulário certo. Você revisa e salva as alterações lá.',
    query: 'Descreva sua tarefa',
    placeholder: 'Por exemplo, criar um novo projeto',
    examples: 'Experimente uma tarefa',
    available: 'Tarefas disponíveis',
    matches: 'Tarefas correspondentes',
    empty:
      'Nenhuma tarefa correspondente está disponível para sua conta. Tente uma descrição mais curta ou consulte as tarefas abaixo.',
    unsupported:
      'Posso ajudar você a encontrar páginas e formulários neste aplicativo. Experimente uma tarefa da lista abaixo.',
    close: 'Fechar',
    back: 'Voltar às tarefas',
    records: 'Escolha um registro',
    recordQuery: 'Encontrar um registro nesta página',
    recordDescription:
      'Estes registros estão disponíveis na sua página atual. Escolha o que deseja abrir.',
    recordEmpty: 'Nenhum registro correspondente nesta página.',
    register: 'Abrir a lista de registros',
    selectInWorkspace: 'Selecione o registro nesta área para continuar.',
    failed:
      'Não foi possível abrir a página ou o formulário solicitado. Use a navegação do aplicativo ou tente outra tarefa.',
    opening: 'Abrindo a área…',
    dismiss: 'Fechar mensagem',
  },
} satisfies Record<AssistantLocale, Record<string, string>>;
