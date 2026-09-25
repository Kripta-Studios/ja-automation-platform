import { explicitCoverageLiterals } from './coverage-literals';

/**
 * User-facing literals that predate the typed catalog are covered here while
 * their components are migrated to semantic keys. Every registered literal is
 * backed by an explicit translation entry (or a deliberate semantic message
 * renderer for action keys); free text never enters this catalog.
 */

const exact: Record<string, readonly [string, string]> = {
  'problem.notification.invalidLink': [
    'El enlace de esta notificación no es válido. Ábrela desde la bandeja de actividad.',
    'O link desta notificação é inválido. Abra-a pela caixa de atividades.',
  ],
  'problem.notification.unavailable': [
    'Esta notificación ya no está disponible. Vuelve a la bandeja de actividad.',
    'Esta notificação não está mais disponível. Volte à caixa de atividades.',
  ],
  'problem.closeout.financeRoleRequired': [
    'Se requiere un rol activo de Finanzas o Propietario para gestionar el cierre del proyecto.',
    'É necessária uma função ativa de Finanças ou Proprietário para gerenciar o encerramento do projeto.',
  ],
  'problem.closeout.ownerRoleRequired': [
    'Solo un Propietario activo puede reabrir un proyecto cerrado.',
    'Somente um Proprietário ativo pode reabrir um projeto encerrado.',
  ],
  'problem.closeout.projectNotFound': [
    'Este proyecto ya no está disponible. Revisa la lista de proyectos.',
    'Este projeto não está mais disponível. Revise a lista de projetos.',
  ],
  'problem.closeout.revisionNotFound': [
    'Esta revisión de cierre ya no está disponible. Revisa el cierre actual.',
    'Esta revisão de encerramento não está mais disponível. Revise o encerramento atual.',
  ],
  'problem.closeout.reopenReasonRequired': [
    'Introduce un motivo de entre 1 y 2000 caracteres antes de reabrir.',
    'Informe um motivo de 1 a 2000 caracteres antes de reabrir.',
  ],
  'problem.closeout.documentSelectionInvalid': [
    'Los documentos seleccionados para el cliente contienen duplicados o superan el número permitido. Revisa la selección.',
    'Os documentos selecionados para o cliente contêm duplicatas ou excedem a quantidade permitida. Revise a seleção.',
  ],
  'problem.closeout.documentUnavailable': [
    'Un documento seleccionado no está disponible o no está autorizado para el cierre del cliente. Revisa la selección.',
    'Um documento selecionado está indisponível ou não está autorizado para o encerramento do cliente. Revise a seleção.',
  ],
  'problem.closeout.packageTooLarge': [
    'El paquete de cierre supera el límite de tamaño. Elige menos documentos o documentos más pequeños.',
    'O pacote de encerramento excede o limite de tamanho. Escolha menos documentos ou documentos menores.',
  ],
  'problem.closeout.clientSnapshotFinancialReview': [
    'La copia para el cliente puede incluir información financiera. Revisa los registros de origen antes de publicarla.',
    'A versão para o cliente pode conter informações financeiras. Revise os registros de origem antes da publicação.',
  ],
  'problem.closeout.clientConfirmationStale': [
    'La copia para el cliente cambió desde la confirmación. Revisa la versión actual y confírmala de nuevo.',
    'A versão para o cliente mudou desde a confirmação. Revise a versão atual e confirme-a novamente.',
  ],
  'problem.closeout.confirmationCheckRequired': [
    'Confirma que revisaste la copia exacta para el cliente antes de continuar.',
    'Confirme que você revisou a versão exata para o cliente antes de continuar.',
  ],
  'problem.closeout.reasonRetained': ['Motivo introducido', 'Motivo informado'],
  'problem.closeout.selectionRetained': [
    'Documentos que seleccionaste',
    'Documentos que você selecionou',
  ],
  'problem.closeout.documentNoLongerAvailable': [
    'Documento que ya no está disponible',
    'Documento que não está mais disponível',
  ],
  'problem.closeout.previousConfirmation': [
    'Marcaste la confirmación para la copia anterior. Revisa la copia actual y vuelve a marcar la casilla.',
    'Você marcou a confirmação para a versão anterior. Revise a versão atual e marque a caixa novamente.',
  ],
  'problem.closeout.confirmationRequired': [
    'Confirma la copia exacta y actual para el cliente antes de finalizar el cierre.',
    'Confirme a versão exata e atual para o cliente antes de finalizar o encerramento.',
  ],
  'problem.closeout.draftAlreadyActive': [
    'Ya hay un borrador de cierre activo. Revísalo antes de continuar.',
    'Já existe um rascunho de encerramento ativo. Revise-o antes de continuar.',
  ],
  'problem.closeout.activeDraftRequired': [
    'Este borrador de cierre ya no está activo. Revisa el cierre actual.',
    'Este rascunho de encerramento não está mais ativo. Revise o encerramento atual.',
  ],
  'problem.closeout.draftChanged': [
    'El cierre cambió mientras este formulario estaba abierto. Revisa el borrador actualizado antes de continuar.',
    'O encerramento mudou enquanto este formulário estava aberto. Revise o rascunho atualizado antes de continuar.',
  ],
  'problem.closeout.reopenUnavailable': [
    'Esta revisión no se puede reabrir porque no es la última revisión final de un proyecto cerrado o ya fue reabierta. Revisa el cierre actual.',
    'Esta revisão não pode ser reaberta porque não é a última revisão final de um projeto encerrado ou já foi reaberta. Revise o encerramento atual.',
  ],
  'problem.closeout.sourceChanged': [
    'Los registros de origen del cierre cambiaron. Revísalos y prepara un nuevo borrador.',
    'Os registros de origem do encerramento mudaram. Revise-os e prepare um novo rascunho.',
  ],
  'problem.closeout.sourceInvalid': [
    'Un registro de origen requerido o una conformidad del cliente aceptada no es válido o está desactualizado. Revisa los registros de origen.',
    'Um registro de origem obrigatório ou uma conformidade do cliente aceita é inválida ou está desatualizada. Revise os registros de origem.',
  ],
  'problem.closeout.documentIntegrityFailed': [
    'Un documento de origen seleccionado no superó la comprobación de almacenamiento o integridad. Revisa los documentos y contacta con un propietario.',
    'Um documento de origem selecionado falhou na verificação de armazenamento ou integridade. Revise os documentos e contate um proprietário.',
  ],
  'problem.closeout.artifactWriteIncomplete': [
    'No se terminó de guardar el archivo de cierre. Comprueba la revisión actual antes de intentarlo de nuevo.',
    'O arquivo de encerramento não terminou de ser gravado. Confira a revisão atual antes de tentar novamente.',
  ],
  'problem.remedy.reviewCloseout': ['Revisar el cierre actual', 'Revisar o encerramento atual'],
  'problem.remedy.reviewCloseoutDocuments': [
    'Revisar los documentos del cierre',
    'Revisar os documentos do encerramento',
  ],
  'problem.remedy.reviewProjects': ['Revisar proyectos', 'Revisar projetos'],
  'problem.finance.policyDuplicateStart': [
    'Ya existe una política de gastos de esta persona que comienza en esta fecha. Revísala antes de añadir otra.',
    'Já existe uma política de despesas desta pessoa com início nesta data. Revise-a antes de adicionar outra.',
  ],
  'problem.finance.policyPeriodOverlap': [
    'Este período de política se solapa con una política existente para la misma persona, pagador y categoría. Revisa los períodos actuales.',
    'Este período da política se sobrepõe a uma política existente para a mesma pessoa, pagador e categoria. Revise os períodos atuais.',
  ],
  'problem.finance.policyEndBeforeStart': [
    'La fecha de fin de la política debe ser igual o posterior a la de inicio.',
    'A data de término da política deve ser igual ou posterior à data de início.',
  ],
  'problem.finance.policyAssignmentUnavailable': [
    'Esta persona ya no tiene una asignación activa al proyecto. Revisa la asignación antes de crear una política.',
    'Esta pessoa não tem mais uma atribuição ativa ao projeto. Revise a atribuição antes de criar uma política.',
  ],
  'problem.finance.policyOutsideAssignment': [
    'Las fechas de la política deben estar dentro de la asignación de esta persona al proyecto.',
    'As datas da política devem estar dentro da atribuição desta pessoa ao projeto.',
  ],
  'problem.finance.policyEndRequired': [
    'Esta asignación tiene fecha de fin. Introduce una fecha de fin de política dentro de ella.',
    'Esta atribuição tem data de término. Informe uma data de término da política dentro dela.',
  ],
  'problem.finance.policyMarkupMismatch': [
    'Un recargo requiere una tarifa positiva; los demás tratamientos del cliente no pueden incluir recargo.',
    'Um acréscimo exige uma tarifa positiva; os outros tratamentos do cliente não podem incluir acréscimo.',
  ],
  'problem.finance.reimbursementAmountInvalid': [
    'El importe del reembolso debe ser positivo y no puede superar el reembolso aprobado al trabajador.',
    'O valor do reembolso deve ser positivo e não pode exceder o reembolso aprovado ao trabalhador.',
  ],
  'problem.finance.partialReimbursementUnsupported': [
    'Registra el importe completo del reembolso aprobado al trabajador; aquí no se admite un reembolso parcial.',
    'Registre o valor integral do reembolso aprovado ao trabalhador; reembolso parcial não é permitido aqui.',
  ],
  'problem.finance.paymentExceedsBalance': [
    'El pago supera el saldo restante de la remuneración del trabajador. Revisa la liquidación antes de registrarlo.',
    'O pagamento excede o saldo restante da remuneração do trabalhador. Revise a liquidação antes de registrá-lo.',
  ],
  'problem.finance.paymentCurrencyMismatch': [
    'La moneda del pago debe coincidir con la de la liquidación de remuneración del trabajador.',
    'A moeda do pagamento deve corresponder à moeda da liquidação da remuneração do trabalhador.',
  ],
  'problem.remedy.reviewAssignmentPolicy': [
    'Revisar la política de la asignación',
    'Revisar a política da atribuição',
  ],
  'Review current crew delegations': [
    'Revisar las delegaciones actuales del equipo',
    'Revisar as delegações atuais da equipe',
  ],
  'Review current crew entries': [
    'Revisar los registros actuales del equipo',
    'Revisar os registros atuais da equipe',
  ],
  'Review current receipts and allocations': [
    'Revisar los recibos y repartos actuales',
    'Revisar os recibos e distribuições atuais',
  ],
  'Review updated crew time': [
    'Revisar las horas del equipo actualizadas',
    'Revisar as horas da equipe atualizadas',
  ],
  'problem.crew.accountInactive': [
    'Tu cuenta ya no está activa para esta acción. Consulta al propietario del proyecto.',
    'Sua conta não está mais ativa para esta ação. Contate o proprietário do projeto.',
  ],
  'problem.crew.assignmentRequired': [
    'Ambos trabajadores necesitan asignaciones activas al proyecto en la fecha de inicio de la delegación. Consulta al propietario del proyecto para revisar las asignaciones.',
    'Os dois trabalhadores precisam de atribuições ativas ao projeto na data de início da delegação. Contate o proprietário do projeto para revisar as atribuições.',
  ],
  'problem.crew.batchRequestInvalid': [
    'Actualiza este formulario antes de guardar las horas del equipo. Puedes copiar las horas introducidas al nuevo formulario.',
    'Atualize este formulário antes de salvar as horas da equipe. Você pode copiar as horas informadas para o novo formulário.',
  ],
  'problem.crew.batchRetryChanged': [
    'Este identificador de solicitud ya se usó con otras horas. Revisa las horas del equipo guardadas antes de enviarlas de nuevo.',
    'Este identificador de solicitação já foi usado com outras horas. Revise as horas da equipe salvas antes de enviar novamente.',
  ],
  'problem.crew.batchWorkerBlocked': [
    'No se guardaron horas del equipo porque un trabajador seleccionado tiene un conflicto de fecha, asignación u horas existentes. Revisa ese trabajador y los registros actuales.',
    'Nenhuma hora da equipe foi salva porque um trabalhador selecionado tem conflito de data, atribuição ou horas existentes. Revise esse trabalhador e os registros atuais.',
  ],
  'problem.crew.categoryInvalid': [
    'Elige una categoría operativa de horas válida.',
    'Escolha uma categoria operacional de horas válida.',
  ],
  'problem.crew.chiefRoleRequired': [
    'Registrar horas del equipo requiere un rol activo de jefe de equipo. Consulta al propietario del proyecto para revisar el acceso.',
    'Registrar horas da equipe exige uma função ativa de chefe de equipe. Contate o proprietário do projeto para revisar o acesso.',
  ],
  'problem.crew.correctionStale': [
    'Estas horas del equipo cambiaron antes de la corrección. Revisa el registro actual antes de crear un nuevo borrador.',
    'Estas horas da equipe mudaram antes da correção. Revise o registro atual antes de criar um novo rascunho.',
  ],
  'problem.crew.correctionStateBlocked': [
    'Aquí solo se puede crear un borrador corregido después de que un revisor devuelva estas horas del equipo para cambios.',
    'Aqui só é possível criar um rascunho corrigido depois que um revisor devolver estas horas da equipe para alterações.',
  ],
  'problem.crew.dateOrderInvalid': [
    'La fecha de fin debe ser posterior a la de inicio.',
    'A data de término deve ser posterior à data de início.',
  ],
  'problem.crew.delegationChanged': [
    'Esta delegación ya se cambió o revocó. Revisa las delegaciones actuales.',
    'Esta delegação já foi alterada ou revogada. Revise as delegações atuais.',
  ],
  'problem.crew.delegationExists': [
    'Estos trabajadores ya tienen una delegación activa del equipo. Revísala antes de añadir otra.',
    'Estes trabalhadores já têm uma delegação ativa da equipe. Revise-a antes de adicionar outra.',
  ],
  'problem.crew.delegationNotActive': [
    'Esta delegación del equipo o una asignación al proyecto ya no está activa para la fecha seleccionada. Consulta al propietario del proyecto.',
    'Esta delegação da equipe ou uma atribuição ao projeto não está mais ativa para a data selecionada. Contate o proprietário do projeto.',
  ],
  'problem.crew.draftChanged': [
    'Este borrador de horas del equipo cambió mientras lo editabas. Revisa la versión actual antes de guardar.',
    'Este rascunho de horas da equipe mudou durante a edição. Revise a versão atual antes de salvar.',
  ],
  'problem.crew.draftLinkedEvidence': [
    'Este borrador del equipo está vinculado a otro registro y no se puede cambiar aquí. Revisa el registro vinculado y solicita una corrección documentada.',
    'Este rascunho da equipe está vinculado a outro registro e não pode ser alterado aqui. Revise o registro vinculado e solicite uma correção documentada.',
  ],
  'problem.crew.draftNotEditable': [
    'Solo se puede editar o descartar un borrador del equipo que nunca se haya enviado. Revisa el registro.',
    'Só é possível editar ou descartar um rascunho da equipe que nunca foi enviado. Revise o registro.',
  ],
  'problem.crew.draftVersionInvalid': [
    'Este formulario no tiene una versión de borrador válida. Revisa el registro actual antes de guardar.',
    'Este formulário não tem uma versão de rascunho válida. Revise o registro atual antes de salvar.',
  ],
  'problem.crew.durationInvalid': [
    'Introduce más de cero y no más de 24 horas.',
    'Informe mais de zero e no máximo 24 horas.',
  ],
  'problem.crew.hourModeRequired': [
    'Elige horas compartidas o individuales para este registro del equipo.',
    'Escolha horas compartilhadas ou individuais para este registro da equipe.',
  ],
  'problem.crew.individualHoursInvalid': [
    'Introduce horas válidas para cada trabajador seleccionado.',
    'Informe horas válidas para cada trabalhador selecionado.',
  ],
  'problem.crew.intervalNotAllowed': [
    'El lote de horas del equipo no puede incluir una hora de inicio o fin deducida de la duración. Introduce las horas reales de cada trabajador.',
    'O lote de horas da equipe não pode incluir horário de início ou fim inferido da duração. Informe as horas reais de cada trabalhador.',
  ],
  'problem.crew.membersRequired': [
    'Selecciona entre uno y 100 miembros asignados al equipo.',
    'Selecione de um a 100 integrantes atribuídos à equipe.',
  ],
  'problem.crew.ownerRoleRequired': [
    'Solo el propietario del proyecto puede cambiar las delegaciones del equipo. Consulta al propietario para obtener ayuda.',
    'Só o proprietário do projeto pode alterar as delegações da equipe. Contate o proprietário para obter ajuda.',
  ],
  'problem.crew.projectTimezoneRequired': [
    'El proyecto necesita una zona horaria válida para comprobar el acceso del equipo. Consulta al propietario del proyecto.',
    'O projeto precisa de um fuso horário válido para verificar o acesso da equipe. Contate o proprietário do projeto.',
  ],
  'problem.crew.receiptAccessRequired': [
    'Este recibo no está disponible con tu acceso actual al equipo. Revisa los recibos actuales.',
    'Este recibo não está disponível com seu acesso atual à equipe. Revise os recibos atuais.',
  ],
  'problem.crew.receiptAmountFormatInvalid': [
    'Introduce cada reparto como un importe positivo, por ejemplo, 6,50.',
    'Informe cada distribuição como um valor positivo, por exemplo, 6,50.',
  ],
  'problem.crew.receiptAmountInvalid': [
    'El importe del recibo no es válido para repartirlo. Revisa el recibo guardado.',
    'O valor do recibo não é válido para distribuição. Revise o recibo salvo.',
  ],
  'problem.crew.receiptAmountsInvalid': [
    'Introduce un importe positivo para cada registro distinto de horas del equipo.',
    'Informe um valor positivo para cada registro distinto de horas da equipe.',
  ],
  'problem.crew.receiptLinkedTimeRequired': [
    'Incluye el registro de horas ya vinculado a este recibo.',
    'Inclua o registro de horas já vinculado a este recibo.',
  ],
  'problem.crew.receiptPayerInvalid': [
    'Un recibo compartido debe tener como pagador a un trabajador o a la empresa. Revisa el recibo antes de repartirlo.',
    'Um recibo compartilhado deve ter como pagador um trabalhador ou a empresa. Revise o recibo antes de distribuir.',
  ],
  'problem.crew.receiptPayerRequired': [
    'Incluye en el reparto al pagador del recibo o al trabajador al que se atribuye.',
    'Inclua na distribuição o pagador do recibo ou o trabalhador ao qual ele é atribuído.',
  ],
  'problem.crew.receiptRequestInvalid': [
    'Actualiza este formulario antes de repartir el recibo. Revisa los repartos existentes antes de intentarlo de nuevo.',
    'Atualize este formulário antes de distribuir o recibo. Revise as distribuições existentes antes de tentar novamente.',
  ],
  'problem.crew.receiptRetryChanged': [
    'Esta solicitud de reparto del recibo ya se usó con otros importes. Revisa los repartos existentes.',
    'Esta solicitação de distribuição do recibo já foi usada com outros valores. Revise as distribuições existentes.',
  ],
  'problem.crew.receiptRowsRequired': [
    'Selecciona entre dos y 100 registros de horas del equipo para este recibo compartido.',
    'Selecione de dois a 100 registros de horas da equipe para este recibo compartilhado.',
  ],
  'problem.crew.receiptScopeMismatch': [
    'Los registros de horas seleccionados y el recibo deben pertenecer al mismo proyecto y fecha. Revisa ambos registros.',
    'Os registros de horas selecionados e o recibo devem pertencer ao mesmo projeto e data. Revise os dois registros.',
  ],
  'problem.crew.receiptTotalMismatch': [
    'Los importes repartidos deben sumar exactamente el importe del recibo.',
    'Os valores distribuídos devem somar exatamente o valor do recibo.',
  ],
  'problem.crew.receiptUnavailable': [
    'El recibo ya no es un borrador sin repartir que hayas introducido. Revisa los recibos actuales.',
    'O recibo não é mais um rascunho não distribuído que você registrou. Revise os recibos atuais.',
  ],
  'problem.crew.receiptWorkersRequired': [
    'Reparte el recibo compartido entre al menos dos trabajadores distintos.',
    'Distribua o recibo compartilhado entre pelo menos dois trabalhadores diferentes.',
  ],
  'problem.crew.samePerson': [
    'Elige personas distintas para el jefe y el miembro del equipo.',
    'Escolha pessoas diferentes para o chefe e o integrante da equipe.',
  ],
  'problem.crew.sharedHoursInvalid': [
    'Introduce horas compartidas mayores que cero y no superiores a 24 por cada trabajador seleccionado.',
    'Informe horas compartilhadas maiores que zero e não superiores a 24 para cada trabalhador selecionado.',
  ],
  'problem.crew.timeAccessRequired': [
    'Este registro de horas del equipo no está disponible con tu delegación actual. Revisa tus registros del equipo o consulta al propietario del proyecto.',
    'Este registro de horas da equipe não está disponível com sua delegação atual. Revise seus registros da equipe ou contate o proprietário do projeto.',
  ],
  'problem.crew.timeDailyLimit': [
    'Este trabajador ya tiene horas en el día seleccionado. El total no puede superar las 24 horas.',
    'Este trabalhador já tem horas no dia selecionado. O total não pode ultrapassar 24 horas.',
  ],
  'problem.crew.timeDelegationChanged': [
    'La delegación del equipo cambió después de abrir este formulario. Consulta al propietario del proyecto para revisar el acceso.',
    'A delegação da equipe mudou depois que este formulário foi aberto. Contate o proprietário do projeto para revisar o acesso.',
  ],
  'problem.crew.timeIntervalOverlap': [
    'Este trabajador ya tiene horas registradas en el intervalo seleccionado. Ajusta la hora o la fecha.',
    'Este trabalhador já tem horas registradas no intervalo selecionado. Ajuste o horário ou a data.',
  ],
  'problem.crew.timeSubmissionChanged': [
    'Estas horas del equipo cambiaron o ya no son un borrador. Revisa el registro actual antes de enviarlas.',
    'Estas horas da equipe mudaram ou não são mais um rascunho. Revise o registro atual antes de enviar.',
  ],
  'problem.crew.workerInactive': [
    'Ambos trabajadores seleccionados necesitan cuentas activas. Consulta al propietario del proyecto para revisar el acceso.',
    'Os dois trabalhadores selecionados precisam de contas ativas. Contate o proprietário do projeto para revisar o acesso.',
  ],
  'problem.remedy.reviewDelegations': [
    'Revisar las delegaciones actuales del equipo',
    'Revisar as delegações atuais da equipe',
  ],
  'problem.remedy.reviewCrewDay': [
    'Revisar los registros actuales del equipo',
    'Revisar os registros atuais da equipe',
  ],
  'problem.remedy.reviewReceipts': [
    'Revisar los recibos y repartos actuales',
    'Revisar os recibos e distribuições atuais',
  ],
  'problem.remedy.reviewCrewTime': [
    'Revisar las horas del equipo actualizadas',
    'Revisar as horas da equipe atualizadas',
  ],
  'problem.remedy.contactProjectOwner': [
    'Consultar al propietario del proyecto para revisar el acceso',
    'Contatar o proprietário do projeto para revisar o acesso',
  ],
  'problem.remedy.reviewSupplierDirectory': [
    'Revisar el directorio de proveedores',
    'Revisar o diretório de fornecedores',
  ],
  'problem.remedy.reviewSupplierGrants': [
    'Revisar las autorizaciones del proveedor',
    'Revisar as autorizações do fornecedor',
  ],
  'problem.remedy.reviewSupplierAssignments': [
    'Revisar las asignaciones de técnicos',
    'Revisar as atribuições dos técnicos',
  ],
  'problem.remedy.chooseOperationalProject': [
    'Elegir un proyecto operativo',
    'Escolher um projeto operacional',
  ],
  'problem.remedy.reviewSavedDrafts': [
    'Revisar los borradores guardados antes de reintentar',
    'Revisar os rascunhos salvos antes de tentar novamente',
  ],
  'problem.remedy.reviewTimeDrafts': [
    'Revisar los borradores de horas',
    'Revisar os rascunhos de horas',
  ],
  'problem.remedy.correctField': ['Corregir el campo señalado', 'Corrigir o campo destacado'],
  'problem.remedy.confirmStatusChange': [
    'Confirmar el cambio de estado',
    'Confirmar a mudança de estado',
  ],
  'problem.remedy.signInAgain': ['Volver a iniciar sesión', 'Entrar novamente'],
  'problem.supplier.nameExists': [
    'Ya existe un proveedor con este nombre.',
    'Já existe um fornecedor com este nome.',
  ],
  'problem.supplier.emailInvalid': [
    'El correo del proveedor no es válido.',
    'O e-mail do fornecedor não é válido.',
  ],
  'problem.supplier.technicianEmailInvalid': [
    'El correo del técnico no es válido.',
    'O e-mail do técnico não é válido.',
  ],
  'problem.supplier.technicianEmailUsed': [
    'El correo del técnico ya pertenece a una cuenta.',
    'O e-mail do técnico já pertence a uma conta.',
  ],
  'problem.supplier.loginEmailManaged': [
    'Gestiona el correo de acceso desde el perfil de la cuenta.',
    'Gerencie o e-mail de login no perfil da conta.',
  ],
  'problem.supplier.activeRequired': [
    'Se requiere un proveedor activo.',
    'É necessário um fornecedor ativo.',
  ],
  'problem.supplier.notFound': ['No se encontró el proveedor.', 'Fornecedor não encontrado.'],
  'problem.supplier.technicianUnavailable': [
    'Selecciona un técnico del proveedor.',
    'Selecione um técnico do fornecedor.',
  ],
  'problem.supplier.technicianStatusBlocked': [
    'Se requiere un técnico del proveedor activo o suspendido.',
    'É necessário um técnico do fornecedor ativo ou suspenso.',
  ],
  'problem.supplier.operationalProjectRequired': [
    'Selecciona un proyecto operativo.',
    'Selecione um projeto operacional.',
  ],
  'problem.supplier.coordinatorUnavailable': [
    'Se requiere un coordinador activo del proveedor.',
    'É necessário um coordenador ativo do fornecedor.',
  ],
  'problem.supplier.coordinatorLoginRequired': [
    'Los coordinadores del proveedor necesitan una cuenta de acceso utilizable.',
    'Coordenadores do fornecedor precisam de uma conta de login utilizável.',
  ],
  'problem.supplier.profileWorkerRequired': [
    'Solo las cuentas de trabajador existentes pueden recibir un perfil de proveedor.',
    'Só contas de trabalhador existentes podem receber um perfil de fornecedor.',
  ],
  'problem.supplier.profileHistoryLocked': [
    'Un perfil de proveedor con historial de horas confirmado no se puede reasignar.',
    'Um perfil de fornecedor com histórico de horas confirmado não pode ser reatribuído.',
  ],
  'problem.supplier.grantOverlap': [
    'La autorización del proveedor para el proyecto se solapa con otra autorización activa.',
    'A autorização do fornecedor para o projeto se sobrepõe a outra autorização ativa.',
  ],
  'problem.supplier.grantChanged': [
    'Se requiere una autorización activa del proveedor para el proyecto.',
    'É necessária uma autorização ativa do fornecedor para o projeto.',
  ],
  'problem.supplier.assignmentExists': [
    'La asignación del técnico ya existe.',
    'A atribuição do técnico já existe.',
  ],
  'problem.supplier.dateOrderInvalid': [
    'La fecha de fin debe ser posterior a la de inicio.',
    'A data de término deve ser posterior à data de início.',
  ],
  'problem.supplier.batchTechnicianRequired': [
    'Selecciona al menos un técnico.',
    'Selecione pelo menos um técnico.',
  ],
  'problem.supplier.batchLimit': [
    'Un lote de horas admite como máximo 100 técnicos.',
    'Um lote de horas permite no máximo 100 técnicos.',
  ],
  'problem.supplier.batchReplayChanged': [
    'Esta solicitud de lote ya se utilizó con otros valores.',
    'Esta solicitação de lote já foi usada com outros valores.',
  ],
  'problem.supplier.draftRequired': [
    'Selecciona al menos un borrador.',
    'Selecione pelo menos um rascunho.',
  ],
  'problem.supplier.draftBatchLimit': [
    'Un lote de envío admite como máximo 100 borradores.',
    'Um lote de envio permite no máximo 100 rascunhos.',
  ],
  'problem.supplier.draftSelectionInvalid': [
    'Los borradores seleccionados no son válidos.',
    'Os rascunhos selecionados não são válidos.',
  ],
  'problem.supplier.statusInvalid': [
    'El estado del proveedor no es válido.',
    'O estado do fornecedor não é válido.',
  ],
  'problem.supplier.technicianStatusInvalid': [
    'El estado del técnico no es válido.',
    'O estado do técnico não é válido.',
  ],
  'problem.supplier.phoneTooLong': [
    'El teléfono es demasiado largo.',
    'O telefone é longo demais.',
  ],
  'problem.supplier.addressTooLong': [
    'La dirección es demasiado larga.',
    'O endereço é longo demais.',
  ],
  'problem.supplier.notesTooLong': [
    'Las notas son demasiado largas.',
    'As observações são longas demais.',
  ],
  'problem.supplier.companyTooLong': [
    'El nombre de la empresa es demasiado largo.',
    'O nome da empresa é longo demais.',
  ],
  'problem.supplier.contactNameTooLong': [
    'El nombre del contacto es demasiado largo.',
    'O nome do contato é longo demais.',
  ],
  'problem.supplier.profileWorkerUnavailable': [
    'No se encontró el trabajador.',
    'Trabalhador não encontrado.',
  ],
  'problem.supplier.grantRequired': [
    'Se requiere una autorización vigente del proveedor para el proyecto.',
    'É necessária uma autorização vigente do fornecedor para o projeto.',
  ],
  'problem.supplier.technicianScopeRequired': [
    'El técnico debe estar autorizado para este proyecto.',
    'O técnico deve estar autorizado para este projeto.',
  ],
  'problem.supplier.scopeRequired': [
    'Se requiere acceso al proveedor.',
    'É necessário acesso ao fornecedor.',
  ],
  'problem.supplier.coordinatorAccessChanged': [
    'Se requiere acceso de coordinador activo del proveedor.',
    'É necessário acesso de coordenador ativo do fornecedor.',
  ],
  'problem.supplier.ownerRequired': [
    'Se requiere administración del Propietario.',
    'É necessária administração do Proprietário.',
  ],
  'problem.supplier.accountRoleChanged': [
    'El rol de la cuenta cambió.',
    'A função da conta mudou.',
  ],
  'problem.supplier.timeSubmitStale': [
    'El registro de horas cambió o ya no se puede enviar.',
    'O registro de horas mudou ou não pode mais ser enviado.',
  ],
  'problem.supplier.timeEditStale': [
    'El registro de horas cambió o ya no se puede editar.',
    'O registro de horas mudou ou não pode mais ser editado.',
  ],
  'problem.supplier.timeDiscardStale': [
    'Este borrador cambió o ya no se puede descartar. Revisa su estado actual antes de intentarlo de nuevo.',
    'Este rascunho mudou ou não pode mais ser descartado. Revise o estado atual antes de tentar novamente.',
  ],
  'problem.supplier.timeDraftLocked': [
    'Solo se puede cambiar un borrador de horas desbloqueado que nunca se haya enviado.',
    'Só é possível alterar um rascunho de horas desbloqueado que nunca foi enviado.',
  ],
  'problem.supplier.timeCorrectionLocked': [
    'Este borrador de corrección no se puede editar ni eliminar aquí. Revisa su registro de corrección.',
    'Este rascunho de correção não pode ser editado nem excluído aqui. Revise o registro de correção.',
  ],
  'problem.supplier.timeCorrectionRequired': [
    'Las horas devueltas, enviadas o aprobadas requieren la vía de corrección revisada.',
    'Horas devolvidas, enviadas ou aprovadas exigem o procedimento de correção revisado.',
  ],
  'problem.supplier.timeCorrectionExists': [
    'Ya existe un borrador de corrección para este registro de horas.',
    'Já existe um rascunho de correção para este registro de horas.',
  ],
  'problem.supplier.timeCorrectionState': [
    'Solo las horas aprobadas o devueltas por un revisor pueden generar un borrador de corrección.',
    'Só horas aprovadas ou devolvidas por um revisor podem gerar um rascunho de correção.',
  ],
  'problem.supplier.timeFinanceLocked': [
    'Estas horas tienen historial financiero y no se pueden cambiar aquí. Consulta a un Propietario sobre un ajuste explícito.',
    'Estas horas têm histórico financeiro e não podem ser alteradas aqui. Contate um Proprietário sobre um ajuste explícito.',
  ],
  'problem.supplier.timeCorrectionReplay': [
    'La solicitud de corrección entra en conflicto con un intento anterior.',
    'A solicitação de correção entra em conflito com uma tentativa anterior.',
  ],
  'problem.supplier.timeCorrectionReason': [
    'El motivo de la corrección debe tener al menos 3 caracteres.',
    'O motivo da correção deve ter pelo menos 3 caracteres.',
  ],
  'problem.supplier.timeCorrectionEmpty': [
    'Cambia al menos un campo operativo antes de crear una corrección.',
    'Altere pelo menos um campo operacional antes de criar uma correção.',
  ],
  'problem.supplier.draftRecorderRequired': [
    'Solo el coordinador que registró este borrador puede descartarlo.',
    'Só o coordenador que registrou este rascunho pode descartá-lo.',
  ],
  'problem.supplier.minutesInvalid': [
    'Los minutos deben ser un número entero de 0 a 1440.',
    'Os minutos devem ser um número inteiro de 0 a 1440.',
  ],
  'problem.supplier.breakInvalid': [
    'Los minutos de descanso no son válidos.',
    'Os minutos de intervalo não são válidos.',
  ],
  'problem.supplier.timeNotFound': [
    'Este registro de horas ya no está disponible. Revisa los borradores actuales.',
    'Este registro de horas não está mais disponível. Revise os rascunhos atuais.',
  ],
  'problem.supplier.timeCorrectionStale': [
    'La corrección devuelta cambió antes de repetir la solicitud.',
    'A correção devolvida mudou antes da nova tentativa.',
  ],
  'problem.supplier.timeAssignmentDate': [
    'La asignación del trabajador no cubre la fecha de trabajo corregida.',
    'A atribuição do trabalhador não cobre a data de trabalho corrigida.',
  ],
  'problem.supplier.timeAssignmentRequired': [
    'El técnico ya no tiene una asignación activa para este proyecto y fecha. Consulta a un Propietario.',
    'O técnico não tem mais uma atribuição ativa para este projeto e data. Contate um Proprietário.',
  ],
  'problem.supplier.timeOwnershipRequired': [
    'Se requiere ser propietario de este registro de horas.',
    'É necessário ser proprietário deste registro de horas.',
  ],
  'problem.supplier.batchRequestInvalid': [
    'La solicitud de lote no es válida.',
    'A solicitação de lote não é válida.',
  ],
  'problem.supplier.timeWeekUnchanged': [
    'La semana de origen y la de destino deben ser distintas.',
    'A semana de origem e a de destino devem ser diferentes.',
  ],
  'problem.supplier.existingIntervalInvalid': [
    'Es necesario revisar un intervalo de horas existente antes de guardar nuevas horas.',
    'É necessário revisar um intervalo de horas existente antes de salvar novas horas.',
  ],
  'problem.supplier.sessionExpired': [
    'Se requiere una sesión autenticada vigente.',
    'É necessária uma sessão autenticada válida.',
  ],
  'problem.supplier.correctionConfigurationMissing': [
    'La identidad del despliegue no está configurada.',
    'A identidade da implantação não está configurada.',
  ],
  'problem.supplier.batchModeInvalid': [
    'Elige horas compartidas o individuales.',
    'Escolha horas compartilhadas ou individuais.',
  ],
  'problem.supplier.batchHoursRequired': [
    'Introduce las horas de cada técnico seleccionado.',
    'Informe as horas de cada técnico selecionado.',
  ],
  'problem.supplier.batchHoursInvalid': [
    'Introduce horas válidas para cada técnico seleccionado.',
    'Informe horas válidas para cada técnico selecionado.',
  ],
  'problem.supplier.batchHoursRange': [
    'Las horas individuales deben ser mayores que cero y no superar 24.',
    'As horas individuais devem ser maiores que zero e não ultrapassar 24.',
  ],
  'problem.supplier.batchModeConflict': [
    'Las horas individuales no pueden incluir un intervalo de tiempo compartido.',
    'Horas individuais não podem incluir um intervalo de tempo compartilhado.',
  ],
  'problem.supplier.intervalRequired': [
    'Se requieren las horas de inicio y fin.',
    'São necessários os horários de início e fim.',
  ],
  'problem.supplier.intervalInvalid': [
    'El intervalo de tiempo o el descanso no es válido.',
    'O intervalo de tempo ou a pausa não é válida.',
  ],
  'problem.supplier.durationRequired': [
    'Introduce las horas o una hora de inicio y fin.',
    'Informe as horas ou os horários de início e fim.',
  ],
  'problem.supplier.durationRange': [
    'La duración debe ser mayor que cero y no superar 24 horas.',
    'A duração deve ser maior que zero e não ultrapassar 24 horas.',
  ],
  'problem.supplier.durationModeInvalid': [
    'Elige una duración o un intervalo de tiempo.',
    'Escolha uma duração ou um intervalo de tempo.',
  ],
  'problem.supplier.confirmStatusChange': [
    'Confirma este cambio de estado antes de guardar.',
    'Confirme esta mudança de estado antes de salvar.',
  ],
  'problem.supplier.profileInvalid': [
    'Elige un perfil de proveedor válido.',
    'Escolha um perfil de fornecedor válido.',
  ],
  'problem.supplier.dateInvalid': [
    'Introduce una fecha real en formato AAAA-MM-DD.',
    'Informe uma data real no formato AAAA-MM-DD.',
  ],
  'problem.supplier.requiredField': [
    'Completa este campo obligatorio.',
    'Preencha este campo obrigatório.',
  ],
  'problem.supplier.assignmentGrantEnd': [
    'Esta asignación se extendería más allá del fin de la autorización del coordinador, {grantEnd}. Pide a un Propietario que revise la autorización o acorta la asignación.',
    'Esta atribuição ultrapassaria o fim da autorização do coordenador, {grantEnd}. Peça a um Proprietário que revise a autorização ou encurte a atribuição.',
  ],
  'problem.supplier.clockFormatInvalid': [
    'Introduce una hora válida en formato HH:mm.',
    'Informe um horário válido no formato HH:mm.',
  ],
  'problem.supplier.batchNoneSaved': [
    'No se guardó ningún registro de horas.',
    'Nenhum registro de horas foi salvo.',
  ],
  'Review linked invoice': ['Revisar la factura vinculada', 'Revisar a fatura vinculada'],
  'Review financial history': ['Revisar el historial financiero', 'Revisar o histórico financeiro'],
  'Review correction path': ['Revisar la vía de corrección', 'Revisar o procedimento de correção'],
  'Sign in again': ['Volver a iniciar sesión', 'Entrar novamente'],
  'problem.management.ownerRequired': [
    'Se requiere acceso de Propietario para este cambio. Consulta a un Propietario.',
    'É necessário acesso de Proprietário para esta alteração. Contate um Proprietário.',
  ],
  'problem.management.confirmOperation': [
    'Confirma la operación antes de guardar.',
    'Confirme a operação antes de salvar.',
  ],
  'problem.finance.previewInvalidFields': [
    'Revisa los campos del ejemplo señalados y vuelve a calcular.',
    'Revise os campos do exemplo destacados e calcule novamente.',
  ],
  'problem.finance.previewPayerConflict': [
    'Un gasto pagado directamente por el cliente no puede haber sido adelantado también por el trabajador. Cambia el tratamiento del gasto o el pagador.',
    'Uma despesa paga diretamente pelo cliente não pode também ter sido adiantada pelo trabalhador. Altere o tratamento da despesa ou o pagador.',
  ],
  'problem.finance.previewPeriodInvalid': [
    'Introduce fechas válidas para el ejemplo y el ancla antes de calcular los períodos de facturación.',
    'Informe datas válidas para o exemplo e a âncora antes de calcular os períodos de faturamento.',
  ],
  'problem.finance.previewCalculationInvalid': [
    'El ejemplo no se puede calcular con estos valores. Revisa las tarifas, horas y multiplicadores.',
    'O exemplo não pode ser calculado com estes valores. Revise as tarifas, horas e multiplicadores.',
  ],
  'problem.finance.previewRoleRequired': [
    'Se requiere acceso a Finanzas para calcular este ejemplo. Consulta a Finanzas o a un propietario.',
    'É necessário acesso a Finanças para calcular este exemplo. Contate Finanças ou um proprietário.',
  ],
  'problem.finance.previewSessionRequired': [
    'Vuelve a iniciar sesión antes de calcular este ejemplo financiero.',
    'Entre novamente antes de calcular este exemplo financeiro.',
  ],
  'problem.remedy.reviewOwnerAccess': [
    'Revisar el acceso de propietarios',
    'Revisar o acesso de proprietários',
  ],
  'problem.remedy.reviewUserStatus': [
    'Revisar el estado del usuario',
    'Revisar o estado do usuário',
  ],
  'problem.remedy.reviewExistingPerson': [
    'Revisar la persona existente',
    'Revisar a pessoa existente',
  ],
  'problem.remedy.reviewSupplierProfile': [
    'Revisar el perfil de proveedor',
    'Revisar o perfil de fornecedor',
  ],
  'problem.remedy.reviewUserAccess': [
    'Revisar el acceso del usuario',
    'Revisar o acesso do usuário',
  ],
  'problem.remedy.reviewMailboxIdentity': [
    'Revisar la identidad del buzón',
    'Revisar a identidade da caixa de correio',
  ],
  'problem.remedy.reviewUpdatedRecord': [
    'Revisar el registro actualizado',
    'Revisar o registro atualizado',
  ],
  'problem.remedy.correctEmail': ['Corregir el correo', 'Corrigir o e-mail'],
  'problem.remedy.enterReason': ['Introducir un motivo', 'Informar um motivo'],
  'Linked hours unavailable': ['Horas vinculadas no disponibles', 'Horas vinculadas indisponíveis'],
  'The selected logged hours are no longer available. Review the link before saving.': [
    'Las horas registradas seleccionadas ya no están disponibles. Revisa el vínculo antes de guardar.',
    'As horas registradas selecionadas não estão mais disponíveis. Revise o vínculo antes de salvar.',
  ],
  'problem.access.lastOwnerRequired': [
    'El último propietario activo debe conservar el acceso de propietario. Añade otro propietario antes de cambiar este rol.',
    'O último proprietário ativo deve manter o acesso de proprietário. Adicione outro proprietário antes de alterar esta função.',
  ],
  'problem.access.selfStatusBlocked': [
    'Un propietario no puede cambiar aquí el estado de su propia cuenta. Pide a otro propietario autorizado que revise la cuenta.',
    'Um proprietário não pode alterar aqui o estado da própria conta. Peça a outro proprietário autorizado que revise a conta.',
  ],
  'problem.access.canonicalOwnerProtected': [
    'La cuenta del propietario designado no se puede cambiar mediante esta acción de buzón.',
    'A conta do proprietário designado não pode ser alterada por esta ação de caixa de correio.',
  ],
  'problem.access.userInactive': [
    'Esta cuenta del portal está inactiva. Revisa su estado antes de cambiar el acceso al buzón.',
    'Esta conta do portal está inativa. Revise o estado antes de alterar o acesso à caixa de correio.',
  ],
  'problem.access.mailIdentityStale': [
    'Este vínculo de buzón cambió o se eliminó. Revisa la cuenta actualizada antes de intentarlo de nuevo.',
    'Este vínculo de caixa de correio mudou ou foi removido. Revise a conta atualizada antes de tentar novamente.',
  ],
  'problem.access.reasonRequired': [
    'Introduce un motivo para este cambio de acceso a la cuenta.',
    'Informe um motivo para esta alteração de acesso à conta.',
  ],
  'problem.access.emailAlreadyUsed': [
    'Una cuenta del portal ya utiliza este correo. Elige la persona existente u otro correo.',
    'Uma conta do portal já usa este e-mail. Escolha a pessoa existente ou outro e-mail.',
  ],
  'problem.access.personAlreadyHasLogin': [
    'Esta persona ya tiene acceso al portal. Revisa su cuenta existente en lugar de crear otro inicio de sesión.',
    'Esta pessoa já tem acesso ao portal. Revise a conta existente em vez de criar outro login.',
  ],
  'problem.access.personInactive': [
    'La persona seleccionada ya no está activa. Revisa su estado o elige una persona activa.',
    'A pessoa selecionada não está mais ativa. Revise o estado ou escolha uma pessoa ativa.',
  ],
  'problem.access.personRoleMismatch': [
    'La persona seleccionada tiene otro rol. Revisa su rol antes de conceder este acceso.',
    'A pessoa selecionada tem outra função. Revise a função antes de conceder este acesso.',
  ],
  'problem.access.personSupplierMismatch': [
    'La persona seleccionada pertenece a otro perfil de proveedor. Revisa ese perfil antes de conceder acceso.',
    'A pessoa selecionada pertence a outro perfil de fornecedor. Revise esse perfil antes de conceder acesso.',
  ],
  'problem.access.supplierHistoryLocked': [
    'Esta persona tiene historial de horas como proveedor. Revisa el perfil de proveedor existente antes de cambiarlo.',
    'Esta pessoa tem histórico de horas como fornecedor. Revise o perfil de fornecedor existente antes de alterá-lo.',
  ],
  'problem.access.supplierLoginRequired': [
    'Un coordinador de proveedor necesita acceso funcional al portal. Crea o restaura primero su inicio de sesión.',
    'Um coordenador de fornecedor precisa de acesso funcional ao portal. Crie ou restaure o login primeiro.',
  ],
  'problem.access.supplierWorkerRequired': [
    'Solo las cuentas de trabajador pueden recibir un perfil de proveedor. Elige un trabajador o revisa el rol de esta persona.',
    'Só contas de trabalhador podem receber um perfil de fornecedor. Escolha um trabalhador ou revise a função desta pessoa.',
  ],
  'problem.access.emailInvalid': [
    'Introduce una dirección de correo válida para esta cuenta del portal.',
    'Informe um endereço de e-mail válido para esta conta do portal.',
  ],
  'problem.access.workforceProfileInvalid': [
    'Elige una persona y un perfil laboral válido.',
    'Escolha uma pessoa e um perfil de trabalho válido.',
  ],
  'problem.access.localCredentialsInvalid': [
    'Se requiere un nombre y una contraseña de 12 a 128 caracteres.',
    'É necessário um nome e uma senha de 12 a 128 caracteres.',
  ],
  'problem.access.localRoleInvalid': [
    'Elige un rol de acceso válido.',
    'Escolha uma função de acesso válida.',
  ],
  'problem.access.supplierRequired': [
    'Selecciona un proveedor para este rol de acceso.',
    'Selecione um fornecedor para esta função de acesso.',
  ],
  'problem.access.statusInvalid': [
    'Elige una persona y un estado de cuenta válido.',
    'Escolha uma pessoa e um estado de conta válido.',
  ],
  'problem.access.workerProfileInvalid': [
    'Completa el nombre, correo y rol de la persona antes de guardar.',
    'Preencha o nome, e-mail e função da pessoa antes de salvar.',
  ],
  'problem.access.linkedMailboxEmail': [
    'Esta persona tiene una dirección de buzón vinculada. Cambia la identidad del buzón mediante el procedimiento autorizado de cuentas de correo.',
    'Esta pessoa tem um endereço de caixa de correio vinculado. Altere a identidade da caixa de correio pelo procedimento autorizado de contas de e-mail.',
  ],
  'Project no longer available': ['Proyecto ya no disponible', 'Projeto não está mais disponível'],
  'This project is no longer available for this expense. Review the project selection before saving.':
    [
      'Este proyecto ya no está disponible para este gasto. Revisa la selección del proyecto antes de guardar.',
      'Este projeto não está mais disponível para esta despesa. Revise a seleção do projeto antes de salvar.',
    ],
  'problem.remedy.reviewAssignments': ['Revisar asignaciones', 'Revisar atribuições'],
  'problem.remedy.chooseAvailableWorker': [
    'Elegir un trabajador disponible',
    'Escolher um trabalhador disponível',
  ],
  'problem.project.clientCurrencyMismatch': [
    'La moneda del proyecto debe coincidir con la del cliente seleccionado.',
    'A moeda do projeto deve corresponder à moeda do cliente selecionado.',
  ],
  'problem.project.initialWorkerDuplicate': [
    'Se seleccionó un trabajador más de una vez. Deja una sola entrada por trabajador.',
    'Um trabalhador foi selecionado mais de uma vez. Mantenha apenas uma entrada por trabalhador.',
  ],
  'problem.project.initialWorkerUnavailable': [
    'Un trabajador seleccionado ya no está activo. Elige un trabajador disponible.',
    'Um trabalhador selecionado não está mais ativo. Escolha um trabalhador disponível.',
  ],
  'problem.project.initialWorkerDateOutsideProject': [
    'La asignación del trabajador debe comenzar dentro de las fechas del proyecto. Revisa la fecha de inicio.',
    'A atribuição do trabalhador deve começar dentro das datas do projeto. Revise a data de início.',
  ],
  'Review client currency': ['Revisar la moneda del cliente', 'Revisar a moeda do cliente'],
  'Review selected workers': [
    'Revisar los trabajadores seleccionados',
    'Revisar os trabalhadores selecionados',
  ],
  'Review project dates': ['Revisar las fechas del proyecto', 'Revisar as datas do projeto'],
  'problem.project.assignmentOverlap': [
    'Este trabajador ya tiene una asignación que se solapa en este proyecto. Revisa las fechas de la asignación existente.',
    'Este trabalhador já tem uma atribuição sobreposta neste projeto. Revise as datas da atribuição existente.',
  ],
  'problem.project.assignmentWorkerUnavailable': [
    'Este trabajador ya no está activo. Elige un trabajador disponible antes de asignarlo.',
    'Este trabalhador não está mais ativo. Escolha um trabalhador disponível antes de atribuí-lo.',
  ],
  'problem.client.stale': [
    'Este cliente cambió mientras lo editabas. Revisa el cliente actualizado antes de guardar de nuevo.',
    'Este cliente mudou durante a edição. Revise o cliente atualizado antes de salvar novamente.',
  ],
  'problem.project.stale': [
    'Este proyecto cambió mientras lo editabas. Revisa su estado actual antes de guardar de nuevo.',
    'Este projeto mudou durante a edição. Revise o estado atual antes de salvar novamente.',
  ],
  'problem.assignment.stale': [
    'Esta asignación cambió mientras la editabas. Revisa las fechas actuales antes de guardar de nuevo.',
    'Esta atribuição mudou durante a edição. Revise as datas atuais antes de salvar novamente.',
  ],
  'problem.client.closeOpenProjects': [
    'Cierra o archiva los proyectos abiertos del cliente antes de cerrar el cliente.',
    'Feche ou arquive os projetos abertos do cliente antes de fechar o cliente.',
  ],
  'problem.project.clientArchived': [
    'El cliente está archivado. Revisa el estado del cliente antes de activar este proyecto.',
    'O cliente está arquivado. Revise o estado do cliente antes de ativar este projeto.',
  ],
  'problem.client.transitionNotAllowed': [
    'El cambio de estado solicitado para el cliente no está permitido desde su estado actual.',
    'A mudança de estado solicitada para o cliente não é permitida a partir do estado atual.',
  ],
  'problem.project.transitionNotAllowed': [
    'El cambio de estado solicitado para el proyecto no está permitido desde su estado actual.',
    'A mudança de estado solicitada para o projeto não é permitida a partir do estado atual.',
  ],
  'problem.record.notArchived': [
    'Solo se puede restaurar un registro archivado. Revisa su estado actual.',
    'Só é possível restaurar um registro arquivado. Revise o estado atual.',
  ],
  'problem.record.restoreTargetMissing': [
    'Este registro archivado no tiene un estado anterior seguro al que restaurarlo. Consulta al propietario para su revisión.',
    'Este registro arquivado não tem um estado anterior seguro para restauração. Contate o proprietário para revisão.',
  ],
  'problem.client.deleteHasProjects': [
    'Este cliente aún tiene proyectos. Revísalos y archiva el cliente si se debe conservar el historial.',
    'Este cliente ainda tem projetos. Revise-os e arquive o cliente se o histórico precisar ser preservado.',
  ],
  'problem.client.deleteHasInvoices': [
    'Este cliente aparece en el historial de facturas. Archívalo en lugar de eliminarlo.',
    'Este cliente aparece no histórico de faturas. Arquive-o em vez de excluí-lo.',
  ],
  'problem.client.contactBillingHistory': [
    'Este contacto se usa en el historial de facturación y no se puede eliminar. Actualiza el contacto de facturación activo.',
    'Este contato é usado no histórico de faturamento e não pode ser excluído. Atualize o contato de faturamento ativo.',
  ],
  'problem.client.billingContactRequired': [
    'Mantén un correo de facturación u otro contacto de facturación antes de eliminar este contacto.',
    'Mantenha um e-mail de faturamento ou outro contato de faturamento antes de remover este contato.',
  ],
  'problem.assignment.inactive': [
    'Esta asignación ya no está activa. Revisa la asignación actual antes de hacer cambios.',
    'Esta atribuição não está mais ativa. Revise a atribuição atual antes de fazer alterações.',
  ],
  'problem.project.activeClientRequired': [
    'El cliente seleccionado ya no está activo. Elige un cliente activo o revisa su estado.',
    'O cliente selecionado não está mais ativo. Escolha um cliente ativo ou revise o estado dele.',
  ],
  'problem.project.managerUnavailable': [
    'El responsable de proyecto seleccionado ya no está activo. Elige un responsable disponible.',
    'O gerente de projeto selecionado não está mais ativo. Escolha um gerente disponível.',
  ],
  'problem.project.deleteHasTime': [
    'Este proyecto tiene registros de horas y no se puede eliminar. Archiva el proyecto.',
    'Este projeto tem registros de horas e não pode ser excluído. Arquive o projeto.',
  ],
  'problem.project.deleteHasExpenses': [
    'Este proyecto tiene gastos y no se puede eliminar. Archiva el proyecto.',
    'Este projeto tem despesas e não pode ser excluído. Arquive o projeto.',
  ],
  'problem.project.deleteHasInvoices': [
    'Este proyecto tiene facturas y no se puede eliminar. Archiva el proyecto.',
    'Este projeto tem faturas e não pode ser excluído. Arquive o projeto.',
  ],
  'problem.project.deleteHasDailyReports': [
    'Este proyecto tiene partes diarios de campo y no se puede eliminar. Archiva el proyecto.',
    'Este projeto tem relatórios diários de campo e não pode ser excluído. Arquive o projeto.',
  ],
  'problem.project.deleteHasTechnicalReports': [
    'Este proyecto tiene informes técnicos y no se puede eliminar. Archiva el proyecto.',
    'Este projeto tem relatórios técnicos e não pode ser excluído. Arquive o projeto.',
  ],
  'Choose an active worker.': ['Elige un trabajador activo.', 'Escolha um trabalhador ativo.'],
  'Review assignments': ['Revisar asignaciones', 'Revisar atribuições'],
  'Choose an available worker': [
    'Elegir un trabajador disponible',
    'Escolher um trabalhador disponível',
  ],
  'Review client projects': ['Revisar los proyectos del cliente', 'Revisar os projetos do cliente'],
  'Review client status': ['Revisar el estado del cliente', 'Revisar o estado do cliente'],
  'Archive client': ['Archivar cliente', 'Arquivar cliente'],
  'Close client': ['Cerrar cliente', 'Fechar cliente'],
  'Reopen client': ['Reabrir cliente', 'Reabrir cliente'],
  'Review billing contact': [
    'Revisar el contacto de facturación',
    'Revisar o contato de faturamento',
  ],
  'Add billing contact': ['Añadir contacto de facturación', 'Adicionar contato de faturamento'],
  'Archive project': ['Archivar proyecto', 'Arquivar projeto'],
  'Choose an available manager': [
    'Elegir un responsable disponible',
    'Escolher um gerente disponível',
  ],
  'This crew member is no longer available for this project and date. Review the selection before saving.':
    [
      'Este miembro del equipo ya no está disponible para este proyecto y fecha. Revisa la selección antes de guardar.',
      'Este integrante da equipe não está mais disponível para este projeto e data. Revise a seleção antes de salvar.',
    ],
  'Crew member unavailable': [
    'Miembro del equipo no disponible',
    'Integrante da equipe indisponível',
  ],
  'problem.billing.ownerRequired': [
    'Un propietario debe realizar esta acción de facturación. Consulta a un propietario para revisar el registro.',
    'Um proprietário deve realizar esta ação de faturamento. Contate um proprietário para revisar o registro.',
  ],
  'problem.billing.financeRequired': [
    'Se requiere acceso a Finanzas para esta acción de facturación. Consulta a un administrador de Finanzas.',
    'É necessário acesso a Finanças para esta ação de faturamento. Contate um administrador de Finanças.',
  ],
  'problem.billing.idempotencyReused': [
    'Esta clave de solicitud ya se usó con otros datos. Revisa el registro existente antes de enviar una nueva solicitud.',
    'Esta chave de solicitação já foi usada com outros dados. Revise o registro existente antes de enviar uma nova solicitação.',
  ],
  'problem.billing.recordChanged': [
    'Este registro de facturación o sus orígenes cambiaron mientras lo revisabas. Revisa el registro actual antes de decidir qué hacer.',
    'Este registro de faturamento ou suas origens mudaram durante a revisão. Revise o registro atual antes de decidir o que fazer.',
  ],
  'problem.billing.approvedInvoiceRequired': [
    'Esta factura ya no es un borrador aprobado sin emitir. Revisa su estado actual antes de recalcularla o emitirla.',
    'Esta fatura não é mais um rascunho aprovado e não emitido. Revise o estado atual antes de recalcular ou emitir.',
  ],
  'problem.billing.draftStateRequired': [
    'La factura ya pasó del estado de borrador editable. Revísala antes de hacer otro cambio.',
    'A fatura já passou do estado de rascunho editável. Revise-a antes de fazer outra alteração.',
  ],
  'problem.billing.pdfNotReady': [
    'El PDF de la factura sigue pendiente o falló. Comprueba el estado del archivo antes de enviarlo o descargarlo.',
    'O PDF da fatura ainda está pendente ou falhou. Confira o estado do arquivo antes de enviar ou baixar.',
  ],
  'problem.billing.exportFailed': [
    'Esta exportación falló. Revisa el estado del paquete y solicita un nuevo intento autorizado para este archivo.',
    'Esta exportação falhou. Revise o estado do pacote e solicite uma nova tentativa autorizada para este arquivo.',
  ],
  'problem.billing.exportPending': [
    'Esta exportación sigue en cola o en proceso. Comprueba el estado del paquete antes de descargarla.',
    'Esta exportação ainda está na fila ou em processamento. Confira o estado do pacote antes de baixar.',
  ],
  'problem.billing.packFinal': [
    'Este paquete contable es definitivo y no se puede cambiar. Revisa los archivos existentes o crea una nueva revisión.',
    'Este pacote contábil é final e não pode ser alterado. Revise os arquivos existentes ou crie uma nova revisão.',
  ],
  'problem.billing.voidCollectionsPresent': [
    'Esta factura tiene cobros. Revisa y revierte los pagos correspondientes antes de que un propietario pueda anularla.',
    'Esta fatura tem recebimentos. Revise e estorne os pagamentos aplicáveis antes que um proprietário possa anulá-la.',
  ],
  'problem.billing.paymentBlocked': [
    'El pago no se puede registrar en el estado actual de la factura o con este importe o fecha. Revisa el libro de la factura y los datos del pago.',
    'O pagamento não pode ser registrado no estado atual da fatura ou com este valor ou data. Revise o livro da fatura e os dados do pagamento.',
  ],
  'problem.billing.invoiceStateBlocked': [
    'La factura no está en un estado que permita esta acción. Revisa su estado actual y su historial.',
    'A fatura não está em um estado que permita esta ação. Revise o estado atual e o histórico.',
  ],
  'problem.billing.issueConfigurationBlocked': [
    'La entidad emisora, el perfil fiscal o la moneda de la factura ya no están listos para emitirla. Pide a Finanzas que revise la configuración.',
    'A entidade emissora, o perfil fiscal ou a moeda da fatura não estão mais prontos para emissão. Peça à equipe de Finanças que revise a configuração.',
  ],
  'problem.billing.recalculationDetailsRequired': [
    'Introduce un motivo y usa la versión actual de la factura antes de recalcularla.',
    'Informe um motivo e use a versão atual da fatura antes de recalcular.',
  ],
  'problem.billing.adjustmentAmountBlocked': [
    'El importe del ajuste no es válido o supera el importe restante de la factura original. Revisa sus abonos y el importe.',
    'O valor do ajuste é inválido ou excede o valor restante da fatura original. Revise os créditos e o valor.',
  ],
  'action.billing.invoiceAlreadyIssued': [
    'La factura {invoiceNumber} ya se emitió.',
    'A fatura {invoiceNumber} já foi emitida.',
  ],
  'action.billing.paymentAlreadyRecorded': [
    'Este pago ya está registrado.',
    'Este pagamento já foi registrado.',
  ],
  'problem.document.notFound': [
    'Este documento ya no está disponible. Actualiza la lista de documentos antes de continuar.',
    'Este documento não está mais disponível. Atualize a lista de documentos antes de continuar.',
  ],
  'problem.document.accessRequired': [
    'No tienes permiso para cambiar este documento. Consulta a su propietario o a un administrador autorizado.',
    'Você não tem permissão para alterar este documento. Contate o proprietário ou um administrador autorizado.',
  ],
  'problem.document.traceableImmutable': [
    'Este documento forma parte del historial trazable. Archívalo o sustitúyelo mediante el procedimiento permitido.',
    'Este documento faz parte do histórico rastreável. Arquive-o ou substitua-o pelo procedimento permitido.',
  ],
  'problem.document.changed': [
    'El documento cambió mientras este formulario estaba abierto. Revisa su estado actual antes de intentar otra acción.',
    'O documento mudou enquanto este formulário estava aberto. Revise o estado atual antes de tentar outra ação.',
  ],
  'problem.document.archiveReasonRequired': [
    'Introduce un motivo de archivo de 3 a 500 caracteres.',
    'Informe um motivo de arquivamento de 3 a 500 caracteres.',
  ],
  'Review invoice': ['Revisar factura', 'Revisar fatura'],
  'Review invoice ledger': ['Revisar el libro de la factura', 'Revisar o livro da fatura'],
  'Review billing setup': [
    'Revisar la configuración de facturación',
    'Revisar a configuração de faturamento',
  ],
  'Review accounting pack': ['Revisar el paquete contable', 'Revisar o pacote contábil'],
  'Contact a finance administrator': [
    'Consultar a un administrador de Finanzas',
    'Contatar um administrador de Finanças',
  ],
  'Contact an owner': ['Consultar a un propietario', 'Contatar um proprietário'],
  'Contact the project owner to review access.': [
    'Consulta al propietario del proyecto para revisar el acceso.',
    'Contate o proprietário do projeto para revisar o acesso.',
  ],
  'Review logged hours': ['Revisar las horas registradas', 'Revisar as horas registradas'],
  'problem.time.weekChanged': [
    'La semana cambió desde que la abriste. Revisa los borradores actuales antes de enviarla.',
    'A semana mudou depois que você a abriu. Revise os rascunhos atuais antes de enviar.',
  ],
  'problem.time.linkedMealChanged': [
    'Una comida vinculada ya no coincide con su registro de horas. Revisa ambos borradores antes de enviar la semana.',
    'Uma refeição vinculada não corresponde mais ao registro de horas. Revise os dois rascunhos antes de enviar a semana.',
  ],
  'problem.time.submissionChanged': [
    'Este registro de horas cambió o ya no es un borrador. Revisa su estado actual antes de enviarlo.',
    'Este registro de horas mudou ou não é mais um rascunho. Revise o estado atual antes de enviar.',
  ],
  'problem.time.draftChanged': [
    'Este registro de horas cambió mientras lo editabas. Revisa el borrador actual antes de guardar.',
    'Este registro de horas mudou durante a edição. Revise o rascunho atual antes de salvar.',
  ],
  'problem.time.notEditableDraft': [
    'Solo se puede editar un borrador de horas desbloqueado que nunca se haya enviado. Revisa el registro o solicita una corrección.',
    'Só é possível editar um rascunho de horas desbloqueado que nunca foi enviado. Revise o registro ou solicite uma correção.',
  ],
  'problem.time.assignmentRequired': [
    'Una asignación activa al proyecto debe cubrir esta fecha de trabajo. Consulta al propietario del proyecto para revisar el acceso.',
    'Uma atribuição ativa ao projeto deve cobrir esta data de trabalho. Contate o proprietário do projeto para revisar o acesso.',
  ],
  'problem.time.workerAssignmentRequired': [
    'El trabajador seleccionado no tiene una asignación activa que cubra esta fecha de trabajo. Revisa el trabajador y la fecha.',
    'O trabalhador selecionado não tem uma atribuição ativa que cubra esta data de trabalho. Revise o trabalhador e a data.',
  ],
  'problem.time.intervalOverlap': [
    'Este trabajador ya tiene horas registradas en el intervalo seleccionado. Ajusta la hora de inicio o fin.',
    'Este trabalhador já tem horas registradas no intervalo selecionado. Ajuste o horário de início ou fim.',
  ],
  'problem.time.expenseRetryChanged': [
    'Esta solicitud de horas y comida ya se usó con otros datos. Revisa los borradores guardados antes de intentarlo de nuevo.',
    'Esta solicitação de horas e refeição já foi usada com outros dados. Revise os rascunhos salvos antes de tentar novamente.',
  ],
  'problem.time.correctionDraftLocked': [
    'Este borrador de corrección vinculado no se puede editar aquí. Revisa su registro de corrección.',
    'Este rascunho de correção vinculado não pode ser editado aqui. Revise o registro de correção.',
  ],
  'problem.time.correctionRequired': [
    'Las horas revisadas no se pueden eliminar. Abre el registro y solicita una corrección auditada.',
    'Horas revisadas não podem ser excluídas. Abra o registro e solicite uma correção auditada.',
  ],
  'problem.time.lockedOrInvoiced': [
    'Las horas bloqueadas o facturadas no se pueden anular. Consulta a Finanzas para un ajuste auditado.',
    'Horas bloqueadas ou faturadas não podem ser anuladas. Contate a equipe de Finanças para um ajuste auditado.',
  ],
  'problem.time.allocatedReceipt': [
    'Estas horas de equipo están vinculadas a un recibo repartido. Revisa el reparto y solicita una corrección documentada.',
    'Estas horas da equipe estão vinculadas a um recibo distribuído. Revise a distribuição e solicite uma correção documentada.',
  ],
  'problem.time.allocatedReceiptDateLocked': [
    'La fecha de trabajo no se puede cambiar mientras estas horas de equipo estén vinculadas a un recibo repartido. Revisa el reparto y solicita una corrección documentada.',
    'A data de trabalho não pode mudar enquanto estas horas da equipe estiverem vinculadas a um recibo distribuído. Revise a distribuição e solicite uma correção documentada.',
  ],
  'problem.time.deleteChanged': [
    'Este registro de horas cambió antes de eliminarlo. Revisa su estado actual.',
    'Este registro de horas mudou antes da exclusão. Revise o estado atual.',
  ],
  'problem.time.batchDuplicateDay': [
    'El lote contiene más de un registro para un día. Deja un registro por día y guarda de nuevo.',
    'O lote contém mais de um registro para um dia. Mantenha um registro por dia e salve novamente.',
  ],
  'problem.time.weekStartInvalid': [
    'Selecciona una semana que comience en lunes y revisa sus borradores antes de enviarla.',
    'Selecione uma semana que comece na segunda-feira e revise os rascunhos antes de enviar.',
  ],
  'problem.time.minutesInvalid': [
    'Introduce un número entero de minutos entre 0 y 1440.',
    'Informe um número inteiro de minutos entre 0 e 1440.',
  ],
  'problem.time.dailyLimit': [
    'Este trabajador ya tiene horas en el día seleccionado. El total no puede superar las 24 horas.',
    'Este trabalhador já tem horas no dia selecionado. O total não pode ultrapassar 24 horas.',
  ],
  'problem.time.intervalIncomplete': [
    'Indica tanto la hora de inicio como la de fin, o deja ambas vacías.',
    'Informe os horários de início e fim ou deixe ambos vazios.',
  ],
  'problem.time.intervalOrderInvalid': [
    'La hora de fin debe ser posterior a la de inicio en el mismo día.',
    'O horário de fim deve ser posterior ao de início no mesmo dia.',
  ],
  'problem.time.breakInvalid': [
    'Los minutos de descanso deben ser un número entero dentro del turno.',
    'Os minutos de intervalo devem ser um número inteiro dentro do turno.',
  ],
  'problem.time.durationMismatch': [
    'Los minutos registrados deben coincidir con el tiempo entre el inicio y el fin, descontando el descanso.',
    'Os minutos registrados devem corresponder ao tempo entre o início e o fim, descontando o intervalo.',
  ],
  'problem.expense.submissionBlocked': [
    'Este gasto cambió, ya no es un borrador o requiere un recibo. Revisa su estado actual y adjunta un recibo si hace falta.',
    'Esta despesa mudou, não é mais um rascunho ou exige um recibo. Revise o estado atual e anexe um recibo, se necessário.',
  ],
  'problem.expense.notEditableDraft': [
    'Solo se puede editar un borrador de gasto desbloqueado. Revisa el registro o solicita una corrección.',
    'Só é possível editar um rascunho de despesa desbloqueado. Revise o registro ou solicite uma correção.',
  ],
  'problem.expense.draftChanged': [
    'Este gasto cambió mientras lo editabas. Revisa el registro actual antes de guardar.',
    'Esta despesa mudou durante a edição. Revise o registro atual antes de salvar.',
  ],
  'problem.expense.receiptRequired': [
    'Adjunta un recibo confirmado antes de guardar este gasto.',
    'Anexe um recibo confirmado antes de salvar esta despesa.',
  ],
  'problem.expense.receiptAlreadyClaimed': [
    'Este recibo ya se usó en un gasto del proyecto. Revisa la solicitud existente antes de enviar otra.',
    'Este recibo já foi usado em uma despesa do projeto. Revise a solicitação existente antes de enviar outra.',
  ],
  'problem.expense.retryChanged': [
    'Este identificador de solicitud ya se usó con otros datos del gasto. Revisa el gasto guardado antes de intentarlo de nuevo.',
    'Este identificador de solicitação já foi usado com outros dados da despesa. Revise a despesa salva antes de tentar novamente.',
  ],
  'problem.expense.assignmentRequired': [
    'Una asignación activa al proyecto debe cubrir la fecha del gasto. Consulta al propietario del proyecto para revisar el acceso.',
    'Uma atribuição ativa ao projeto deve cobrir a data da despesa. Contate o proprietário do projeto para revisar o acesso.',
  ],
  'problem.expense.timeLinkInvalid': [
    'El registro de horas vinculado debe estar activo y coincidir con este trabajador, proyecto y fecha. Revisa el registro de horas.',
    'O registro de horas vinculado deve estar ativo e corresponder a este trabalhador, projeto e data. Revise o registro de horas.',
  ],
  'problem.expense.amountInvalid': [
    'Introduce un importe de gasto mayor que cero.',
    'Informe um valor de despesa maior que zero.',
  ],
  'problem.expense.receiptProjectMismatch': [
    'Este recibo no pertenece al proyecto seleccionado. Elige un recibo de este proyecto.',
    'Este recibo não pertence ao projeto selecionado. Escolha um recibo deste projeto.',
  ],
  'problem.expense.correctionDraftLocked': [
    'Este borrador de corrección vinculado no se puede editar aquí. Revisa su registro de corrección.',
    'Este rascunho de correção vinculado não pode ser editado aqui. Revise o registro de correção.',
  ],
  'problem.expense.allocatedReceiptLocked': [
    'Este recibo está repartido entre turnos del equipo. Revisa el reparto y crea una corrección documentada.',
    'Este recibo está distribuído entre turnos da equipe. Revise a distribuição e crie uma correção documentada.',
  ],
  'problem.expense.receiptNotAvailable': [
    'El recibo seleccionado no está disponible o no se confirmó para tu cuenta. Adjunta un recibo válido.',
    'O recibo selecionado está indisponível ou não foi confirmado para sua conta. Anexe um recibo válido.',
  ],
  'problem.expense.receiptAlreadyRegistered': [
    'Este recibo ya está adjunto a otro registro. Revisa la solicitud existente antes de enviar otra.',
    'Este recibo já está anexado a outro registro. Revise a solicitação existente antes de enviar outra.',
  ],
  'problem.expense.deleteDraftOnly': [
    'Solo se puede eliminar un borrador de gasto que nunca se haya enviado. Revisa el registro o solicita una corrección.',
    'Só é possível excluir um rascunho de despesa que nunca foi enviado. Revise o registro ou solicite uma correção.',
  ],
  'problem.expense.billedOrLocked': [
    'Los gastos facturados o bloqueados no se pueden eliminar. Consulta a Finanzas para un ajuste auditado.',
    'Despesas faturadas ou bloqueadas não podem ser excluídas. Contate a equipe de Finanças para um ajuste auditado.',
  ],
  'problem.expense.deleteChanged': [
    'Este gasto cambió antes de eliminarlo. Revisa su estado actual.',
    'Esta despesa mudou antes da exclusão. Revise o estado atual.',
  ],
  'problem.report.draftChanged': [
    'Este informe cambió mientras lo editabas. Revisa la versión actual antes de guardar.',
    'Este relatório mudou durante a edição. Revise a versão atual antes de salvar.',
  ],
  'problem.report.submissionChanged': [
    'Este informe cambió o ya no es un borrador. Revisa la versión actual antes de enviarlo.',
    'Este relatório mudou ou não é mais um rascunho. Revise a versão atual antes de enviar.',
  ],
  'problem.report.correctionRequired': [
    'Los informes enviados o aprobados requieren un borrador de corrección auditado antes de editarlos.',
    'Relatórios enviados ou aprovados exigem um rascunho de correção auditado antes da edição.',
  ],
  'problem.report.finalized': [
    'Este informe forma parte de un informe finalizado. Revisa el registro actual y solicita una corrección con nueva versión.',
    'Este relatório faz parte de um relatório finalizado. Revise o registro atual e solicite uma correção com nova versão.',
  ],
  'problem.report.correctionDraftLocked': [
    'Este borrador de corrección vinculado no se puede editar aquí. Revisa su registro de corrección.',
    'Este rascunho de correção vinculado não pode ser editado aqui. Revise o registro de correção.',
  ],
  'problem.report.deleteDraftOnly': [
    'Solo se puede eliminar un borrador de informe que nunca se haya enviado. Revisa el informe o solicita una corrección.',
    'Só é possível excluir um rascunho de relatório que nunca foi enviado. Revise o relatório ou solicite uma correção.',
  ],
  'problem.report.reviewHistoryLocked': [
    'Este informe tiene historial de revisión y no se puede eliminar. Solicita una corrección auditada.',
    'Este relatório tem histórico de revisão e não pode ser excluído. Solicite uma correção auditada.',
  ],
  'problem.report.linkedTechnicalChanges': [
    'Este informe tiene cambios técnicos vinculados. Revísalos antes de eliminar el borrador.',
    'Este relatório tem alterações técnicas vinculadas. Revise-as antes de excluir o rascunho.',
  ],
  'problem.report.deleteChanged': [
    'Este registro cambió antes de eliminarlo. Revisa su estado actual.',
    'Este registro mudou antes da exclusão. Revise o estado atual.',
  ],
  'problem.report.reviewStateChanged': [
    'Este informe ya no está enviado para revisión. Abre la versión actual antes de tomar una decisión.',
    'Este relatório não está mais enviado para revisão. Abra a versão atual antes de decidir.',
  ],
  'problem.report.projectNotActive': [
    'El proyecto ya no está activo para enviar informes. Consulta al propietario del proyecto sobre su estado.',
    'O projeto não está mais ativo para enviar relatórios. Contate o proprietário do projeto para revisar o estado.',
  ],
  'problem.report.assignmentRequired': [
    'Una asignación vigente al proyecto debe cubrir la fecha del informe. Consulta al propietario del proyecto para revisar el acceso.',
    'Uma atribuição vigente ao projeto deve cobrir a data do relatório. Contate o proprietário do projeto para revisar o acesso.',
  ],
  'problem.report.safetyDetailsRequired': [
    'Los cambios relacionados con la seguridad requieren detalles de validación y reversión antes de guardar.',
    'Alterações relacionadas à segurança exigem detalhes de validação e reversão antes de salvar.',
  ],
  'problem.approval.ownerReviewRequired': [
    'Estas horas de proveedor requieren revisión del Propietario. Consulta a un Propietario para que tome la decisión.',
    'Estas horas do fornecedor exigem revisão do Proprietário. Contate um Proprietário para tomar a decisão.',
  ],
  'problem.approval.reviewPermissionRequired': [
    'Ya no tienes permiso para revisar este proyecto. Consulta a un revisor del proyecto.',
    'Você não tem mais permissão para revisar este projeto. Contate um revisor do projeto.',
  ],
  'problem.approval.recordNotSubmitted': [
    'Este registro ya no está enviado. Revisa su estado actual antes de tomar una decisión.',
    'Este registro não está mais enviado. Revise o estado atual antes de decidir.',
  ],
  'problem.approval.recordChanged': [
    'Este registro cambió mientras lo revisabas. Revisa el registro actualizado antes de tomar una decisión.',
    'Este registro mudou durante a revisão. Revise o registro atualizado antes de decidir.',
  ],
  'problem.approval.financeReviewUnavailable': [
    'La revisión de Finanzas ya no está disponible para este registro. Revisa su estado actual de aprobación y facturación.',
    'A revisão de Finanças não está mais disponível para este registro. Revise o estado atual de aprovação e faturamento.',
  ],
  'problem.approval.reasonRequired': [
    'Introduce un motivo antes de devolver o rechazar este registro.',
    'Informe um motivo antes de devolver ou rejeitar este registro.',
  ],
  'problem.approval.expenseClassificationRequired': [
    'Clasifica este gasto en Finanzas antes de registrar la revisión financiera.',
    'Classifique esta despesa em Finanças antes de registrar a revisão financeira.',
  ],
  'problem.finance.roleRequired': [
    'Se requiere acceso a Finanzas para esta acción.',
    'É necessário acesso a Finanças para esta ação.',
  ],
  'problem.finance.reimbursementConflict': [
    'La política de reembolso al trabajador cambió. Revisa la política actual antes de guardar de nuevo; la facturación al cliente se gestiona por separado.',
    'A política de reembolso ao trabalhador mudou. Revise a política atual antes de salvar novamente; o faturamento do cliente é separado.',
  ],
  'problem.finance.projectIssuingAuthorityRequired': [
    'Configura una entidad emisora del proyecto vigente en la fecha de este gasto antes de clasificarlo.',
    'Configure uma entidade emissora do projeto vigente na data desta despesa antes de classificá-la.',
  ],
  'problem.finance.issuingCurrencyMismatch': [
    'La moneda del proyecto y la de la entidad emisora son distintas. Revisa la entidad emisora antes de clasificar este gasto.',
    'A moeda do projeto difere da moeda da entidade emissora. Revise a entidade emissora antes de classificar esta despesa.',
  ],
  'problem.finance.workerReimbursementRequired': [
    'Clasifica el gasto y define el reembolso al trabajador antes de registrar el pago. La recuperación del cliente es una decisión aparte.',
    'Classifique a despesa e defina o reembolso ao trabalhador antes de registrar o pagamento. A recuperação junto ao cliente é uma decisão separada.',
  ],
  'problem.finance.reimbursementFinalized': [
    'Este reembolso al trabajador ya se finalizó con otros datos. Revisa el pago registrado antes de hacer una corrección.',
    'Este reembolso ao trabalhador já foi finalizado com outros dados. Revise o pagamento registrado antes de fazer uma correção.',
  ],
  'problem.finance.reimbursementUnavailable': [
    'Solo se puede reembolsar un gasto aprobado y pagado por el trabajador. Revisa el estado del gasto y quién lo pagó.',
    'Só é possível reembolsar uma despesa aprovada e paga pelo trabalhador. Revise o estado da despesa e quem a pagou.',
  ],
  'problem.finance.expensePayerTreatmentMismatch': [
    'El pagador y el tratamiento no coinciden. El reembolso al trabajador solo se aplica si pagó el trabajador; los gastos pagados por el cliente requieren recuperación directa del cliente.',
    'O pagador e o tratamento não correspondem. O reembolso ao trabalhador só se aplica quando ele pagou; despesas pagas pelo cliente exigem recuperação direta do cliente.',
  ],
  'problem.finance.policyConflict': [
    'Este período de vigencia se solapa con una política o asignación existente. Revisa los períodos actuales antes de guardar.',
    'Este período de vigência se sobrepõe a uma política ou atribuição existente. Revise os períodos atuais antes de salvar.',
  ],
  'problem.finance.compensationNotFinalized': [
    'Finaliza la liquidación de remuneración del trabajador antes de registrar su pago.',
    'Finalize a liquidação da remuneração do trabalhador antes de registrar o pagamento.',
  ],
  'problem.finance.paymentRetryConflict': [
    'Esta solicitud de pago ya se usó con otros datos. Revisa los pagos registrados a trabajadores antes de intentarlo de nuevo.',
    'Esta solicitação de pagamento já foi usada com outros dados. Revise os pagamentos registrados aos trabalhadores antes de tentar novamente.',
  ],
  'problem.finance.recordChanged': [
    'Este registro de Finanzas cambió mientras el formulario estaba abierto. Revisa el registro actualizado antes de guardar de nuevo.',
    'Este registro de Finanças mudou enquanto o formulário estava aberto. Revise o registro atualizado antes de salvar novamente.',
  ],
  'problem.finance.expenseImmutable': [
    'Este gasto ya forma parte del historial de facturación o pagos a trabajadores. Revisa el registro y utiliza su vía de corrección.',
    'Esta despesa já faz parte do histórico de faturamento ou pagamento a trabalhadores. Revise o registro e use o procedimento de correção.',
  ],
  'Contact a project owner': [
    'Consultar a un propietario del proyecto',
    'Contatar um proprietário do projeto',
  ],
  'Contact a project reviewer': [
    'Consultar a un revisor del proyecto',
    'Contatar um revisor do projeto',
  ],
  'Contact Finance or an owner': [
    'Consultar a Finanzas o a un propietario',
    'Contatar Finanças ou um proprietário',
  ],
  'Review updated record': ['Revisar el registro actualizado', 'Revisar o registro atualizado'],
  'Classify expense in Finance': [
    'Clasificar el gasto en Finanzas',
    'Classificar a despesa em Finanças',
  ],
  'Review expense policy': ['Revisar la política de gastos', 'Revisar a política de despesas'],
  'Review expense classification': [
    'Revisar la clasificación del gasto',
    'Revisar a classificação da despesa',
  ],
  'Review project issuing authority': [
    'Revisar la entidad emisora del proyecto',
    'Revisar a entidade emissora do projeto',
  ],
  'Reattach the receipt before saving again.': [
    'Vuelve a adjuntar el recibo antes de guardar de nuevo.',
    'Anexe o recibo novamente antes de salvar.',
  ],
  'problem.project.assignmentBlockedStatus': [
    '{projectName} está en estado {status}. Las nuevas asignaciones solo se permiten en proyectos Activos, Planificados o Pausados.',
    '{projectName} está no estado {status}. Novas atribuições só são permitidas em projetos Ativos, Planejados ou Pausados.',
  ],
  'problem.project.assignmentAllowedStatuses': [
    'Las nuevas asignaciones solo se permiten en proyectos Activos, Planificados o Pausados.',
    'Novas atribuições só são permitidas em projetos Ativos, Planejados ou Pausados.',
  ],
  'problem.project.unavailableOption': [
    '{projectName} — {status} (no disponible para nuevas asignaciones)',
    '{projectName} — {status} (indisponível para novas atribuições)',
  ],
  'problem.project.assignmentAdvanceWarning': [
    'Este proyecto no admite nuevas asignaciones mientras esté en estado {status}. Revisa su estado antes de continuar.',
    'Este projeto não aceita novas atribuições enquanto estiver no estado {status}. Revise o estado antes de continuar.',
  ],
  'problem.remedy.reviewProjectStatus': [
    'Revisar el estado del proyecto',
    'Revisar o estado do projeto',
  ],
  'problem.remedy.contactOwner': [
    'Consulta al propietario del proyecto sobre su estado.',
    'Contate o proprietário do projeto sobre o estado dele.',
  ],
  'problem.field.summary': [
    'Revisa los {count} campos señalados.',
    'Revise os {count} campos destacados.',
  ],
  'problem.error.unexpected': [
    'No pudimos confirmar si la acción se completó. Comprueba el registro antes de intentarlo de nuevo. Referencia: {correlationId}.',
    'Não foi possível confirmar se a ação foi concluída. Confira o registro antes de tentar novamente. Referência: {correlationId}.',
  ],
  'problem.error.reference': ['Referencia: {correlationId}', 'Referência: {correlationId}'],
  'problem.notice.actionNeeded': ['Se requiere una acción', 'Ação necessária'],
  'problem.notice.beforeContinue': ['Antes de continuar', 'Antes de continuar'],
  'problem.notice.serviceUnavailable': [
    'Servicio temporalmente no disponible',
    'Serviço temporariamente indisponível',
  ],
  'problem.notice.saved': ['Cambios guardados', 'Alterações salvas'],
  'problem.notice.checkSaveBeforeRetry': [
    'Comprueba si el registro se guardó antes de volver a enviarlo.',
    'Confira se o registro foi salvo antes de enviar novamente.',
  ],
  'Current status: {status}': ['Estado actual: {status}', 'Estado atual: {status}'],
  'Shared crew receipt · allocation locked': [
    'Recibo compartido de cuadrilla · reparto bloqueado',
    'Recibo partilhado da equipa · distribuição bloqueada',
  ],
  'This record has financial history. Use a financial correction.': [
    'Este registro tiene historial financiero. Utiliza una corrección financiera.',
    'Este registo tem histórico financeiro. Utilize uma correção financeira.',
  ],
  'Approved reimbursements awaiting payment': [
    'Reembolsos aprobados pendientes de pago',
    'Reembolsos aprovados à espera de pagamento',
  ],
  'Reimbursement state': ['Estado del reembolso', 'Estado do reembolso'],
  'Unpaid reviewed settlements': [
    'Liquidaciones revisadas sin pagar',
    'Liquidações revistas não pagas',
  ],
  'Worker pay review': [
    'Revisión de pagos por trabajador',
    'Revisão de pagamentos por trabalhador',
  ],
  'Current approved and pending worker compensation, reimbursements, and settlement status.': [
    'Remuneración aprobada y pendiente, reembolsos y estado de las liquidaciones por trabajador.',
    'Remuneração aprovada e pendente, reembolsos e estado das liquidações por trabalhador.',
  ],
  'Select worker and period': [
    'Seleccionar trabajador y período',
    'Selecionar trabalhador e período',
  ],
  'Select worker': ['Seleccionar trabajador', 'Selecionar trabalhador'],
  'Approved compensation': ['Remuneración aprobada', 'Remuneração aprovada'],
  'Pending compensation': ['Remuneración pendiente', 'Remuneração pendente'],
  'Approved reimbursements': ['Reembolsos aprobados', 'Reembolsos aprovados'],
  'Pending reimbursements': ['Reembolsos pendientes', 'Reembolsos pendentes'],
  'Estimates are not proof of payment.': [
    'Las estimaciones no acreditan un pago.',
    'As estimativas não comprovam um pagamento.',
  ],
  'Reviewed settlements and approved reimbursements awaiting actual payment.': [
    'Liquidaciones revisadas y reembolsos aprobados pendientes del pago efectivo.',
    'Liquidações revistas e reembolsos aprovados à espera de pagamento efetivo.',
  ],
  'Activity detail': ['Detalle de actividad', 'Detalhe da atividade'],
  'A reviewed settlement is not proof of payment.': [
    'Una liquidación revisada no acredita un pago.',
    'Uma liquidação revista não comprova um pagamento.',
  ],
  Reimbursements: ['Reembolsos', 'Reembolsos'],
  'No settlements in this period.': [
    'No hay liquidaciones en este período.',
    'Não há liquidações neste período.',
  ],
  'No reimbursements in this period.': [
    'No hay reembolsos en este período.',
    'Não há reembolsos neste período.',
  ],
  'Select a worker to review their current pay statement.': [
    'Selecciona un trabajador para revisar su estado de remuneración actual.',
    'Selecione um trabalhador para rever o estado atual da sua remuneração.',
  ],
  'Current project assignment': ['Asignación actual al proyecto', 'Atribuição atual ao projeto'],
  'Past project assignment': ['Asignación anterior al proyecto', 'Atribuição anterior ao projeto'],
  'Upcoming project assignment': [
    'Próxima asignación al proyecto',
    'Próxima atribuição ao projeto',
  ],
  'Worker choices belong to the selected project, including past assignments. Choose dates to show only people whose assignment covers the full period.':
    [
      'Se muestran las personas asignadas al proyecto seleccionado, también las de períodos anteriores. Al elegir las fechas, verás sólo quienes tengan una asignación que cubra todo el período.',
      'São mostradas as pessoas atribuídas ao projeto selecionado, incluindo períodos anteriores. Ao escolher as datas, verá apenas quem tenha uma atribuição que cubra todo o período.',
    ],
  'No assigned worker covers the selected settlement period.': [
    'Ninguna persona asignada cubre el período de liquidación seleccionado.',
    'Nenhuma pessoa atribuída cobre o período de liquidação selecionado.',
  ],
  'No active worker or project manager assignment exists for this project.': [
    'Este proyecto no tiene asignaciones activas de trabajadores o responsables.',
    'Este projeto não tem atribuições ativas de trabalhadores ou gestores.',
  ],
  'Select a project before finalizing compensation.': [
    'Selecciona un proyecto antes de liquidar la remuneración.',
    'Selecione um projeto antes de finalizar a remuneração.',
  ],
  'action.finance.assignmentCommercialFallbackSaved': [
    'Preferencia de reglas de la asignación guardada.',
    'Preferência de regras da atribuição salva.',
  ],
  'action.finance.assignmentCommercialReferencesSaved': [
    'Reglas comerciales de la asignación guardadas.',
    'Regras comerciais da atribuição salvas.',
  ],
  'action.finance.assignmentExpensePolicyCreated': [
    'Política de gastos de la asignación guardada.',
    'Política de despesas da atribuição salva.',
  ],
  'action.finance.projectReimbursementSaved': [
    'Reembolso predeterminado del proyecto guardado.',
    'Reembolso padrão do projeto salvo.',
  ],
  'action.finance.workerReimbursementSaved': [
    'Excepción de reembolso del trabajador guardada.',
    'Exceção de reembolso do trabalhador salva.',
  ],
  'action.finance.canonicalLegalEntityRevisionCreated': [
    'Revisión de la entidad emisora guardada.',
    'Revisão da entidade emissora salva.',
  ],
  'action.validation.assignmentCommercialFallback': [
    'Revisa la preferencia de reglas de la asignación.',
    'Revise a preferência de regras da atribuição.',
  ],
  'action.validation.assignmentCommercialReferences': [
    'Revisa las reglas comerciales de la asignación.',
    'Revise as regras comerciais da atribuição.',
  ],
  'action.validation.assignmentExpensePolicy': [
    'Revisa la política de gastos de la asignación.',
    'Revise a política de despesas da atribuição.',
  ],
  'action.validation.projectReimbursement': [
    'Revisa los datos de reembolso del proyecto.',
    'Revise os dados de reembolso do projeto.',
  ],
  'action.validation.workerReimbursement': [
    'Revisa los datos de reembolso del trabajador.',
    'Revise os dados de reembolso do trabalhador.',
  ],
  'action.validation.canonicalLegalEntityRevision': [
    'Revisa la revisión de la entidad emisora.',
    'Revise a revisão da entidade emissora.',
  ],
  'Check project fields': ['Revisa los campos del proyecto.', 'Revise os campos do projeto.'],
  'All expertise': ['Todas las especialidades', 'Todas as especialidades'],
  'Filter workers by expertise': [
    'Filtrar trabajadores por especialidad',
    'Filtrar trabalhadores por especialidade',
  ],
  'No active workers match this expertise.': [
    'No hay trabajadores activos que coincidan con esta especialidad.',
    'Nenhum trabalhador ativo corresponde a esta especialidade.',
  ],
  'Customer labor uses approved billable time and the selected customer rule. Worker pay follows its separate method; expense reimbursement and customer recovery are calculated independently. Invoice totals also apply the configured minimums, caps, tax, and rounding.':
    [
      'El trabajo facturado al cliente se calcula con las horas facturables aprobadas y la tarifa seleccionada. La remuneración del trabajador sigue un método independiente; el reembolso de gastos y su cobro al cliente se calculan por separado. Los totales de la factura también aplican los mínimos, límites, impuestos y redondeos configurados.',
      'A mão de obra faturada ao cliente é calculada com as horas faturáveis aprovadas e a tarifa selecionada. O pagamento do trabalhador segue um método independente; o reembolso de despesas e a cobrança ao cliente são calculados separadamente. Os totais da fatura também aplicam os mínimos, limites, impostos e arredondamentos configurados.',
    ],
  Payer: ['Pagador', 'Pagador'],
  'Postal code': ['Código postal', 'CEP'],
  Region: ['Región', 'Região'],
  'Ground transport': ['Transporte terrestre', 'Transporte terrestre'],
  'Payment method (optional)': ['Método de pago (opcional)', 'Forma de pagamento (opcional)'],
  'Phone/data': ['Teléfono/datos', 'Telefone/dados'],
  'Select currency': ['Seleccionar moneda', 'Selecionar moeda'],
  Tools: ['Herramientas', 'Ferramentas'],
  'Visa/permit': ['Visado/permiso', 'Visto/permissão'],
  'Actual duration': ['Duración real', 'Duração real'],
  'Enter a valid number of hours from 0 to 24.': [
    'Introduce una cantidad válida de horas entre 0 y 24.',
    'Informe um número válido de horas entre 0 e 24.',
  ],
  'Enter decimal hours, for example 7.5 for 7 h 30 min. The amount is rounded to the nearest minute.':
    [
      'Introduce horas decimales, por ejemplo 7.5 para 7 h 30 min. La cantidad se redondea al minuto más cercano.',
      'Informe horas decimais, por exemplo 7.5 para 7 h 30 min. A quantidade é arredondada para o minuto mais próximo.',
    ],
  'Issuing authority not configured': [
    'Entidad emisora sin configurar',
    'Entidade emissora não configurada',
  ],
  'Assign a reviewed project issuing authority before issuing this invoice.': [
    'Asigna una entidad emisora revisada al proyecto antes de emitir esta factura.',
    'Atribua uma entidade emissora revisada ao projeto antes de emitir esta fatura.',
  ],
  Budget: ['Presupuesto', 'Orçamento'],
  'Configure person rates': ['Configurar tarifas por persona', 'Configurar tarifas por pessoa'],
  'Crew hours': ['Horas del equipo', 'Horas da equipe'],
  'Explicit fixed labor price': [
    'Precio fijo explícito de mano de obra',
    'Preço fixo explícito para mão de obra',
  ],
  'Other cost budget': ['Presupuesto de otros costes', 'Orçamento de outros custos'],
  '2 · People': ['2 · Personas', '2 · Pessoas'],
  '3 · Commercial defaults': [
    '3 · Condiciones comerciales generales',
    '3 · Condições comerciais gerais',
  ],
  '4 · Optional planning and budget': [
    '4 · Planificación y presupuesto opcionales',
    '4 · Planeamento e orçamento opcionais',
  ],
  'People (optional)': ['Personas (opcional)', 'Pessoas (opcional)'],
  'Worker assignment start date (optional)': [
    'Fecha de inicio de las asignaciones (opcional)',
    'Data de início das atribuições (opcional)',
  ],
  'Defaults to the project start date.': [
    'Si se deja en blanco, se usa la fecha de inicio del proyecto.',
    'Se ficar em branco, será usada a data de início do projeto.',
  ],
  'An owner can assign people after this project is created.': [
    'Un propietario puede asignar personas después de crear el proyecto.',
    'Um proprietário pode atribuir pessoas após a criação do projeto.',
  ],
  'Choose workers now or leave the project without assignments. Set each person’s customer rate, pay and expense policy after creation.':
    [
      'Selecciona trabajadores ahora o deja el proyecto sin asignaciones. Después de crearlo, configura la tarifa al cliente, la remuneración y los gastos de cada persona.',
      'Selecione trabalhadores agora ou deixe o projeto sem atribuições. Após a criação, configure a tarifa ao cliente, o pagamento e as despesas de cada pessoa.',
    ],
  'Set up the project and choose its people. After saving, configure each person’s commercial terms and review the project.':
    [
      'Configura el proyecto y elige a las personas. Después de guardarlo, define las condiciones comerciales de cada una y revisa el proyecto.',
      'Configure o projeto e escolha as pessoas. Após salvar, defina as condições comerciais de cada uma e revise o projeto.',
    ],
  Expertise: ['Especialidad', 'Especialidade'],
  'Expertise and availability': [
    'Especialidades y disponibilidad',
    'Especialidades e disponibilidade',
  ],
  'Required expertise': ['Especialidad requerida', 'Especialidade necessária'],
  'Manage worker expertise': [
    'Gestionar especialidades de los trabajadores',
    'Gerenciar especialidades dos trabalhadores',
  ],
  'New expertise': ['Nueva especialidad', 'Nova especialidade'],
  'Add expertise': ['Añadir especialidad', 'Adicionar especialidade'],
  'Save expertise': ['Guardar especialidad', 'Salvar especialidade'],
  'Update expertise': ['Actualizar especialidad', 'Atualizar especialidade'],
  'Delete expertise': ['Eliminar especialidad', 'Excluir especialidade'],
  'Assign expertise': ['Asignar especialidad', 'Atribuir especialidade'],
  'Update expertise matrix': [
    'Actualizar matriz de especialidades',
    'Atualizar matriz de especialidades',
  ],
  'Remove worker expertise': [
    'Quitar especialidad del trabajador',
    'Remover especialidade do trabalhador',
  ],
  'Remove expertise': ['Quitar especialidad', 'Remover especialidade'],
  'Select expertise': ['Seleccionar especialidad', 'Selecionar especialidade'],
  'No expertise recorded.': [
    'No hay especialidades registradas.',
    'Nenhuma especialidade registrada.',
  ],
  'Assign expertise and availability windows for an individual worker. These controls do not expose compensation or client-rate data.':
    [
      'Asigna especialidades y periodos de disponibilidad a un trabajador. Estos controles no muestran datos de remuneración ni tarifas al cliente.',
      'Atribua especialidades e períodos de disponibilidade a um trabalhador. Estes controles não exibem dados de remuneração nem tarifas cobradas do cliente.',
    ],
  'Continue project setup': [
    'Continuar la configuración del proyecto',
    'Continuar a configuração do projeto',
  ],
  'Project created': ['Proyecto creado', 'Projeto criado'],
  'Now add people and configure how their work and expenses are calculated.': [
    'Ahora añade personas y configura cómo se calculan su trabajo y gastos.',
    'Agora adicione pessoas e configure como o trabalho e as despesas são calculados.',
  ],
  Basics: ['Datos básicos', 'Dados básicos'],
  Saved: ['Guardado', 'Salvo'],
  People: ['Personas', 'Pessoas'],
  'Assign workers by expertise': [
    'Asignar trabajadores por especialidad',
    'Atribuir trabalhadores por especialidade',
  ],
  'Review assigned people': ['Revisar personas asignadas', 'Revisar pessoas atribuídas'],
  'Commercial terms': ['Condiciones comerciales', 'Condições comerciais'],
  'Configure per-person rates and expenses': [
    'Configurar tarifas y gastos por persona',
    'Configurar tarifas e despesas por pessoa',
  ],
  Review: ['Revisar', 'Revisar'],
  'Review project configuration': [
    'Revisar la configuración del proyecto',
    'Revisar a configuração do projeto',
  ],
  'Time can be recorded while commercial terms are incomplete. Billing waits for the required rates and policies.':
    [
      'Se pueden registrar horas aunque falten condiciones comerciales. La facturación espera las tarifas y políticas necesarias.',
      'As horas podem ser registradas mesmo com condições comerciais incompletas. A faturação aguarda as tarifas e políticas necessárias.',
    ],
  'Start with project basics. After saving, assign people, set their commercial terms, then review the project.':
    [
      'Empieza por los datos básicos. Después de guardar, asigna personas, define sus condiciones comerciales y revisa el proyecto.',
      'Comece pelos dados básicos. Após salvar, atribua pessoas, defina as condições comerciais e revise o projeto.',
    ],
  '1 · Basics': ['1 · Datos básicos', '1 · Dados básicos'],
  '2 · Commercial defaults': [
    '2 · Condiciones comerciales generales',
    '2 · Condições comerciais gerais',
  ],
  '3 · Optional planning and budget': [
    '3 · Planificación y presupuesto opcionales',
    '3 · Planeamento e orçamento opcionais',
  ],
  'Person-specific customer rates, worker pay and expense policies are configured after the people are assigned.':
    [
      'Las tarifas al cliente, la remuneración y las políticas de gastos por persona se configuran después de asignar a las personas.',
      'As tarifas ao cliente, o pagamento e as políticas de despesas por pessoa são configurados após a atribuição das pessoas.',
    ],
  'Leave budgets blank when they are not agreed. A planning target does not limit billing; choose capped T&M and configure a cap only when the contract requires one.':
    [
      'Deja los presupuestos en blanco si no se han acordado. Una previsión no limita la facturación; elige tiempo y materiales con límite solo si el contrato lo exige.',
      'Deixe os orçamentos em branco quando não forem acordados. Uma previsão não limita a faturação; escolha tempo e materiais com limite apenas quando o contrato o exigir.',
    ],
  'Revenue budget': ['Presupuesto de ingresos', 'Orçamento de receitas'],
  'PO cap': ['Límite de la orden de compra', 'Limite da ordem de compra'],
  'Planned labor hours': ['Horas de trabajo previstas', 'Horas de trabalho previstas'],
  'Travel budget': ['Presupuesto de viajes', 'Orçamento de viagens'],
  Help: ['Ayuda', 'Ajuda'],
  'Finance Overview': ['Resumen financiero', 'Visão financeira'],
  'Report: {title}': ['Informe: {title}', 'Relatório: {title}'],
  'Enter a valid date.': ['Introduce una fecha válida.', 'Informe uma data válida.'],
  'Enter a valid time.': ['Introduce una hora válida.', 'Informe um horário válido.'],
  Published: ['Publicado', 'Publicado'],
  Cancelled: ['Cancelado', 'Cancelado'],
  'Please complete this field.': ['Completa este campo.', 'Preencha este campo.'],
  'Please select an option.': ['Selecciona una opción.', 'Selecione uma opção.'],
  'Please check this box.': ['Marca esta casilla.', 'Marque esta caixa.'],
  'Enter a valid email address.': [
    'Introduce una dirección de correo válida.',
    'Informe um endereço de e-mail válido.',
  ],
  'Enter a valid URL.': ['Introduce una URL válida.', 'Informe uma URL válida.'],
  'Enter a valid number.': ['Introduce un número válido.', 'Informe um número válido.'],
  'Match the requested format.': ['Utiliza el formato solicitado.', 'Use o formato solicitado.'],
  'Use at least {min} characters.': [
    'Utiliza al menos {min} caracteres.',
    'Use pelo menos {min} caracteres.',
  ],
  'Use no more than {max} characters.': [
    'Utiliza como máximo {max} caracteres.',
    'Use no máximo {max} caracteres.',
  ],
  'Enter a value of at least {min}.': [
    'Introduce un valor igual o superior a {min}.',
    'Informe um valor maior ou igual a {min}.',
  ],
  'Enter a value no greater than {max}.': [
    'Introduce un valor igual o inferior a {max}.',
    'Informe um valor menor ou igual a {max}.',
  ],
  'Enter a value matching the required step.': [
    'Introduce un valor que respete el intervalo permitido.',
    'Informe um valor que respeite o intervalo permitido.',
  ],
  'Enter a valid value.': ['Introduce un valor válido.', 'Informe um valor válido.'],
  'Please correct the following fields: {messages}': [
    'Corrige los siguientes campos: {messages}',
    'Corrija os seguintes campos: {messages}',
  ],
  'Existing person (optional)': ['Persona existente (opcional)', 'Pessoa existente (opcional)'],
  'Create a new person': ['Crear una persona nueva', 'Criar uma nova pessoa'],
  'email required': ['correo obligatorio', 'e-mail obrigatório'],
  'Choose an existing supplier person or team member to add credentials without duplicating their directory record.':
    [
      'Elige una persona de supplier o del equipo ya existente para añadir credenciales sin duplicar su ficha del directorio.',
      'Escolha uma pessoa de fornecedor ou da equipe já existente para adicionar credenciais sem duplicar seu registro no diretório.',
    ],
  'Priority then oldest': ['Prioridad y después más antiguos', 'Prioridade e depois mais antigos'],
  'Enter a valid amount with no more than two decimal places.': [
    'Introduce un importe válido con un máximo de dos decimales.',
    'Informe um valor válido com no máximo duas casas decimais.',
  ],
  'Enter a valid percentage from 0 to 100.': [
    'Introduce un porcentaje válido entre 0 y 100.',
    'Informe um percentual válido entre 0 e 100.',
  ],
  'Enter a valid multiplier from 0 to 10.': [
    'Introduce un multiplicador válido entre 0 y 10.',
    'Informe um multiplicador válido entre 0 e 10.',
  ],
  'Fixed period amount': ['Importe fijo del periodo', 'Valor fixo do período'],
  'Approved adjustment amount': ['Importe del ajuste aprobado', 'Valor do ajuste aprovado'],
  'Overtime percentage': ['Porcentaje de horas extra', 'Percentual de horas extras'],
  'Hourly labor with included expenses (all-in)': [
    'Mano de obra por horas con gastos incluidos (all-in)',
    'Mão de obra por hora com despesas incluídas (all-in)',
  ],
  'Expected hours are planning context. The client daily minimum is a separate commercial top-up applied once per worker, project and day; it never changes actual recorded hours or worker compensation.':
    [
      'Las horas previstas son contexto de planificación. El mínimo diario del cliente es un ajuste comercial independiente que se aplica una sola vez por trabajador, proyecto y día; nunca cambia las horas reales registradas ni la remuneración del trabajador.',
      'As horas previstas são contexto de planejamento. O mínimo diário do cliente é um ajuste comercial separado aplicado uma vez por colaborador, projeto e dia; nunca altera as horas reais registradas nem a remuneração do colaborador.',
    ],
  'All-in keeps labor hourly unless an explicit fixed labor price is configured. It only means selected expenses are included instead of billed separately.':
    [
      'All-in mantiene la mano de obra por horas salvo que se configure expresamente un precio fijo de mano de obra. Sólo significa que determinados gastos están incluidos en vez de facturarse por separado.',
      'All-in mantém a mão de obra por hora, salvo se um preço fixo de mão de obra for configurado explicitamente. Significa apenas que determinadas despesas estão incluídas em vez de faturadas separadamente.',
    ],
  'Explicit fixed labor price · minor units': [
    'Precio fijo explícito de mano de obra · unidades menores',
    'Preço fixo explícito de mão de obra · unidades menores',
  ],
  'Select a billing stream and valid period first.': [
    'Selecciona primero un flujo de facturación y un periodo válido.',
    'Selecione primeiro um fluxo de faturamento e um período válido.',
  ],
  'The selected billing period could not be checked.': [
    'No se pudo comprobar el periodo de facturación seleccionado.',
    'Não foi possível verificar o período de faturamento selecionado.',
  ],
  'Checking period…': ['Comprobando periodo…', 'Verificando período…'],
  'Check selected period': ['Comprobar periodo seleccionado', 'Verificar período selecionado'],
  'Included source records': ['Registros fuente incluidos', 'Registros de origem incluídos'],
  'Period readiness': ['Preparación del periodo', 'Preparação do período'],
  'Excluded or pending source records': [
    'Registros fuente excluidos o pendientes',
    'Registros de origem excluídos ou pendentes',
  ],
  'No blocking conditions were found for this exact period.': [
    'No se encontraron bloqueos para este periodo exacto.',
    'Nenhum bloqueio foi encontrado para este período exato.',
  ],
  'Customer report content': [
    'Contenido del informe para el cliente',
    'Conteúdo do relatório para o cliente',
  ],
  'Hours only': ['Sólo horas', 'Somente horas'],
  'Hours and activity summary': ['Horas y resumen de actividad', 'Horas e resumo de atividade'],
  'Hours, activity and selected technical reports': [
    'Horas, actividad e informes técnicos seleccionados',
    'Horas, atividade e relatórios técnicos selecionados',
  ],
  'Technical / PLC details are excluded unless you explicitly select the technical-report option and the records below.':
    [
      'Los detalles Technical / PLC se excluyen salvo que elijas expresamente la opción de informes técnicos y los registros de abajo.',
      'Os detalhes Technical / PLC ficam excluídos, a menos que você selecione explicitamente a opção de relatórios técnicos e os registros abaixo.',
    ],
  'Technical reports to include': [
    'Informes técnicos que se incluirán',
    'Relatórios técnicos a incluir',
  ],
  'No technical reports are available for the selected project.': [
    'No hay informes técnicos disponibles para el proyecto seleccionado.',
    'Não há relatórios técnicos disponíveis para o projeto selecionado.',
  ],
  'Select a project to choose technical reports.': [
    'Selecciona un proyecto para elegir informes técnicos.',
    'Selecione um projeto para escolher os relatórios técnicos.',
  ],
  'All workers': ['Todos los trabajadores', 'Todos os colaboradores'],
  'All clients': ['Todos los clientes', 'Todos os clientes'],
  'All currencies': ['Todas las monedas', 'Todas as moedas'],
  'Invoice data': ['Datos de la factura', 'Dados da fatura'],
  Missing: ['Falta', 'Ausente'],
  Taxes: ['Impuestos', 'Impostos'],
  'Open record': ['Abrir registro', 'Abrir registro'],
  'Not generated yet': ['Todavía no generado', 'Ainda não gerado'],
  'Sign in again to continue.': [
    'Inicia sesión de nuevo para continuar.',
    'Entre novamente para continuar.',
  ],
  'You do not have permission to generate this PDF or its source is unavailable.': [
    'No tienes permiso para generar este PDF o su fuente no está disponible.',
    'Você não tem permissão para gerar este PDF ou a fonte não está disponível.',
  ],
  'The source changed. Refresh this page and generate the PDF again.': [
    'La fuente cambió. Actualiza esta página y vuelve a generar el PDF.',
    'A fonte mudou. Atualize esta página e gere o PDF novamente.',
  ],
  'The PDF could not be generated. Try again shortly.': [
    'No se pudo generar el PDF. Vuelve a intentarlo en unos instantes.',
    'Não foi possível gerar o PDF. Tente novamente em instantes.',
  ],
  'The PDF list could not be loaded.': [
    'No se pudo cargar la lista de PDF.',
    'Não foi possível carregar a lista de PDF.',
  ],
  'matching records': ['registros coincidentes', 'registros correspondentes'],
  'Export filtered results': ['Exportar resultados filtrados', 'Exportar resultados filtrados'],
  'Download exactly the expenses currently selected by the register filters.': [
    'Descarga exactamente los gastos seleccionados por los filtros del registro.',
    'Baixe exatamente as despesas selecionadas pelos filtros do registro.',
  ],
  'Create report with another scope': [
    'Crear reporte con otro alcance',
    'Criar relatório com outro escopo',
  ],
  'Choose a separate period and scope without changing the register above.': [
    'Elige un período y alcance independientes sin cambiar el registro superior.',
    'Escolha um período e escopo separados sem alterar o registro acima.',
  ],
  'Workers submit Daily or Technical reports, the Project Manager or Owner reviews the operational facts, Finance or Owner generates the customer-safe period file, and an authorized Owner or Finance user records the customer signed copy.':
    [
      'Los trabajadores envían informes diarios o técnicos, el gestor del proyecto o el propietario revisa los hechos operativos, Finanzas o el propietario genera el archivo de período seguro para el cliente y un usuario autorizado registra la copia firmada por el cliente.',
      'Os colaboradores enviam relatórios diários ou técnicos, o gestor do projeto ou o proprietário revisa os fatos operacionais, Finanças ou o proprietário gera o arquivo de período seguro para o cliente e um usuário autorizado registra a cópia assinada pelo cliente.',
    ],
  'Create source report': ['Crear reporte de origen', 'Criar relatório de origem'],
  'Current source records': ['Registros de origen actuales', 'Registros de origem atuais'],
  'No reviewed operational sources in this period': [
    'No hay fuentes operativas revisadas en este período',
    'Não há fontes operacionais revisadas neste período',
  ],
  'This period has no Daily, Technical / PLC or time source records. Create or review the missing operational records before recalculating the period file.':
    [
      'Este período no tiene registros de origen diarios, técnicos / PLC ni de horas. Crea o revisa los registros operativos que faltan antes de recalcular el archivo del período.',
      'Este período não tem registros de origem diários, técnicos / PLC nem de horas. Crie ou revise os registros operacionais ausentes antes de recalcular o arquivo do período.',
    ],
  'Action queue': ['Cola de acciones', 'Fila de ações'],
  'Records needing action come first, then explicit priority and oldest date. Approved records remain below for audit and correction follow-up.':
    [
      'Primero aparecen los registros que necesitan acción, después la prioridad explícita y la fecha más antigua. Los aprobados permanecen debajo para auditoría y seguimiento de correcciones.',
      'Primeiro aparecem os registros que exigem ação, depois a prioridade explícita e a data mais antiga. Os aprovados permanecem abaixo para auditoria e acompanhamento de correções.',
    ],
  'A project appears here when a commercial milestone has been submitted for authorization. Approve confirms that milestone for its next commercial step; Reject returns it with a reason. It does not approve time, expenses or reports.':
    [
      'Un proyecto aparece aquí cuando se envía un hito comercial para autorización. Aprobar confirma ese hito para su siguiente paso comercial; Rechazar lo devuelve con un motivo. No aprueba horas, gastos ni reportes.',
      'Um projeto aparece aqui quando um marco comercial é enviado para autorização. Aprovar confirma esse marco para a próxima etapa comercial; Rejeitar o devolve com um motivo. Isso não aprova horas, despesas nem relatórios.',
    ],
  'Finance review starts only after operational approval. Finance must confirm billability or expense treatment before a record can move into billing, reimbursement or settlement; it does not rewrite the operational facts.':
    [
      'La revisión financiera comienza después de la aprobación operativa. Finanzas debe confirmar la facturabilidad o el tratamiento del gasto antes de que un registro pase a facturación, reembolso o liquidación; no reescribe los hechos operativos.',
      'A revisão financeira começa após a aprovação operacional. Finanças deve confirmar a faturabilidade ou o tratamento da despesa antes que um registro avance para faturamento, reembolso ou liquidação; ela não reescreve os fatos operacionais.',
    ],
  Corrections: ['Correcciones', 'Correções'],
  'No records found': ['No se encontraron registros', 'Nenhum registro encontrado'],
  'Upload document': ['Subir documento', 'Enviar documento'],
  'Send the invitation email to this address?': [
    '¿Enviar el correo de invitación a esta dirección?',
    'Enviar o e-mail de convite para este endereço?',
  ],
  'Send the invoice PDF to this address?': [
    '¿Enviar el PDF de la factura a esta dirección?',
    'Enviar o PDF da fatura para este endereço?',
  ],
  'Choose an option': ['Elige una opción', 'Escolha uma opção'],
  'No, do not send email': ['No, no enviar correo', 'Não, não enviar e-mail'],
  'Yes, send this email': ['Sí, enviar este correo', 'Sim, enviar este e-mail'],
  'action.billing.invoiceEmail.declined': ['Correo no enviado', 'E-mail não enviado'],
  'Email not sent': ['Correo no enviado', 'E-mail não enviado'],

  'PLC report required': ['Informe de PLC obligatorio', 'Relatório de PLC obrigatório'],
  'PLC report': ['Informe de PLC', 'Relatório de PLC'],
  'action.closeout.draftPrepared': [
    'Borrador de cierre preparado.',
    'Rascunho de encerramento preparado.',
  ],
  'action.closeout.draftRefreshed': [
    'Borrador de cierre actualizado; revisa y confirma la nueva instantánea del cliente.',
    'Rascunho de encerramento atualizado; revise e confirme o novo instantâneo do cliente.',
  ],
  'action.closeout.clientSnapshotConfirmed': [
    'Instantánea exacta del cliente confirmada.',
    'Instantâneo exato do cliente confirmado.',
  ],
  'action.closeout.packagesFinalized': [
    'Paquetes de cierre finalizados.',
    'Pacotes de encerramento finalizados.',
  ],
  'action.closeout.reopened': ['Cierre reabierto.', 'Encerramento reaberto.'],
  'action.reports.periodFollowupRecorded': [
    'Seguimiento del período registrado.',
    'Acompanhamento do período registrado.',
  ],
  'action.success': ['Cambios guardados.', 'Alterações salvas.'],
  'PLC / TECHNICAL REPORT': ['PLC / INFORME TÉCNICO', 'PLC / RELATÓRIO TÉCNICO'],
  'PO / PROJECT BUDGET': [
    'ORDEN DE COMPRA / PRESUPUESTO DEL PROYECTO',
    'ORDEM DE COMPRA / ORÇAMENTO DO PROJETO',
  ],
  'action.billing.invoicePlanningDatesSaved': [
    'Fechas previstas de la factura guardadas.',
    'Datas previstas da fatura salvas.',
  ],
  'action.finance.compensationExpectedPaymentSaved': [
    'Fecha prevista de pago al trabajador guardada.',
    'Data prevista de pagamento ao trabalhador salva.',
  ],
  'action.finance.compensationPaymentRecorded': [
    'Pago real de compensación registrado.',
    'Pagamento real de remuneração registrado.',
  ],
  'action.finance.compensationPaymentReversed': [
    'Pago de compensación revertido con trazabilidad.',
    'Pagamento de remuneração revertido com rastreabilidade.',
  ],
  'action.validation.compensationPayment': [
    'Revisa los campos del pago real.',
    'Revise os campos do pagamento real.',
  ],
  'action.validation.compensationPaymentReversal': [
    'Revisa la fecha y el motivo de la reversión.',
    'Revise a data e o motivo da reversão.',
  ],
  'action.finance.expenseClassified': [
    'Clasificación comercial del gasto guardada.',
    'Classificação comercial da despesa salva.',
  ],
  'action.finance.expensePlanningDatesSaved': [
    'Fechas previstas del gasto guardadas.',
    'Datas previstas da despesa salvas.',
  ],
  'action.finance.projectCommercialPolicySaved': [
    'Política comercial del proyecto guardada.',
    'Política comercial do projeto salva.',
  ],
  'action.validation.compensationSettlementPlanning': [
    'Revisa la fecha prevista de pago al trabajador.',
    'Verifique a data prevista de pagamento ao trabalhador.',
  ],
  'action.validation.expenseCommercialClassification': [
    'Revisa los campos de clasificación comercial del gasto.',
    'Verifique os campos de classificação comercial da despesa.',
  ],
  'action.validation.expensePlanningDates': [
    'Revisa las fechas previstas del gasto.',
    'Verifique as datas previstas da despesa.',
  ],
  'action.validation.invoicePlanningDates': [
    'Revisa las fechas previstas de la factura.',
    'Verifique as datas previstas da fatura.',
  ],
  'action.validation.paymentReversal': [
    'Revisa los datos y el motivo de la anulación del pago.',
    'Verifique os dados e o motivo do estorno do pagamento.',
  ],
  'action.validation.projectCommercialPolicy': [
    'Revisa los campos de la política comercial del proyecto.',
    'Verifique os campos da política comercial do projeto.',
  ],
  'ACCOUNT MFA': ['MFA DE LA CUENTA', 'MFA DA CONTA'],
  'ACCOUNT SECURITY': ['SEGURIDAD DE LA CUENTA', 'SEGURANÇA DA CONTA'],
  'ACTIVITY INBOX · NOTIFICATION': [
    'BANDEJA DE ACTIVIDAD · NOTIFICACIÓN',
    'CAIXA DE ATIVIDADES · NOTIFICAÇÃO',
  ],
  'APPROVED COMPENSATION': ['REMUNERACIÓN APROBADA', 'REMUNERAÇÃO APROVADA'],
  'Activity inbox': ['Bandeja de actividad', 'Caixa de atividades'],
  'Adjustment amount': ['Importe del ajuste', 'Valor do ajuste'],
  'Administration notes': ['Notas de administración', 'Notas de administração'],
  'Already invoiced': ['Ya facturado', 'Já faturado'],
  'Artifact type': ['Tipo de archivo generado', 'Tipo de arquivo gerado'],
  'Assignment ID': ['ID de la asignación', 'ID da atribuição'],
  'Authenticator app': ['Aplicación de autenticación', 'Aplicativo autenticador'],
  'Authenticator code': ['Código de autenticación', 'Código do autenticador'],
  'Budget type': ['Tipo de presupuesto', 'Tipo de orçamento'],
  'CONTRIBUTION MARGIN': ['MARGEN DE CONTRIBUCIÓN', 'MARGEM DE CONTRIBUIÇÃO'],
  'Client labor rate': [
    'Tarifa de mano de obra para el cliente',
    'Tarifa de mão de obra para o cliente',
  ],
  'Client payment': ['Pago del cliente', 'Pagamento do cliente'],
  'Close navigation': ['Cerrar navegación', 'Fechar navegação'],
  'Company card': ['Tarjeta de empresa', 'Cartão da empresa'],
  'Company direct': ['Pago directo de la empresa', 'Pagamento direto da empresa'],
  'DIRECT LABOR COST': ['COSTE DIRECTO DE MANO DE OBRA', 'CUSTO DIRETO DE MÃO DE OBRA'],
  'DRAFT INVOICE': ['FACTURA EN BORRADOR', 'RASCUNHO DE FATURA'],
  'Direct cost': ['Coste directo', 'Custo direto'],
  'EXPECTED DAY': ['JORNADA PREVISTA', 'JORNADA PREVISTA'],
  'EXPENSE · SOURCE RECORD': ['GASTO · REGISTRO DE ORIGEN', 'DESPESA · REGISTRO DE ORIGEM'],
  'Edit draft': ['Editar borrador', 'Editar rascunho'],
  'Enter a recovery code': [
    'Introduce un código de recuperación',
    'Digite um código de recuperação',
  ],
  'Enter your password': ['Introduce tu contraseña', 'Digite sua senha'],
  'FORECAST ETC': ['PREVISIÓN DEL COSTE RESTANTE', 'PREVISÃO DO CUSTO RESTANTE'],
  'Fixed project amount': ['Importe fijo del proyecto', 'Valor fixo do projeto'],
  'Internal loaded cost': ['Coste interno con cargas', 'Custo interno com encargos'],
  'Labor cost': ['Coste de mano de obra', 'Custo de mão de obra'],
  'Loaded cost': ['Coste con cargas', 'Custo com encargos'],
  'OPEN PROJECT →': ['ABRIR PROYECTO →', 'ABRIR PROJETO →'],
  'Open / not closed': ['Abierto / sin cerrar', 'Aberto / não encerrado'],
  'Open Accounting Pack': ['Abrir paquete contable', 'Abrir pacote contábil'],
  'Open private receipt': ['Abrir recibo privado', 'Abrir comprovante privado'],
  'Open project': ['Abrir proyecto', 'Abrir projeto'],
  'Open record →': ['Abrir registro →', 'Abrir registro →'],
  'Open source record': ['Abrir registro de origen', 'Abrir registro de origem'],
  'Open target': ['Abrir destino', 'Abrir destino'],
  'Open week': ['Abrir semana', 'Abrir semana'],
  'PLANNED HOURS': ['HORAS PLANIFICADAS', 'HORAS PLANEJADAS'],
  'Percentage compensation': ['Remuneración porcentual', 'Remuneração percentual'],
  'Primary contact': ['Contacto principal', 'Contato principal'],
  'Primary navigation': ['Navegación principal', 'Navegação principal'],
  'Profile & security': ['Perfil y seguridad', 'Perfil e segurança'],
  'Project Administration': ['Administración del proyecto', 'Administração do projeto'],
  'Project number': ['Número del proyecto', 'Número do projeto'],
  'RECORDED HOURS': ['HORAS REGISTRADAS', 'HORAS REGISTRADAS'],
  'Receipt required': ['Recibo obligatorio', 'Comprovante obrigatório'],
  'Recovery code': ['Código de recuperación', 'Código de recuperação'],
  'Registered private receipt': ['Recibo privado registrado', 'Comprovante privado registrado'],
  'Rule type': ['Tipo de regla', 'Tipo de regra'],
  'SOURCE RECORD': ['REGISTRO DE ORIGEN', 'REGISTRO DE ORIGEM'],
  'Save PLC report': ['Guardar informe de PLC', 'Salvar relatório de PLC'],
  'Save client rate': ['Guardar tarifa del cliente', 'Salvar tarifa do cliente'],
  'Save compensation rule': ['Guardar regla de remuneración', 'Salvar regra de remuneração'],
  'Save internal cost': ['Guardar coste interno', 'Salvar custo interno'],
  'Secure company access.': ['Acceso seguro a la empresa.', 'Acesso seguro à empresa.'],
  'Source ID': ['ID del origen', 'ID da origem'],
  'System type': ['Tipo de sistema', 'Tipo de sistema'],
  'Tax profile': ['Perfil fiscal', 'Perfil fiscal'],
  'Technical / PLC records': ['Registros técnicos / de PLC', 'Registros técnicos / de PLC'],
  'Technical reporting required': ['Informe técnico obligatorio', 'Relatório técnico obrigatório'],
  'Toggle navigation': ['Mostrar u ocultar navegación', 'Mostrar ou ocultar navegação'],
  'Travel / expense': ['Viajes / gastos', 'Viagens / despesas'],
  'Update Client': ['Actualizar cliente', 'Atualizar cliente'],
  'Update Tax Profile': ['Actualizar perfil fiscal', 'Atualizar perfil fiscal'],
  'Update assignment': ['Actualizar asignación', 'Atualizar atribuição'],
  'Use a recovery code': ['Usar un código de recuperación', 'Usar um código de recuperação'],
  'Use authenticator code': ['Usar código de autenticación', 'Usar código do autenticador'],
  'Validation result': ['Resultado de la validación', 'Resultado da validação'],
  'WEEKLY TIMESHEET': ['REGISTRO SEMANAL DE HORAS', 'REGISTRO SEMANAL DE HORAS'],
  'Weekly close enabled': ['Cierre semanal activado', 'Fechamento semanal ativado'],
  'Weekly close required': ['Cierre semanal obligatorio', 'Fechamento semanal obrigatório'],
  'Worker compensation': ['Remuneración del trabajador', 'Remuneração do trabalhador'],
  'Workspace activity': ['Actividad del espacio de trabajo', 'Atividade do espaço de trabalho'],
  'Delete Skill': ['Eliminar competencia', 'Excluir competência'],
  'open assignment': ['abrir asignación', 'abrir atribuição'],
  'workspace access': ['acceso al espacio de trabajo', 'acesso ao espaço de trabalho'],
  'Actual recorded': ['Horas reales registradas', 'Horas trabalhadas registradas'],
  'Customer period report': [
    'Informe del período para el cliente',
    'Relatório do período para o cliente',
  ],
  'Customer report': ['Informe del cliente', 'Relatório do cliente'],
  'Technical reference': ['Referencia técnica', 'Referência técnica'],
  'System reference': ['Referencia del sistema', 'Referência do sistema'],
  'Backup reference': ['Referencia de copia de seguridad', 'Referência de cópia de segurança'],
  'Approved customer document': ['Documento del cliente aprobado', 'Documento do cliente aprovado'],
  'Customer private': ['Privado del cliente', 'Privado do cliente'],
  Operational: ['Operativo', 'Operacional'],
  Private: ['Privado', 'Privado'],
  'Project closeout': ['Cierre del proyecto', 'Encerramento do projeto'],
  Required: ['Obligatorio', 'Obrigatório'],
  'Employee portal': ['Portal del trabajador', 'Portal do trabalhador'],
  'J&A Automation portal': ['Portal de J&A Automation', 'Portal da J&A Automation'],
  'first.last': ['nombre.apellido', 'nome.sobrenome'],
  'For example: BBS Mexico': ['Por ejemplo: BBS México', 'Por exemplo: BBS México'],
  'minor units': ['unidades menores', 'unidades menores'],
  'Delivery uncertain; check mail server before retrying': [
    'Entrega incierta; comprueba el servidor de correo antes de reintentar',
    'Entrega incerta; verifique o servidor de e-mail antes de tentar novamente',
  ],
  'action.billing.invoiceEmail.uncertain': [
    'Entrega incierta; comprueba el servidor de correo antes de reintentar. No hay reintento automático.',
    'Entrega incerta; verifique o servidor de e-mail antes de tentar novamente. Não haverá nova tentativa automática.',
  ],
  'Email sending': ['Enviando correo', 'Enviando e-mail'],
  'action.billing.invoiceEmail.sending': ['El envío está en curso.', 'O envio está em andamento.'],
  'Invoice recipient email': [
    'Correo del destinatario de la factura',
    'E-mail do destinatário da fatura',
  ],
  'Send by email': ['Enviar por correo', 'Enviar por e-mail'],
  'Send the issued PDF by email. Queued is not sent; SMTP acceptance does not confirm inbox delivery.':
    [
      'Envía el PDF emitido por correo. En cola no significa enviado; la aceptación SMTP no confirma la entrega en la bandeja de entrada.',
      'Envie o PDF emitido por e-mail. Na fila não significa enviado; a aceitação SMTP não confirma a entrega na caixa de entrada.',
    ],
  'Accepted by SMTP server': ['Aceptado por el servidor SMTP', 'Aceito pelo servidor SMTP'],
  'Email failed; administrator action required': [
    'Error de correo; requiere intervención del administrador',
    'Falha no e-mail; requer ação do administrador',
  ],
  'Email delivery error; automatic retry pending': [
    'Error de envío; reintento automático pendiente',
    'Erro no envio; nova tentativa automática pendente',
  ],
  'Email queued': ['Correo en cola', 'E-mail na fila'],
  'Mark sent records a manual delivery only. It does not send an email.': [
    'Marcar enviada registra únicamente una entrega manual. No envía ningún correo.',
    'Marcar enviada registra apenas uma entrega manual. Não envia nenhum e-mail.',
  ],
  'action.billing.invoiceEmail.queued': [
    'Correo en cola. Todavía no se ha enviado.',
    'E-mail na fila. Ainda não foi enviado.',
  ],
  'action.billing.invoiceEmail.accepted': [
    'El servidor SMTP aceptó el correo. No confirma entrega en la bandeja de entrada.',
    'O servidor SMTP aceitou o e-mail. Não confirma entrega na caixa de entrada.',
  ],
  'action.billing.invoiceEmail.failed': [
    'El envío falló y requiere intervención del administrador.',
    'O envio falhou e requer ação do administrador.',
  ],
  'action.billing.invoiceEmail.retrying': [
    'Error de envío. El sistema reintentará automáticamente.',
    'Erro no envio. O sistema tentará novamente automaticamente.',
  ],
  'Document access': ['Acceso al documento', 'Acesso ao documento'],
  'Project document': ['Documento del proyecto', 'Documento do projeto'],
  'Finance, Owner and Auditor only': [
    'Solo Finanzas, Propietario y Auditor',
    'Somente Financeiro, Proprietário e Auditor',
  ],
  'Access role': ['Rol de acceso', 'Função de acesso'],
  'Choose the email and role. The invited person sets their own name and password securely.': [
    'Elige el correo y el rol. La persona invitada configura su nombre y contraseña de forma segura.',
    'Escolha o e-mail e a função. A pessoa convidada configura o próprio nome e senha com segurança.',
  ],
  Copied: ['Copiado', 'Copiado'],
  'Copy activation link': ['Copiar enlace de activación', 'Copiar link de ativação'],
  'Copy this private activation link and send it to the invited person.': [
    'Copia este enlace privado de activación y envíaselo a la persona invitada.',
    'Copie este link privado de ativação e envie-o à pessoa convidada.',
  ],
  'Create invitation': ['Crear invitación', 'Criar convite'],
  'Create user': ['Crear usuario', 'Criar usuário'],
  'Create user access': ['Crear acceso de usuario', 'Criar acesso de usuário'],
  'Email / company alias': ['Correo / alias corporativo', 'E-mail / alias corporativo'],
  'Invitation expires': ['Caducidad de la invitación', 'Validade do convite'],
  'Invitation ready': ['Invitación preparada', 'Convite pronto'],
  'SECURE USER PROVISIONING': ['ALTA SEGURA DE USUARIOS', 'PROVISIONAMENTO SEGURO DE USUÁRIOS'],
  'Send the link to the invited person through a trusted channel.': [
    'Envía el enlace a la persona invitada mediante un canal de confianza.',
    'Envie o link à pessoa convidada por um canal confiável.',
  ],
  'The portal creates a single-use activation link.': [
    'El portal crea un enlace de activación de un solo uso.',
    'O portal cria um link de ativação de uso único.',
  ],
  'They choose their name and password before the account becomes active.': [
    'La persona elige su nombre y contraseña antes de que la cuenta se active.',
    'A pessoa escolhe o nome e a senha antes que a conta seja ativada.',
  ],
  'What happens next': ['Qué ocurre después', 'O que acontece depois'],
  day: ['día', 'dia'],
  days: ['días', 'dias'],
  'active projects': ['proyectos activos', 'projetos ativos'],
  Address: ['Dirección', 'Endereço'],
  'AUTHORIZED DIRECTORY': ['DIRECTORIO AUTORIZADO', 'DIRETÓRIO AUTORIZADO'],
  'Active specialists, availability and project assignments.': [
    'Especialistas activos, disponibilidad y asignaciones de proyectos.',
    'Especialistas ativos, disponibilidade e atribuições de projetos.',
  ],
  Assignment: ['Asignación', 'Atribuição'],
  Assignments: ['Asignaciones', 'Atribuições'],
  available: ['disponible', 'disponível'],
  'Authorized client contacts, sites and project context.': [
    'Contactos autorizados del cliente, plantas y contexto de proyecto.',
    'Contatos autorizados do cliente, locais e contexto do projeto.',
  ],
  'Authorized project': ['Proyecto autorizado', 'Projeto autorizado'],
  'Company, contact, phone or site': [
    'Empresa, contacto, teléfono o planta',
    'Empresa, contato, telefone ou local',
  ],
  'Commercial model & owners': [
    'Modelo comercial y responsables',
    'Modelo comercial e responsáveis',
  ],
  'COMMERCIAL OWNERSHIP': ['RESPONSABILIDAD COMERCIAL', 'RESPONSABILIDADE COMERCIAL'],
  Contacts: ['Contactos', 'Contatos'],
  'Project management actions': ['Acciones de gestión de proyectos', 'Ações de gestão de projetos'],
  'Choose one action. The portal will show only the fields needed for that task.': [
    'Elige una acción. El portal mostrará solo los campos necesarios para esa tarea.',
    'Escolha uma ação. O portal mostrará apenas os campos necessários para essa tarefa.',
  ],
  'Account status': ['Estado de la cuenta', 'Status da conta'],
  'Delete this contact?': ['¿Eliminar este contacto?', 'Excluir este contato?'],
  'Edit profile': ['Editar perfil', 'Editar perfil'],
  'Edit team member': ['Editar miembro del equipo', 'Editar membro da equipe'],
  'Remove access': ['Retirar acceso', 'Remover acesso'],
  'Restore access': ['Restaurar acceso', 'Restaurar acesso'],
  'Remove this team member access?': [
    '¿Retirar el acceso de este miembro del equipo?',
    'Remover o acesso deste membro da equipe?',
  ],
  'Dismiss notification': ['Cerrar notificación', 'Fechar notificação'],
  'Filter by category': ['Filtrar por categoría', 'Filtrar por categoria'],
  Filter: ['Filtrar', 'Filtrar'],
  'Access profile': ['Perfil de acceso', 'Perfil de acesso'],
  'Publish a planned shift for an assigned worker. Planning does not create actual time entries; the worker records the work performed separately.':
    [
      'Publica un turno previsto para un trabajador asignado. La planificación no crea horas reales; el trabajador registra por separado el trabajo realizado.',
      'Publique um turno previsto para um trabalhador alocado. O planejamento não cria horas reais; o trabalhador registra separadamente o trabalho realizado.',
    ],
  'Filter clients': ['Filtrar clientes', 'Filtrar clientes'],
  'Identification & client': ['Identificación y cliente', 'Identificação e cliente'],
  'Include inactive specialists': [
    'Incluir especialistas inactivos',
    'Incluir especialistas inativos',
  ],
  'Keep the authorized client and project references clear and traceable.': [
    'Mantén claras y trazables las referencias autorizadas de cliente y proyecto.',
    'Mantenha claras e rastreáveis as referências autorizadas de cliente e projeto.',
  ],
  'LOCATION & PLANNING': ['UBICACIÓN Y PLANIFICACIÓN', 'LOCALIZAÇÃO E PLANEJAMENTO'],
  'Location & planning': ['Ubicación y planificación', 'Localização e planejamento'],
  'Name, role or project': ['Nombre, rol o proyecto', 'Nome, função ou projeto'],
  'No active specialists found.': [
    'No se encontraron especialistas activos.',
    'Nenhum especialista ativo encontrado.',
  ],
  'No associated projects recorded.': [
    'No hay proyectos asociados registrados.',
    'Nenhum projeto associado registrado.',
  ],
  'No authorized clients found.': [
    'No se encontraron clientes autorizados.',
    'Nenhum cliente autorizado encontrado.',
  ],
  'No contacts recorded.': ['No hay contactos registrados.', 'Nenhum contato registrado.'],
  'No expenses match this category.': [
    'No hay gastos para esta categoría.',
    'Nenhuma despesa corresponde a esta categoria.',
  ],
  'No project assignments recorded.': [
    'No hay asignaciones de proyecto registradas.',
    'Nenhuma atribuição de projeto registrada.',
  ],
  'Not provided': ['No proporcionado', 'Não informado'],
  'OPERATIONAL DIRECTORY': ['DIRECTORIO OPERATIVO', 'DIRETÓRIO OPERACIONAL'],
  'Planned hours': ['Horas planificadas', 'Horas planejadas'],
  'Project assignments': ['Asignaciones de proyecto', 'Atribuições de projeto'],
  'PROJECT IDENTITY': ['IDENTIDAD DEL PROYECTO', 'IDENTIDADE DO PROJETO'],
  'Projects and sites': ['Proyectos y plantas', 'Projetos e locais'],
  'Review the commercial model, limits and accountable owner.': [
    'Revisa el modelo comercial, los límites y el responsable.',
    'Revise o modelo comercial, os limites e o responsável.',
  ],
  'Search clients': ['Buscar clientes', 'Pesquisar clientes'],
  'Search team': ['Buscar equipo', 'Pesquisar equipe'],
  'Sites / plants': ['Plantas / sitios', 'Locais / plantas'],
  Specialist: ['Especialista', 'Especialista'],
  'Status unavailable': ['Estado no disponible', 'Status indisponível'],
  'Unnamed contact': ['Contacto sin nombre', 'Contato sem nome'],
  'Unnamed specialist': ['Especialista sin nombre', 'Especialista sem nome'],
  'No email': ['Sin correo electrónico', 'Sem e-mail'],
  'Set the operating site, dates and planning assumptions.': [
    'Define la planta operativa, las fechas y las premisas de planificación.',
    'Defina o local operacional, as datas e as premissas de planejamento.',
  ],
  'Run every project with confidence.': [
    'Gestiona cada proyecto con confianza.',
    'Gerencie cada projeto com confiança.',
  ],
  Other: ['Otro', 'Outro'],
  Failed: ['Con errores', 'Com falha'],
  'Failed report': ['Informe con errores', 'Relatório com falha'],
  'Report failed': ['Informe con errores', 'Relatório com falha'],
  'No time economics are available for this project.': [
    'No hay datos económicos del tiempo disponibles para este proyecto.',
    'Não há dados econômicos do tempo disponíveis para este projeto.',
  ],
  'No time economics are available in this period.': [
    'No hay datos económicos del tiempo disponibles en este período.',
    'Não há dados econômicos do tempo disponíveis neste período.',
  ],
  'No time economics in this period.': [
    'No hay datos económicos del tiempo en este período.',
    'Não há dados econômicos do tempo neste período.',
  ],
  'Client user': ['Usuario del cliente', 'Usuário do cliente'],
  'Account Status': ['Estado de la cuenta', 'Status da conta'],
  'Account options': ['Opciones de la cuenta', 'Opções da conta'],
  'Accounting Pack': ['Paquete contable', 'Pacote contábil'],
  'Accounting Pack artifacts': ['Artefactos del paquete contable', 'Artefatos do pacote contábil'],
  'Accounting Pack register': ['Registro de paquetes contables', 'Registro de pacotes contábeis'],
  'Accounting Pack report language': [
    'Idioma del informe del paquete contable',
    'Idioma do relatório do pacote contábil',
  ],
  'Add skill': ['Añadir competencia', 'Adicionar competência'],
  'Add Skill': ['Añadir competencia', 'Adicionar competência'],
  'All assigned workers': ['Todos los trabajadores asignados', 'Todos os colaboradores atribuídos'],
  'All-in': ['Todo incluido', 'Tudo incluído'],
  'All-in and reimbursable combined': [
    'Todo incluido y reembolsable combinados',
    'Tudo incluído e reembolsável combinados',
  ],
  'Approved actual time': ['Horas reales aprobadas', 'Horas trabalhadas aprovadas'],
  'Approved estimate': ['Estimación aprobada', 'Estimativa aprovada'],
  'Approved hours': ['Horas aprobadas', 'Horas aprovadas'],
  'Approved unbilled WIP': [
    'Trabajo en curso aprobado no facturado',
    'Trabalho em andamento aprovado não faturado',
  ],
  'Assign skill': ['Asignar competencia', 'Atribuir competência'],
  'Assigned workforce': ['Personal asignado', 'Equipe atribuída'],
  Availability: ['Disponibilidad', 'Disponibilidade'],
  Available: ['Disponible', 'Disponível'],
  Basis: ['Base', 'Base'],
  Billable: ['Facturable', 'Faturável'],
  'Billable hours': ['Horas facturables', 'Horas faturáveis'],
  'Billing address': ['Dirección de facturación', 'Endereço de faturamento'],
  'Billing rules': ['Reglas de facturación', 'Regras de faturamento'],
  'Billing stream': ['Flujo de facturación', 'Fluxo de faturamento'],
  Blockers: ['Bloqueos', 'Bloqueios'],
  Break: ['Pausa', 'Intervalo'],
  'Build draft': ['Crear borrador', 'Criar rascunho'],
  'By category': ['Por categoría', 'Por categoria'],
  'By day': ['Por día', 'Por dia'],
  'By worker': ['Por trabajador', 'Por colaborador'],
  Cadence: ['Cadencia', 'Periodicidade'],
  Cancel: ['Cancelar', 'Cancelar'],
  Categories: ['Categorías', 'Categorias'],
  Category: ['Categoría', 'Categoria'],
  Change: ['Cambio', 'Alteração'],
  'Change history': ['Historial de cambios', 'Histórico de alterações'],
  'Change summary': ['Resumen del cambio', 'Resumo da alteração'],
  'Changed fields': ['Campos modificados', 'Campos alterados'],
  'Clear filter': ['Borrar filtro', 'Limpar filtro'],
  'Client / project': ['Cliente / proyecto', 'Cliente / projeto'],
  'Client contacts': ['Contactos del cliente', 'Contatos do cliente'],
  'Client decisions': ['Decisiones del cliente', 'Decisões do cliente'],
  'Client revenue': ['Ingresos del cliente', 'Receita do cliente'],
  'Commercial milestones': ['Hitos comerciales', 'Marcos comerciais'],
  'Commercial model': ['Modelo comercial', 'Modelo comercial'],
  Commissioning: ['Puesta en marcha', 'Comissionamento'],
  Complete: ['Completo', 'Concluído'],
  Configuration: ['Configuración', 'Configuração'],
  Contact: ['Contacto', 'Contato'],
  'Create adjustment': ['Crear ajuste', 'Criar ajuste'],
  'Create Invitation': ['Crear invitación', 'Criar convite'],
  'Create Milestone': ['Crear hito', 'Criar marco'],
  'Customer contact': ['Contacto del cliente', 'Contato do cliente'],
  Daily: ['Diario', 'Diário'],
  'Daily guarantee coverage': ['Cobertura de garantía diaria', 'Cobertura da garantia diária'],
  'Daily reports': ['Informes diarios', 'Relatórios diários'],
  'Daily report': ['Informe diario', 'Relatório diário'],
  'Related reports': ['Informes relacionados', 'Relatórios relacionados'],
  'No related reports yet.': [
    'Todavía no hay informes relacionados.',
    'Ainda não há relatórios relacionados.',
  ],
  'View project reports': ['Ver informes del proyecto', 'Ver relatórios do projeto'],
  'Technical report': ['Informe técnico', 'Relatório técnico'],
  Debit: ['Débito', 'Débito'],
  Delete: ['Eliminar', 'Excluir'],
  'Delete contact': ['Eliminar contacto', 'Excluir contato'],
  'Delete report': ['Eliminar informe', 'Excluir relatório'],
  'Delete skill': ['Eliminar competencia', 'Excluir competência'],
  Detail: ['Detalle', 'Detalhe'],
  'Device name': ['Nombre del dispositivo', 'Nome do dispositivo'],
  Difference: ['Diferencia', 'Diferença'],
  'Disable MFA': ['Desactivar MFA', 'Desativar MFA'],
  Document: ['Documento', 'Documento'],
  Download: ['Descargar', 'Baixar'],
  'Draft saved at': ['Borrador guardado a las', 'Rascunho salvo em'],
  'Due on': ['Vencimiento', 'Vencimento'],
  'Edit billing rule': ['Editar regla de facturación', 'Editar regra de faturamento'],
  'Edit contact': ['Editar contacto', 'Editar contato'],
  'Edit Profile': ['Editar perfil', 'Editar perfil'],
  'Enable MFA': ['Activar MFA', 'Ativar MFA'],
  Enabled: ['Activado', 'Ativado'],
  End: ['Fin', 'Fim'],
  Ends: ['Termina', 'Termina'],
  Equipment: ['Equipamiento', 'Equipamento'],
  'Estimate from approved and pending records': [
    'Estimación a partir de registros aprobados y pendientes',
    'Estimativa a partir de registros aprovados e pendentes',
  ],
  'Expected minutes': ['Minutos previstos', 'Minutos esperados'],
  'Expected Working Schedule': ['Horario de trabajo previsto', 'Horário de trabalho esperado'],
  'Expense economics': ['Datos económicos de gastos', 'Dados econômicos de despesas'],
  'Expense CSV': ['CSV de gastos', 'CSV de despesas'],
  'Expense treatment': ['Tratamiento del gasto', 'Tratamento da despesa'],
  'Expenses included': ['Gastos incluidos', 'Despesas incluídas'],
  'Field & PLC reports': ['Informes de campo y PLC', 'Relatórios de campo e PLC'],
  File: ['Archivo', 'Arquivo'],
  Finalize: ['Finalizar', 'Finalizar'],
  'Finalize compensation': ['Finalizar compensación', 'Finalizar remuneração'],
  'Finance approve': ['Aprobación financiera', 'Aprovação financeira'],
  From: ['Desde', 'De'],
  Fuel: ['Combustible', 'Combustível'],
  'Full name': ['Nombre completo', 'Nome completo'],
  Grouping: ['Agrupación', 'Agrupamento'],
  Hotel: ['Alojamiento (hotel)', 'Hospedagem (hotel)'],
  Hours: ['Horas', 'Horas'],
  'Inspect worker': ['Inspeccionar trabajador', 'Inspecionar colaborador'],
  'Invite new worker': ['Invitar a un trabajador', 'Convidar colaborador'],
  'Invoice numbering policy': [
    'Política de numeración de facturas',
    'Política de numeração de faturas',
  ],
  'Invoice CSV': ['CSV de facturas', 'CSV de faturas'],
  'Invoice report language': ['Idioma del informe de factura', 'Idioma do relatório da fatura'],
  'Invoice template': ['Plantilla de factura', 'Modelo de fatura'],
  'Joined At': ['Fecha de incorporación', 'Data de entrada'],
  'Keep current': ['Mantener actual', 'Manter atual'],
  'Loaded labor cost': ['Coste laboral cargado', 'Custo de mão de obra carregado'],
  'Manage worker': ['Gestionar trabajador', 'Gerenciar colaborador'],
  'Manage worker availability': [
    'Gestionar disponibilidad del trabajador',
    'Gerenciar disponibilidade do colaborador',
  ],
  'Manage worker profiles': [
    'Gestionar perfiles de trabajadores',
    'Gerenciar perfis de colaboradores',
  ],
  'Manage worker skills': [
    'Gestionar competencias de trabajadores',
    'Gerenciar competências de colaboradores',
  ],
  'Mark as read': ['Marcar como leído', 'Marcar como lido'],
  'Mark reimbursed': ['Marcar como reembolsado', 'Marcar como reembolsado'],
  'Mark sent': ['Marcar como enviado', 'Marcar como enviado'],
  Milestone: ['Hito', 'Marco'],
  'Milestones awaiting approval': ['Hitos pendientes de aprobación', 'Marcos aguardando aprovação'],
  'Minor-unit amount': ['Importe en unidades menores', 'Valor em unidades menores'],
  'Mobile navigation': ['Navegación móvil', 'Navegação móvel'],
  Monthly: ['Mensual', 'Mensal'],
  'New Invoice Numbering Policy': [
    'Nueva política de numeración de facturas',
    'Nova política de numeração de faturas',
  ],
  'New Legal Entity': ['Nueva entidad jurídica', 'Nova entidade legal'],
  'New Skill': ['Nueva competencia', 'Nova competência'],
  'New Tax Profile': ['Nuevo perfil fiscal', 'Novo perfil fiscal'],
  'Next steps': ['Próximos pasos', 'Próximos passos'],
  'No approved worker economics are available.': [
    'No hay datos económicos aprobados del trabajador.',
    'Não há dados econômicos aprovados do colaborador.',
  ],
  'No billing stream is configured for this project. Configure one in Billing before creating an invoice draft.':
    [
      'No hay ningún flujo de facturación configurado para este proyecto. Configura uno en Facturación antes de crear un borrador de factura.',
      'Nenhum fluxo de faturamento está configurado para este projeto. Configure um em Faturamento antes de criar um rascunho de fatura.',
    ],
  'No calculated commercial lines.': [
    'No hay líneas comerciales calculadas.',
    'Não há linhas comerciais calculadas.',
  ],
  'No daily reports in this period.': [
    'No hay informes diarios en este período.',
    'Não há relatórios diários neste período.',
  ],
  'No expenses in this period.': [
    'No hay gastos en este período.',
    'Não há despesas neste período.',
  ],
  'No finance projects are available.': [
    'No hay proyectos financieros disponibles.',
    'Não há projetos financeiros disponíveis.',
  ],
  'No invoice drafts.': ['No hay borradores de facturas.', 'Não há rascunhos de faturas.'],
  'No milestones configured.': ['No hay hitos configurados.', 'Nenhum marco está configurado.'],
  'No private documents are available in your access scope.': [
    'No hay documentos privados disponibles en tu ámbito de acceso.',
    'Não há documentos privados disponíveis no seu escopo de acesso.',
  ],
  'No technical records in this period.': [
    'No hay registros técnicos en este período.',
    'Não há registros técnicos neste período.',
  ],
  'No time entries in this period.': [
    'No hay registros de horas en este período.',
    'Não há registros de horas neste período.',
  ],
  'Not approved': ['No aprobado', 'Não aprovado'],
  'Not configured': ['No configurado', 'Não configurado'],
  'Not submitted': ['No enviado', 'Não enviado'],
  Notification: ['Notificación', 'Notificação'],
  Offboard: ['Dar de baja', 'Desativar acesso'],
  'One-time recovery codes': [
    'Códigos de recuperación de un solo uso',
    'Códigos de recuperação de uso único',
  ],
  Outstanding: ['Pendiente de cobro', 'Em aberto'],
  Overtime: ['Horas extra', 'Hora extra'],
  'Overtime method': ['Método de horas extra', 'Método de hora extra'],
  'Owner / Admin': ['Propietario / administrador', 'Proprietário / administrador'],
  'Owner / finance': ['Propietario / finanzas', 'Proprietário / finanças'],
  'Owner access': ['Acceso del propietario', 'Acesso do proprietário'],
  'Payment amount': ['Importe del pago', 'Valor do pagamento'],
  'Payment reference': ['Referencia del pago', 'Referência do pagamento'],
  Pending: ['Pendiente', 'Pendente'],
  'Pending actual time': ['Horas reales pendientes', 'Horas trabalhadas pendentes'],
  'Pending estimate': ['Estimación pendiente', 'Estimativa pendente'],
  'Pending pay:': ['Pago pendiente:', 'Pagamento pendente:'],
  'Percentage rule active': ['Regla porcentual activa', 'Regra percentual ativa'],
  Period: ['Período', 'Período'],
  'Period report': ['Informe de período', 'Relatório de período'],
  'Planning basis available': [
    'Base de planificación disponible',
    'Base de planejamento disponível',
  ],
  Planned: ['Planificado', 'Planejado'],
  'Planned end': ['Fin planificado', 'Fim planejado'],
  'Planning target only; it never creates time.': [
    'Solo es un objetivo de planificación; nunca crea tiempo.',
    'É apenas uma meta de planejamento; nunca cria tempo.',
  ],
  'Portfolio views': ['Vistas de cartera', 'Visões do portfólio'],
  Preview: ['Vista previa', 'Pré-visualização'],
  'Print preview': ['Vista previa de impresión', 'Pré-visualização de impressão'],
  'Private project documents': [
    'Documentos privados del proyecto',
    'Documentos privados do projeto',
  ],
  'Registered documents are retained as evidence. Upload a corrected file as a new document; the original stays available in the audit history.':
    [
      'Los documentos registrados se conservan como prueba. Sube el archivo corregido como documento nuevo; el original seguirá disponible en el historial de auditoría.',
      'Os documentos registados são conservados como prova. Carregue o ficheiro corrigido como novo documento; o original continuará disponível no histórico de auditoria.',
    ],
  Processing: ['Procesando', 'Processando'],
  Proficiency: ['Competencia', 'Proficiência'],
  'Proficiency (1-5)': ['Competencia (1-5)', 'Proficiência (1-5)'],
  'Proficiency (1–5)': ['Competencia (1–5)', 'Proficiência (1–5)'],
  'Project manager': ['Responsable del proyecto', 'Gerente do projeto'],
  'Projects included': ['Proyectos incluidos', 'Projetos incluídos'],
  'Publish assignment': ['Publicar asignación', 'Publicar atribuição'],
  'Published schedule': ['Calendario publicado', 'Cronograma publicado'],
  Quantity: ['Cantidad', 'Quantidade'],
  'Rate review': ['Revisión de tarifa', 'Revisão de tarifa'],
  'Rate rule active': ['Regla de tarifa activa', 'Regra de tarifa ativa'],
  Ready: ['Listo', 'Pronto'],
  Receipt: ['Recibo', 'Recibo'],
  'Record date': ['Fecha del registro', 'Data do registro'],
  'Record payment': ['Registrar pago', 'Registrar pagamento'],
  'Records requiring review': ['Registros que requieren revisión', 'Registros que exigem revisão'],
  'Recover draft': ['Recuperar borrador', 'Recuperar rascunho'],
  'Register passkey': ['Registrar clave de acceso', 'Registrar chave de acesso'],
  'Remove assignment': ['Quitar asignación', 'Remover atribuição'],
  'Remove skill': ['Quitar competencia', 'Remover competência'],
  'Remove Worker Skill': [
    'Quitar competencia del trabajador',
    'Remover competência do colaborador',
  ],
  'Rental car': ['Coche de alquiler', 'Carro alugado'],
  'Report navigation': ['Navegación de informes', 'Navegação de relatórios'],
  'Report register': ['Registro de informes', 'Registro de relatórios'],
  'Report summary': ['Resumen del informe', 'Resumo do relatório'],
  'Required change': ['Cambio requerido', 'Alteração obrigatória'],
  'Required skill': ['Competencia requerida', 'Competência obrigatória'],
  Return: ['Volver', 'Voltar'],
  'Revenue attributed': ['Ingresos atribuidos', 'Receita atribuída'],
  'Revenue candidate': ['Candidato a ingresos', 'Candidato a receita'],
  'Review required': ['Revisión requerida', 'Revisão necessária'],
  'Safety impact': ['Impacto en la seguridad', 'Impacto na segurança'],
  'Safety-related': ['Relacionado con la seguridad', 'Relacionado à segurança'],
  'Save billing rule': ['Guardar regla de facturación', 'Salvar regra de faturamento'],
  'Save billing stream': ['Guardar flujo de facturación', 'Salvar fluxo de faturamento'],
  'Save contact': ['Guardar contacto', 'Salvar contato'],
  'Save legal entity': ['Guardar entidad jurídica', 'Salvar entidade legal'],
  'Save milestone': ['Guardar hito', 'Salvar marco'],
  'Save numbering policy': ['Guardar política de numeración', 'Salvar política de numeração'],
  'Save profile': ['Guardar perfil', 'Salvar perfil'],
  'Save schedule': ['Guardar calendario', 'Salvar cronograma'],
  'Save skill': ['Guardar competencia', 'Salvar competência'],
  'Save tax profile': ['Guardar perfil fiscal', 'Salvar perfil fiscal'],
  'Save worker availability': [
    'Guardar disponibilidad del trabajador',
    'Salvar disponibilidade do colaborador',
  ],
  'Select entity': ['Seleccionar entidad', 'Selecionar entidade'],
  'Select legal entity': ['Seleccionar entidad jurídica', 'Selecionar entidade legal'],
  'Select skill': ['Seleccionar competencia', 'Selecionar competência'],
  'Select tax profile': ['Seleccionar perfil fiscal', 'Selecionar perfil fiscal'],
  'Semi-monthly': ['Quincenal', 'Quinzenal'],
  'Semi-monthly rule': ['Regla quincenal', 'Regra quinzenal'],
  Sensitive: ['Sensible', 'Sensível'],
  Sensitivity: ['Sensibilidad', 'Sensibilidade'],
  'Separate billing treatment': [
    'Tratamiento de facturación separado',
    'Tratamento de faturamento separado',
  ],
  Shift: ['Turno', 'Turno'],
  'Shift window': ['Ventana del turno', 'Janela do turno'],
  Site: ['Sitio', 'Local'],
  Source: ['Origen', 'Origem'],
  Sources: ['Orígenes', 'Origens'],
  Spanish: ['Español', 'Espanhol'],
  'Standby / waiting': ['Guardia / espera', 'Plantão / espera'],
  'Standby reason': ['Motivo de disponibilidad', 'Motivo do plantão'],
  Starts: ['Comienza', 'Começa'],
  State: ['Estado', 'Estado'],
  Status: ['Estado', 'Status'],
  'Status for': ['Estado de', 'Status de'],
  Stream: ['Flujo', 'Fluxo'],
  Submitted: ['Enviado', 'Enviado'],
  Subtotal: ['Subtotal', 'Subtotal'],
  Suspend: ['Suspender', 'Suspender'],
  'Tax Profile': ['Perfil fiscal', 'Perfil fiscal'],
  'Time by category': ['Tiempo por categoría', 'Tempo por categoria'],
  'Time economics review': [
    'Revisión de datos económicos del tiempo',
    'Revisão dos dados econômicos do tempo',
  ],
  'Time entry': ['Registro de horas', 'Registro de horas'],
  'Time record(s) have no matching compensation rule and require Finance review.': [
    'Hay registros de horas sin regla de compensación coincidente que requieren revisión financiera.',
    'Há registros de horas sem regra de remuneração correspondente que exigem revisão financeira.',
  ],
  'Tools / consumables': ['Herramientas / consumibles', 'Ferramentas / consumíveis'],
  Total: ['Importe total', 'Total geral'],
  Treatment: ['Tratamiento', 'Tratamento'],
  'Travel cost': ['Coste de viaje', 'Custo de viagem'],
  Unassigned: ['Sin asignar', 'Não atribuído'],
  Unavailable: ['No disponible', 'Indisponível'],
  'Update contact': ['Actualizar contacto', 'Atualizar contato'],
  'Update legal entity': ['Actualizar entidad jurídica', 'Atualizar entidade legal'],
  'Update skill': ['Actualizar competencia', 'Atualizar competência'],
  'Update skill matrix': ['Actualizar matriz de competencias', 'Atualizar matriz de competências'],
  'Update status': ['Actualizar estado', 'Atualizar status'],
  'Upload and register hash': ['Cargar y registrar el hash', 'Enviar e registrar o hash'],
  'Use recipient email': ['Usar el correo del destinatario', 'Usar o e-mail do destinatário'],
  Validation: ['Validación', 'Validação'],
  'Verify for protected actions': [
    'Verificar para acciones protegidas',
    'Verificar para ações protegidas',
  ],
  'Verify MFA': ['Verificar MFA', 'Verificar MFA'],
  View: ['Ver', 'Ver'],
  'View worker profile': ['Ver perfil del trabajador', 'Ver perfil do colaborador'],
  'Visa / permit': ['Visado / permiso', 'Visto / autorização'],
  'Void reason': ['Motivo de anulación', 'Motivo do cancelamento'],
  Weekly: ['Semanal', 'Semanal'],
  Window: ['Ventana', 'Janela'],
  WIP: ['Trabajo en curso', 'Trabalho em andamento'],
  'Work laptop': ['Portátil de trabajo', 'Computador de trabalho'],
  'Worker reimbursement queue': [
    'Cola de reembolsos del trabajador',
    'Fila de reembolsos do colaborador',
  ],
  workers: ['trabajadores', 'colaboradores'],
  'Worker paid': ['Pagado por el trabajador', 'Pago pelo colaborador'],
};

const extraExact: Record<string, readonly [string, string]> = {
  'A quick check keeps your workspace secure.': [
    'Una comprobación rápida mantiene seguro tu espacio de trabajo.',
    'Uma verificação rápida mantém seu espaço de trabalho seguro.',
  ],
  'A workspace user': ['Usuario del espacio de trabajo', 'Usuário do espaço de trabalho'],
  'Actual minus expected for the day.': [
    'Real menos previsto para el día.',
    'Real menos esperado para o dia.',
  ],
  'Add this URI to your authenticator, then enter the current six-digit code to confirm the device. Recovery codes are shown once; store them securely.':
    [
      'Añade esta URI a tu autenticador e introduce el código actual de seis dígitos para confirmar el dispositivo. Los códigos de recuperación se muestran una sola vez; guárdalos de forma segura.',
      'Adicione esta URI ao autenticador e informe o código atual de seis dígitos para confirmar o dispositivo. Os códigos de recuperação são exibidos uma única vez; guarde-os com segurança.',
    ],
  'Add this week’s layout': [
    'Añadir la estructura de esta semana',
    'Adicionar o layout desta semana',
  ],
  'Admin/Finance-only aggregates remain grouped by currency and drill back to the selected project economics.':
    [
      'Los agregados exclusivos de administración/finanzas permanecen agrupados por moneda y permiten volver a los datos económicos del proyecto seleccionado.',
      'Os agregados exclusivos de administração/finanças permanecem agrupados por moeda e permitem voltar aos dados econômicos do projeto selecionado.',
    ],
  'Approval queue clear.': [
    'La cola de aprobaciones está vacía.',
    'A fila de aprovações está vazia.',
  ],
  'Archiving a client hides it from active lists but retains historical financial and project data.':
    [
      'Archivar un cliente lo oculta de las listas activas, pero conserva sus datos financieros y de proyecto históricos.',
      'Arquivar um cliente o oculta das listas ativas, mas preserva seus dados financeiros e de projeto históricos.',
    ],
  'Are you sure you want to delete this document?': [
    '¿Seguro que quieres eliminar este documento?',
    'Tem certeza de que deseja excluir este documento?',
  ],
  'Capture problems, corrective action, customer decisions, and blockers.': [
    'Captura los problemas, las acciones correctivas, las decisiones del cliente y los bloqueos.',
    'Registre problemas, ações corretivas, decisões do cliente e bloqueios.',
  ],
  'Changes are versioned and notify the owner/admin review group.': [
    'Los cambios se versionan y notifican al grupo de revisión de propietarios/administradores.',
    'As alterações são versionadas e notificam o grupo de revisão de proprietários/administradores.',
  ],
  'Contribution margin is project revenue less approved project cost. It is not company net profit.':
    [
      'El margen de contribución es la diferencia entre los ingresos y el coste aprobado del proyecto. No es el beneficio neto de la empresa.',
      'A margem de contribuição é a diferença entre a receita e o custo aprovado do projeto. Não é o lucro líquido da empresa.',
    ],
  'Copies projects, categories and activity labels into zero-minute drafts. It never copies time values.':
    [
      'Copia proyectos, categorías y etiquetas de actividad en borradores de cero minutos. Nunca copia valores de tiempo.',
      'Copia projetos, categorias e rótulos de atividade para rascunhos de zero minutos. Nunca copia valores de tempo.',
    ],
  'Current projects, field records, and billing readiness in one view.': [
    'Proyectos actuales, registros de campo y preparación de facturación en una sola vista.',
    'Projetos atuais, registros de campo e preparação de faturamento em uma única visão.',
  ],
  'Deleting removes this draft source record and records the action in the audit trail. Finalized reports cannot be deleted.':
    [
      'Eliminar quita este registro de origen en borrador y registra la acción en la pista de auditoría. Los informes finalizados no se pueden eliminar.',
      'Excluir remove este registro de origem em rascunho e registra a ação na trilha de auditoria. Relatórios finalizados não podem ser excluídos.',
    ],
  'Expected availability is 10 hours Monday through Saturday; Sunday stays at zero.': [
    'La disponibilidad prevista es de 10 horas de lunes a sábado; el domingo permanece en cero.',
    'A disponibilidade esperada é de 10 horas de segunda a sábado; o domingo permanece em zero.',
  ],
  'Existing rules are historical records. Edit by superseding the selected record; deactivate only ends its future applicability.':
    [
      'Las reglas existentes son registros históricos. Edita sustituyendo el registro seleccionado; desactivar solo termina su aplicabilidad futura.',
      'As regras existentes são registros históricos. Edite substituindo o registro selecionado; desativar apenas encerra sua aplicabilidade futura.',
    ],
  'Files are private, hash-verified, and authorized on every download.': [
    'Los archivos son privados, se verifican mediante hash y se autorizan en cada descarga.',
    'Os arquivos são privados, têm o hash verificado e são autorizados a cada download.',
  ],
  'Forecasts use actual records first and only use configured planning data for the remaining work. They never create actual time or billing sources.':
    [
      'Las previsiones usan primero los registros reales y solo utilizan datos de planificación configurados para el trabajo restante. Nunca crean horas reales ni fuentes de facturación.',
      'As previsões usam primeiro os registros reais e só usam dados de planejamento configurados para o trabalho restante. Nunca criam horas trabalhadas nem fontes de faturamento.',
    ],
  'Identify the plant, line, station, and automation equipment involved.': [
    'Identifica la planta, la línea, la estación y el equipo de automatización implicados.',
    'Identifique a planta, linha, estação e equipamento de automação envolvidos.',
  ],
  'Internal loaded cost, worker compensation and margin remain restricted to Finance, Owner and Auditor roles.':
    [
      'El coste interno cargado, la compensación del trabajador y el margen siguen restringidos a los roles de Finanzas, Propietario y Auditor.',
      'O custo interno carregado, a remuneração do colaborador e a margem permanecem restritos aos papéis de Finanças, Proprietário e Auditor.',
    ],
  'Labor and expense streams are configured independently. Draft generation may be automatic; invoice issue and send remain manual.':
    [
      'Los flujos de trabajo y gastos se configuran de forma independiente. La generación de borradores puede ser automática; emitir y enviar facturas sigue siendo manual.',
      'Os fluxos de mão de obra e despesas são configurados de forma independente. A geração de rascunhos pode ser automática; emitir e enviar faturas continua manual.',
    ],
  'Labor and reimbursable expenses use independent streams and configured tax profiles. All-in project expenses remain in project cost and do not appear here.':
    [
      'El trabajo y los gastos reembolsables usan flujos independientes y perfiles fiscales configurados. Los gastos todo incluido del proyecto permanecen en el coste del proyecto y no aparecen aquí.',
      'A mão de obra e as despesas reembolsáveis usam fluxos independentes e perfis fiscais configurados. As despesas tudo incluído do projeto permanecem no custo do projeto e não aparecem aqui.',
    ],
  'Leave the handover context needed for the next shift and review.': [
    'Deja el contexto de entrega necesario para el siguiente turno y la revisión.',
    'Deixe o contexto de passagem necessário para o próximo turno e revisão.',
  ],
  'Only records in your access scope': [
    'Solo registros dentro de tu ámbito de acceso',
    'Somente registros no seu escopo de acesso',
  ],
  'Passkey sign-in was cancelled or is not available on this device.': [
    'El acceso con clave de acceso se canceló o no está disponible en este dispositivo.',
    'O login com chave de acesso foi cancelado ou não está disponível neste dispositivo.',
  ],
  'Passkey sign-in was cancelled or unavailable.': [
    'El acceso con clave de acceso se canceló o no está disponible.',
    'O login com chave de acesso foi cancelado ou está indisponível.',
  ],
  'Projects cannot be hard-deleted to preserve financial history and audit logs. Use Archived to remove a project from active operational views.':
    [
      'Los proyectos no se pueden eliminar físicamente para conservar el historial financiero y los registros de auditoría. Usa Archivado para quitar un proyecto de las vistas operativas activas.',
      'Projetos não podem ser excluídos permanentemente para preservar o histórico financeiro e os registros de auditoria. Use Arquivado para remover um projeto das visões operacionais ativas.',
    ],
  'Protected by secure sessions and rate limits. Optional MFA is available in your profile.': [
    'Protegido por sesiones seguras y límites de frecuencia. MFA opcional está disponible en tu perfil.',
    'Protegido por sessões seguras e limites de frequência. A MFA opcional está disponível no seu perfil.',
  ],
  'Rates are effective-dated and resolved by assignment, category, activity, and project scope.': [
    'Las tarifas tienen fecha de vigencia y se resuelven por asignación, categoría, actividad y ámbito del proyecto.',
    'As tarifas têm data de vigência e são resolvidas por atribuição, categoria, atividade e escopo do projeto.',
  ],
  'Rates are resolved by project, worker, category, and effective date.': [
    'Las tarifas se resuelven por proyecto, trabajador, categoría y fecha de vigencia.',
    'As tarifas são resolvidas por projeto, colaborador, categoria e data de vigência.',
  ],
  'Receipts, PLC backups and project reports are validated, hashed and kept outside the public site.':
    [
      'Los recibos, copias de seguridad PLC e informes de proyecto se validan, tienen hash y se mantienen fuera del sitio público.',
      'Os recibos, cópias de segurança do PLC e relatórios de projeto são validados, recebem hash e ficam fora da área pública.',
    ],
  'Register a device passkey for faster, phishing-resistant sign-in. A passkey never leaves your device.':
    [
      'Registra una clave de acceso del dispositivo para iniciar sesión más rápido y resistir el phishing. La clave nunca sale de tu dispositivo.',
      'Registre uma chave de acesso do dispositivo para login mais rápido e resistente a phishing. A chave nunca sai do seu dispositivo.',
    ],
  'Reimbursements are separate from customer expense billing status.': [
    'Los reembolsos son independientes del estado de facturación de gastos al cliente.',
    'Os reembolsos são separados do status de faturamento de despesas do cliente.',
  ],
  'Review access is limited to operational time.': [
    'El acceso de revisión se limita al tiempo operativo.',
    'O acesso de revisão é limitado ao tempo operacional.',
  ],
  'Review the local draft before continuing.': [
    'Revisa el borrador local antes de continuar.',
    'Revise o rascunho local antes de continuar.',
  ],
  'Runs queued PDF and Accounting Pack artifact jobs with idempotent output registration.': [
    'Ejecuta trabajos de artefactos PDF y paquetes contables en cola con registro de salidas idempotente.',
    'Executa trabalhos de artefatos PDF e pacotes contábeis na fila com registro idempotente das saídas.',
  ],
  'Set the field date and the shift context for this source record.': [
    'Establece la fecha de campo y el contexto del turno para este registro de origen.',
    'Defina a data de campo e o contexto do turno para este registro de origem.',
  ],
  'The code was not accepted.': ['El código no fue aceptado.', 'O código não foi aceito.'],
  'The secure sign-in service is unavailable. Try again shortly.': [
    'El servicio de acceso seguro no está disponible. Inténtalo de nuevo en breve.',
    'O serviço de login seguro está indisponível. Tente novamente em instantes.',
  ],
  'Too many sign-in attempts. Wait a few minutes before trying again.': [
    'Demasiados intentos de acceso. Espera unos minutos antes de intentarlo de nuevo.',
    'Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.',
  ],
  'This account no longer has access to the workspace. Contact your administrator.': [
    'Esta cuenta ya no tiene acceso al espacio de trabajo. Contacta con tu administrador.',
    'Esta conta não tem mais acesso ao espaço de trabalho. Entre em contato com o administrador.',
  ],
  'This creates a reviewable draft only. Approval, issue, sending and payment remain explicit finance actions and never happen from Print report.':
    [
      'Esto solo crea un borrador revisable. La aprobación, emisión, entrega y pago siguen siendo acciones financieras explícitas y nunca ocurren desde Imprimir informe.',
      'Isso cria apenas um rascunho revisável. Aprovação, emissão, envio e pagamento continuam sendo ações financeiras explícitas e nunca ocorrem a partir de Imprimir relatório.',
    ],
  'This is planning context; actual time remains independently recorded.': [
    'Este es un contexto de planificación; las horas reales siguen registrándose de forma independiente.',
    'Este é um contexto de planejamento; as horas trabalhadas continuam sendo registradas de forma independente.',
  ],
  'This report must be a draft or need changes before it can autosave': [
    'Este informe debe estar en borrador o necesitar cambios antes de poder guardarse automáticamente',
    'Este relatório deve ser um rascunho ou exigir alterações antes de poder ser salvo automaticamente',
  ],
  'This report needs changes before it can be approved.': [
    'Este informe necesita cambios antes de poder aprobarse.',
    'Este relatório precisa de alterações antes de poder ser aprovado.',
  ],
  'This view contains only your own time, reimbursement, and compensation estimate. Client rates, internal cost, margin, and other workers remain restricted.':
    [
      'Esta vista solo contiene tu tiempo, reembolso y estimación de compensación. Las tarifas del cliente, el coste interno, el margen y otros trabajadores siguen restringidos.',
      'Esta visão contém apenas seu tempo, reembolso e estimativa de remuneração. Tarifas do cliente, custo interno, margem e outros colaboradores permanecem restritos.',
    ],
  'Use a password of at least 12 characters. This invitation can be used once.': [
    'Usa una contraseña de al menos 12 caracteres. Esta invitación solo se puede usar una vez.',
    'Use uma senha de pelo menos 12 caracteres. Este convite pode ser usado uma vez.',
  ],
  'Values are recalculated from approved source records, effective client rates, internal cost rules, compensation rules, daily minimums, milestones and expense treatments. Refresh after changing source data.':
    [
      'Los valores se recalculan a partir de registros de origen aprobados, tarifas efectivas del cliente, reglas de coste interno, reglas de compensación, mínimos diarios, hitos y tratamientos de gastos. Actualiza después de cambiar los datos de origen.',
      'Os valores são recalculados a partir de registros de origem aprovados, tarifas efetivas do cliente, regras de custo interno, regras de remuneração, mínimos diários, marcos e tratamentos de despesas. Atualize depois de alterar os dados de origem.',
    ],
  'Your organization requires an authenticator code for this sign-in.': [
    'Tu organización requiere un código de autenticador para este acceso.',
    'Sua organização exige um código autenticador para este login.',
  ],
  'Activating…': ['Activando…', 'Ativando…'],
  'Allowance / per diem': ['Dietas / asignación diaria', 'Ajuda de custo / diária'],
  'Anchor date': ['Fecha ancla', 'Data de referência'],
  Archive: ['Archivar', 'Arquivar'],
  'Archive legal entity': ['Archivar entidad jurídica', 'Arquivar entidade legal'],
  Assign: ['Asignar', 'Atribuir'],
  'BILLABLE VALUE': ['VALOR FACTURABLE', 'VALOR FATURÁVEL'],
  'Base rate multiplier': ['Multiplicador de tarifa base', 'Multiplicador da tarifa base'],
  'COMMERCIAL MODEL': ['MODELO COMERCIAL', 'MODELO COMERCIAL'],
  'Calculation basis': ['Base de cálculo', 'Base de cálculo'],
  'Capped T&M': ['T&M con límite', 'T&M limitado'],
  Captured: ['Capturado', 'Capturado'],
  Changed: ['Modificado', 'Alterado'],
  'Changed:': ['Modificado:', 'Alterado:'],
  Collected: ['Cobrado', 'Recebido'],
  Combined: ['Combinado', 'Combinado'],
  Component: ['Componente', 'Componente'],
  'Connected to J&A': ['Conectado a J&A', 'Conectado à J&A'],
  'Contract number': ['Número de contrato', 'Número do contrato'],
  Controller: ['Controlador', 'Controlador'],
  'Copy previous week layout': [
    'Copiar estructura de la semana anterior',
    'Copiar layout da semana anterior',
  ],
  Correction: ['Corrección', 'Correção'],
  'Corrective actions': ['Acciones correctivas', 'Ações corretivas'],
  Country: ['País', 'País'],
  Credit: ['Crédito', 'Crédito'],
  Custom: ['Personalizado', 'Personalizado'],
  DAILY: ['DIARIO', 'DIÁRIO'],
  Deactivate: ['Desactivar', 'Desativar'],
  Digits: ['Dígitos', 'Dígitos'],
  'Display name': ['Nombre visible', 'Nome de exibição'],
  'Edit / supersede': ['Editar / sustituir', 'Editar / substituir'],
  'Effective from': ['Vigente desde', 'Vigente desde'],
  Email: ['Correo electrónico', 'E-mail'],
  'Ends on': ['Termina el', 'Termina em'],
  English: ['Inglés', 'Inglês'],
  'Estimate only': ['Solo estimación', 'Apenas estimativa'],
  'Every 14 days': ['Cada 14 días', 'A cada 14 dias'],
  'Exact minor units': ['Unidades menores exactas', 'Unidades menores exatas'],
  FROM: ['DESDE', 'DE'],
  'FX rate (basis points)': ['Tipo de cambio (puntos básicos)', 'Taxa de câmbio (pontos-base)'],
  'Fixed addition per hour': ['Suplemento fijo por hora', 'Adicional fixo por hora'],
  'Fixed price · minor units': ['Precio fijo · unidades menores', 'Preço fixo · unidades menores'],
  'Fixed rate': ['Tarifa fija', 'Tarifa fixa'],
  'Generate pack': ['Generar paquete', 'Gerar pacote'],
  'Generate settlement snapshot': [
    'Generar instantánea de liquidación',
    'Gerar instantâneo da liquidação',
  ],
  Gross: ['Bruto', 'Bruto'],
  'HMI / SCADA': ['HMI / SCADA', 'HMI / SCADA'],
  Hotel: ['Alojamiento (hotel)', 'Hospedagem (hotel)'],
  Hourly: ['Por hora', 'Por hora'],
  'Hourly rate (minor units)': [
    'Tarifa por hora (unidades menores)',
    'Tarifa horária (unidades menores)',
  ],
  'INDUSTRIAL AUTOMATION · FIELD SERVICES': [
    'AUTOMATIZACIÓN INDUSTRIAL · SERVICIOS DE CAMPO',
    'AUTOMAÇÃO INDUSTRIAL · SERVIÇOS DE CAMPO',
  ],
  'Informational only': ['Solo informativo', 'Apenas informativo'],
  'Invitation could not be activated.': [
    'No se pudo activar la invitación.',
    'Não foi possível ativar o convite.',
  ],
  'J&A / INVITATION': ['J&A / INVITACIÓN', 'J&A / CONVITE'],
  'Log out': ['Cerrar sesión', 'Sair'],
  'Markup (basis points)': ['Recargo (puntos básicos)', 'Acréscimo (pontos-base)'],
  'Missing rate rules': ['Faltan reglas de tarifas', 'Regras de tarifas ausentes'],
  'My documents': ['Mis documentos', 'Meus documentos'],
  'My pay': ['Mi pago', 'Meu pagamento'],
  Name: ['Nombre', 'Nome'],
  'No audit history recorded.': [
    'No hay historial de auditoría registrado.',
    'Nenhum histórico de auditoria registrado.',
  ],
  'No description was recorded.': [
    'No se registró ninguna descripción.',
    'Nenhuma descrição foi registrada.',
  ],
  'Non-billable': ['No facturable', 'Não faturável'],
  None: ['Ninguno', 'Nenhum'],
  Note: ['Nota', 'Observação'],
  'ONE MORE STEP': ['UN PASO MÁS', 'MAIS UM PASSO'],
  'Operational value': ['Valor operativo', 'Valor operacional'],
  'Overtime multiplier (bps)': [
    'Multiplicador de horas extra (puntos básicos)',
    'Multiplicador de hora extra (pontos-base)',
  ],
  'Owner controls': ['Controles del propietario', 'Controles do proprietário'],
  'PLC platform': ['Plataforma PLC', 'Plataforma PLC'],
  'PO cap (minor)': [
    'Límite de orden de compra (unidades menores)',
    'Limite do pedido de compra (unidades menores)',
  ],
  'PO cap · minor units': [
    'Límite de orden de compra · unidades menores',
    'Limite do pedido de compra · unidades menores',
  ],
  PREVIEW: ['VISTA PREVIA', 'PRÉ-VISUALIZAÇÃO'],
  Passkeys: ['Claves de acceso', 'Chaves de acesso'],
  'Per diem': ['Dieta', 'Diária'],
  Perdiem: ['Dieta', 'Diária'],
  'Vendor (optional)': ['Proveedor (opcional)', 'Fornecedor (opcional)'],
  Portuguese: ['Portugués', 'Português'],
  QTY: ['CANT.', 'QTD.'],
  'REIMB.': ['REEMB.', 'REEMBOLSO'],
  Rate: ['Tarifa', 'Taxa'],
  'Rate (basis points)': ['Tarifa (puntos básicos)', 'Taxa (pontos-base)'],
  'Rate (minor units)': ['Tarifa (unidades menores)', 'Taxa (unidades menores)'],
  'Rate basis': ['Base de tarifa', 'Base da taxa'],
  Reason: ['Motivo', 'Motivo'],
  'Recalculate snapshot': ['Recalcular instantánea', 'Recalcular instantâneo'],
  Receivable: ['Por cobrar', 'A receber'],
  'Received on': ['Recibido el', 'Recebido em'],
  'Recent entries': ['Registros recientes', 'Registros recentes'],
  'Recent expenses': ['Gastos recientes', 'Despesas recentes'],
  'Recipient email': ['Correo del destinatario', 'E-mail do destinatário'],
  Reimbursable: ['Reembolsable', 'Reembolsável'],
  'Reimbursable + markup': ['Reembolsable + recargo', 'Reembolsável + acréscimo'],
  'Rejection reason': ['Motivo del rechazo', 'Motivo da rejeição'],
  Remaining: ['Restante', 'Restante'],
  'Remote support': ['Asistencia remota', 'Suporte remoto'],
  Revoke: ['Revocar', 'Revogar'],
  Role: ['Rol', 'Função'],
  'Rollback plan': ['Plan de reversión', 'Plano de reversão'],
  'Run due jobs': ['Ejecutar trabajos pendientes', 'Executar trabalhos vencidos'],
  SECONDARY: ['SECUNDARIO', 'SECUNDÁRIO'],
  'Settlement status': ['Estado de liquidación', 'Status da liquidação'],
  'Settlement trigger': ['Activador de liquidación', 'Gatilho da liquidação'],
  'Settlement trigger:': ['Activador de liquidación:', 'Gatilho da liquidação:'],
  'Shift summary': ['Resumen del turno', 'Resumo do turno'],
  Shipping: ['Envío', 'Envio'],
  'Site / shift': ['Sitio / turno', 'Local / turno'],
  'Site timezone': ['Zona horaria del sitio', 'Fuso horário do local'],
  'Skip to main content': ['Saltar al contenido principal', 'Ir para o conteúdo principal'],
  'Software version': ['Versión del software', 'Versão do software'],
  'Starts on': ['Comienza el', 'Começa em'],
  Subtotal: ['Subtotal', 'Subtotal'],
  'T&M · daily minimum': ['T&M · mínimo diario', 'T&M · mínimo diário'],
  'Tasks completed': ['Tareas completadas', 'Tarefas concluídas'],
  Tentative: ['Provisional', 'Provisório'],
  Timezone: ['Zona horaria', 'Fuso horário'],
  Tolls: ['Peajes', 'Pedágios'],
  Total: ['Importe total', 'Total geral'],
  'UNAPPROVED WIP': ['WIP NO APROBADO', 'WIP NÃO APROVADO'],
  VERSION: ['VERSIÓN', 'VERSÃO'],
  Verified: ['Verificado', 'Verificado'],
  Void: ['Anular', 'Cancelar'],
  'Week of': ['Semana del', 'Semana de'],
  'Weekend / holiday': ['Fin de semana / festivo', 'Fim de semana / feriado'],
  'Who paid': ['Quién pagó', 'Quem pagou'],
  'Working offline': ['Trabajando sin conexión', 'Trabalhando sem conexão'],
  'e.g. 5500 = 55%': ['p. ej., 5500 = 55%', 'ex.: 5500 = 55%'],
  'e.g. 9200': ['p. ej., 9200', 'ex.: 9200'],
  'h plan': ['h planificadas', 'h planejadas'],
  'minor units': ['unidades menores', 'unidades menores'],
  'no email': ['sin correo electrónico', 'sem e-mail'],
  'reimbursements.': ['reembolsos.', 'reembolsos.'],
  'self-reported': ['autodeclarado', 'autodeclarado'],
  'Finance Admin': ['Administrador financiero', 'Administrador de finanças'],
  Auditor: ['Auditor', 'Auditor'],
  Locked: ['Bloqueado', 'Bloqueado'],
  Suspended: ['Suspendido', 'Suspenso'],
  Offboarded: ['Baja', 'Desactivado'],
  Paused: ['En pausa', 'Em pausa'],
  Closing: ['En cierre', 'Em encerramento'],
  Restore: ['Restaurar', 'Restaurar'],
  'Partially paid': ['Parcialmente pagada', 'Parcialmente paga'],
  Credited: ['Abonado', 'Creditado'],
  Quarantined: ['En cuarentena', 'Em quarentena'],
  Clean: ['Limpio', 'Limpo'],
  'Technical change': ['Cambio técnico', 'Alteração técnica'],
  'Invoice adjustment': ['Ajuste de factura', 'Ajuste de fatura'],
  Settlement: ['Liquidación', 'Liquidação'],
  Reimbursement: ['Reembolso', 'Reembolso'],
  Labor: ['Trabajo', 'Mão de obra'],
  Expense: ['Gasto', 'Despesa'],
  'Issues / decisions': ['Problemas / decisiones', 'Problemas / decisões'],
  Prefix: ['Prefijo', 'Prefixo'],
  'Privacy boundary': ['Límite de privacidad', 'Limite de privacidade'],
  'Problems found': ['Problemas encontrados', 'Problemas encontrados'],
  'Production impact': ['Impacto en producción', 'Impacto em produção'],
  'Needs changes': ['Necesita cambios', 'Precisa de alterações'],
  Final: ['Finalizado', 'Finalizado'],
  Archived: ['Archivado', 'Arquivado'],
  Voided: ['Anulado', 'Cancelado'],
  Closed: ['Cerrado', 'Fechado'],
  Sent: ['Enviado', 'Enviado'],
  Reimbursed: ['Reembolsado', 'Reembolsado'],
  Internal: ['Interno', 'Interno'],
  Parking: ['Aparcamiento', 'Estacionamento'],
  'Rental car': ['Coche de alquiler', 'Carro alugado'],
  'Train / bus / taxi / rideshare': [
    'Tren / autobús / taxi / transporte con app',
    'Trem / ônibus / táxi / transporte por aplicativo',
  ],
  'Phone / data': ['Teléfono / datos', 'Telefone / dados'],
  'Client treatment': ['Tratamiento para cliente', 'Tratamento do cliente'],
  Daily: ['Diario', 'Diário'],
  'Settlements are immutable financial snapshots. Correct a period by creating a new effective rule or reconciliation record; finalized settlements are never deleted.':
    [
      'Las liquidaciones son instantáneas financieras inmutables. Corrige un período creando una nueva regla con fecha de vigencia o un registro de conciliación; las liquidaciones finalizadas nunca se eliminan.',
      'As liquidações são instantâneos financeiros imutáveis. Corrija um período criando uma nova regra com vigência ou um registro de reconciliação; liquidações finalizadas nunca são excluídas.',
    ],
  'Add Client Contact': ['Añadir contacto del cliente', 'Adicionar contato do cliente'],
  'Archive Client': ['Archivar cliente', 'Arquivar cliente'],
  'Archive Legal Entity': ['Archivar entidad jurídica', 'Arquivar entidade legal'],
  'Archive tax profile': ['Archivar perfil fiscal', 'Arquivar perfil fiscal'],
  'Assign Worker': ['Asignar trabajador', 'Atribuir colaborador'],
  'Configure billing stream': [
    'Configurar flujo de facturación',
    'Configurar fluxo de faturamento',
  ],
  'Expected Working Schedule': ['Horario de trabajo previsto', 'Horário de trabalho esperado'],
  'Legal entity': ['Entidad jurídica', 'Entidade legal'],
  'Owner Admin': ['Propietario administrador', 'Administrador proprietário'],
  'Project Manager': ['Responsable del proyecto', 'Gerente do projeto'],
  'Remove Assignment': ['Eliminar asignación', 'Excluir atribuição'],
  'Remove skill': ['Eliminar competencia', 'Excluir competência'],
  'Remove worker skill': [
    'Eliminar competencia del trabajador',
    'Excluir competência do colaborador',
  ],
  'Tax Profile': ['Perfil fiscal', 'Perfil fiscal'],
  Through: ['Hasta', 'Até'],
  'Update Assignment': ['Actualizar asignación', 'Atualizar atribuição'],
  'Update Legal Entity': ['Actualizar entidad jurídica', 'Atualizar entidade legal'],
  'Update Skill': ['Actualizar competencia', 'Atualizar competência'],
  'Update client': ['Actualizar cliente', 'Atualizar cliente'],
  'Update tax profile': ['Actualizar perfil fiscal', 'Atualizar perfil fiscal'],
  billing: ['facturación', 'faturamento'],
  joined: ['incorporación', 'entrada'],
  minutes: ['minutos', 'minutos'],
  packs: ['paquetes', 'pacotes'],
  verified: ['verificado', 'verificado'],
  DESCRIPTION: ['DESCRIPCIÓN', 'DESCRIÇÃO'],
  INVOICE: ['FACTURA', 'FATURA'],
  PROJECT: ['PROYECTO', 'PROJETO'],
  RATE: ['TARIFA', 'TAXA'],
  SOURCE: ['ORIGEN', 'ORIGEM'],
  STREAM: ['FLUJO', 'FLUXO'],
  CATEGORY: ['CATEGORÍA', 'CATEGORIA'],
  'ACTUAL END': ['FIN REAL', 'FIM REAL'],
  'ACTUAL HOURS': ['HORAS REALES', 'HORAS REAIS'],
  'APPROVED UNBILLED WIP': [
    'TRABAJO EN CURSO APROBADO NO FACTURADO',
    'TRABALHO EM ANDAMENTO APROVADO NÃO FATURADO',
  ],
  'Commercial model': ['Modelo comercial', 'Modelo comercial'],
  'PO / REFERENCE': ['OC / REFERENCIA', 'OC / REFERÊNCIA'],
  SAFETY: ['SEGURIDAD', 'SEGURANÇA'],
  TIMEZONE: ['ZONA HORARIA', 'FUSO HORÁRIO'],
  'TRAVEL / EXPENSE': ['VIAJE / GASTO', 'VIAGEM / DESPESA'],
  'Contribution margin': ['Margen de contribución', 'Margem de contribuição'],
  version: ['versión', 'versão'],
  SITE: ['SITIO', 'LOCAL'],
  advanced: ['avanzado', 'avançado'],
  capable: ['capacitado', 'capaz'],
  committed: ['comprometido', 'comprometido'],
  developing: ['en desarrollo', 'em desenvolvimento'],
  events: ['eventos', 'eventos'],
  expert: ['experto', 'especialista'],
  exposure: ['exposición', 'exposição'],
  files: ['archivos', 'arquivos'],
  invoices: ['facturas', 'faturas'],
  matches: ['coincidencias', 'correspondências'],
  new: ['nuevo', 'novo'],
  through: ['a través de', 'por meio de'],
  to: ['a', 'para'],
};

/*
 * Translation coverage is data-driven by explicitCoverageLiterals. The
 * former lexical word maps were intentionally removed so a new literal
 * cannot silently render as mixed-language copy.
 */
const invariantKeys = new Set([
  'Subtotal',
  'Auditor',
  '0.00',
  'en',
  'en-US',
  'es',
  'es-ES',
  'pt',
  'pt-BR',
  'PDF',
  'XLSX',
  'CSV',
  'JSON',
  'MFA',
  'min',
  'SHA-256',
  'TOTP',
  'PLC',
  'HMI',
  'SCADA',
  'FAT',
  'SAT',
  'Rockwell Automation',
  'Europe/Madrid',
  'ControlLogix 5580',
  // Language names and combined technical acronyms are intentional display invariants.
  'Español',
  'Português',
  'Português (BR)',
  'HMI / SCADA',
  'base64url',
  'cache-control',
  'content-length',
  'content-security-policy',
  'cross-origin-opener-policy',
  'ja_offline_identity',
  'permissions-policy',
  'referrer-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-correlation-id',
  'x-frame-options',
  'you@company.com',
]);

export function isCoverageInvariantKey(key: string): boolean {
  return invariantKeys.has(key);
}

/**
 * Action messages are intentionally semantic. The old implementation split
 * camel-case keys and replaced individual English words, which produced text
 * such as “proyectos proyecto actualizado”. These entries use complete phrases
 * and the validation renderer below supplies the small, stable family of
 * validation messages without exposing an English fallback to users.
 */
const actionExact: Record<string, readonly [string, string]> = {
  'action.management.changed': [
    'Este registro cambió. Tus datos siguen en este formulario. Compáralos con el registro actual antes de volver a aplicar tus cambios.',
    'Este registro mudou. Seus dados continuam neste formulário. Compare-os com o registro atual antes de aplicar suas alterações novamente.',
  ],
  'action.management.planningOverlap': [
    'Esta franja coincide con otra asignación. Revisa la planificación del trabajador y elige otra franja.',
    'Este horário coincide com outra atribuição. Revise o planejamento do colaborador e escolha outro horário.',
  ],
  'action.management.workerUnavailable': [
    'El trabajador no está disponible en esta franja. Elige otra franja o revisa su disponibilidad.',
    'O colaborador está indisponível neste horário. Escolha outro horário ou revise a disponibilidade dele.',
  ],
  'action.management.linkedMilestoneInvoice': [
    'Este hito está vinculado a una factura. Abre la factura y revisa sus opciones de corrección antes de cambiar el hito.',
    'Este marco está vinculado a uma fatura. Abra a fatura e revise as opções de correção antes de alterar o marco.',
  ],
  'action.management.finalReport': [
    'Este cambio pertenece a un informe finalizado. Abre el informe y utiliza una corrección versionada.',
    'Esta alteração pertence a um relatório finalizado. Abra o relatório e use uma correção versionada.',
  ],
  'action.management.billingLinked': [
    'Este registro está vinculado a facturación. Gestiona la factura antes de cambiar sus registros de origen.',
    'Este registro está vinculado ao faturamento. Gerencie a fatura antes de alterar os registros de origem.',
  ],
  'action.management.invoiceSource': [
    'Este registro es el origen de una factura. Gestiona primero la factura.',
    'Este registro é a origem de uma fatura. Gerencie a fatura primeiro.',
  ],
  'action.management.correctionHistory': [
    'Este registro pertenece a un historial de correcciones. Utiliza el flujo de corrección.',
    'Este registro pertence a um histórico de correções. Use o fluxo de correção.',
  ],
  'action.management.financialHistory': [
    'Este registro tiene historial financiero. Utiliza una corrección financiera.',
    'Este registro tem histórico financeiro. Use uma correção financeira.',
  ],
  'action.management.periodReport': [
    'Este registro está incluido en un informe de periodo. Gestiona el informe antes de cambiar sus registros de origen.',
    'Este registro está incluído em um relatório de período. Gerencie o relatório antes de alterar os registros de origem.',
  ],
  'action.management.reimbursement': [
    'Este gasto tiene un reembolso. Revierte o ajusta primero el pago.',
    'Esta despesa tem um reembolso. Estorne ou ajuste o pagamento primeiro.',
  ],
  'action.management.classificationHistory': [
    'Este gasto tiene historial de clasificación financiera. Utiliza una corrección financiera.',
    'Esta despesa tem histórico de classificação financeira. Use uma correção financeira.',
  ],
  'action.management.settlement': [
    'Estas horas están incluidas en una liquidación. Ajusta primero la liquidación.',
    'Estas horas estão incluídas em um acerto. Ajuste o acerto primeiro.',
  ],
  'action.management.technicalChanges': [
    'Este informe tiene cambios técnicos. Gestiona primero esos cambios.',
    'Este relatório tem alterações técnicas. Gerencie essas alterações primeiro.',
  ],
  'action.management.committedAttachments': [
    'Este informe tiene adjuntos consolidados. Abre el informe y utiliza una corrección versionada.',
    'Este relatório tem anexos consolidados. Abra o relatório e use uma correção versionada.',
  ],
  'action.management.alreadyDraft': [
    'Este registro ya es un borrador. Abre el registro para editarlo directamente.',
    'Este registro já é um rascunho. Abra o registro para editá-lo diretamente.',
  ],
  'action.management.reason': [
    'Introduce un motivo de corrección de entre 3 y 2000 caracteres.',
    'Informe um motivo de correção com 3 a 2000 caracteres.',
  ],
  'action.management.windowOrder': [
    'El final debe ser posterior al inicio. Cambia la fecha y hora de inicio o fin.',
    'O término deve ser posterior ao início. Altere a data e hora de início ou término.',
  ],
  'action.management.activeWorker': [
    'Selecciona un trabajador o responsable de proyecto activo.',
    'Selecione um colaborador ou gerente de projeto ativo.',
  ],
  'action.management.assignmentWindow': [
    'La asignación al proyecto no cubre esta franja. Elige fechas dentro de la asignación o actualiza primero la asignación.',
    'A atribuição ao projeto não cobre este horário. Escolha datas dentro da atribuição ou atualize a atribuição primeiro.',
  ],
  'action.management.reportProject': [
    'Selecciona un informe técnico del proyecto elegido o cambia el proyecto.',
    'Selecione um relatório técnico do projeto escolhido ou altere o projeto.',
  ],
  'action.management.safetyEvidence': [
    'Este cambio afecta a la seguridad. Completa la validación y la información de reversión antes de guardar.',
    'Esta alteração afeta a segurança. Preencha a validação e as informações de reversão antes de salvar.',
  ],
  'action.management.amount': [
    'Introduce un importe positivo con un máximo de dos decimales.',
    'Informe um valor positivo com no máximo duas casas decimais.',
  ],
  'action.management.plannedMinutes': [
    'Introduce los minutos planificados como un número entero entre 1 y 10080.',
    'Informe os minutos planejados como um número inteiro entre 1 e 10080.',
  ],
  'action.management.projectNotFound': [
    'El proyecto ya no está disponible. Selecciona un proyecto actual.',
    'O projeto não está mais disponível. Selecione um projeto atual.',
  ],
  'action.management.recordNotFound': [
    'El registro ya no está disponible. Vuelve a la lista y selecciona un registro existente.',
    'O registro não está mais disponível. Volte à lista e selecione um registro existente.',
  ],
  'action.management.invalidField': [
    'Revisa {fieldLabel}: completa el campo con un valor válido.',
    'Revise {fieldLabel}: preencha o campo com um valor válido.',
  ],
  'action.access.localAccount.provisioned': [
    'Acceso local al portal creado.',
    'Acesso local ao portal criado.',
  ],
  'action.access.denied': [
    'No tienes permiso para realizar esta acción.',
    'Você não tem permissão para realizar esta ação.',
  ],
  'action.access.mailbox.aliasExists': [
    'Ese alias de correo ya existe en Stalwart.',
    'Esse alias de e-mail já existe no Stalwart.',
  ],
  'action.access.mailbox.created': ['Buzón creado.', 'Caixa de correio criada.'],
  'action.access.mailbox.createdLinkPending': [
    'El buzón se creó en Stalwart, pero falta vincularlo al portal. Repite la misma creación para completar el vínculo; no se creará otro buzón.',
    'A caixa de correio foi criada no Stalwart, mas falta vinculá-la ao portal. Repita a mesma criação para concluir o vínculo; outra caixa não será criada.',
  ],
  'action.access.mailbox.destroyed': ['Buzón eliminado.', 'Caixa de correio excluída.'],
  'action.access.mailbox.identityCollision': [
    'Este buzón entra en conflicto con una identidad existente del portal y no se vinculó.',
    'Esta caixa de correio entra em conflito com uma identidade existente do portal e não foi vinculada.',
  ],
  'action.access.mailbox.invalidAlias': [
    'Usa un alias de 2 a 64 letras minúsculas, números, puntos, guiones bajos o guiones.',
    'Use um alias de 2 a 64 letras minúsculas, números, pontos, sublinhados ou hífens.',
  ],
  'action.access.mailbox.invalidPassword': [
    'Usa una contraseña de 12 a 128 caracteres sin saltos de línea.',
    'Use uma senha de 12 a 128 caracteres sem quebras de linha.',
  ],
  'action.access.mailbox.invalidQuota': [
    'Introduce una cuota de buzón válida.',
    'Informe uma cota de caixa de correio válida.',
  ],
  'action.access.mailbox.passwordUpdated': [
    'Contraseña de Webmail actualizada.',
    'Senha do Webmail atualizada.',
  ],
  'action.access.mailbox.passwordRejected': [
    'Stalwart rechazó la contraseña. Usa una contraseña única y fuerte de al menos 16 caracteres.',
    'O Stalwart rejeitou a senha. Use uma senha exclusiva e forte com pelo menos 16 caracteres.',
  ],
  'action.access.mailbox.permissionDenied': [
    'La clave de servicio del portal no puede crear esta cuenta de Stalwart o conceder sus permisos de buzón.',
    'A chave de serviço do portal não pode criar esta conta do Stalwart ou conceder suas permissões de caixa de correio.',
  ],
  'action.access.mailbox.rejected': [
    'Stalwart rechazó la creación de la cuenta.',
    'O Stalwart rejeitou a criação da conta.',
  ],
  'action.access.mailbox.relinkRequired': [
    'Este correo estaba vinculado a otra cuenta de Stalwart. Se necesita una revinculación explícita.',
    'Este e-mail estava vinculado a outra conta do Stalwart. É necessária uma revinculação explícita.',
  ],
  'action.access.mailbox.userInactive': [
    'Ya existe un usuario archivado con este correo. Restáuralo explícitamente antes de vincular el buzón.',
    'Já existe um usuário arquivado com este e-mail. Restaure-o explicitamente antes de vincular a caixa.',
  ],
  'action.access.mailboxes.provisioned': [
    'Buzones incorporados al portal.',
    'Caixas de correio provisionadas no portal.',
  ],
  'action.validation.localProvision': [
    'Revisa los datos de acceso local y el proveedor seleccionado.',
    'Revise os dados de acesso local e o fornecedor selecionado.',
  ],
  'action.access.accountStatus.updated': [
    'Estado de la cuenta actualizado.',
    'Status da conta atualizado.',
  ],
  'action.access.invitation.created': ['Invitación creada.', 'Convite criado.'],
  'action.access.workerProfile.updated': [
    'Perfil del trabajador actualizado.',
    'Perfil do colaborador atualizado.',
  ],
  'action.approval.decisionRecorded': [
    'Decisión de aprobación registrada.',
    'Decisão de aprovação registrada.',
  ],
  'action.approval.financeReviewRecorded': [
    'Revisión financiera registrada.',
    'Revisão financeira registrada.',
  ],
  'action.approval.expenseClassificationRequired': [
    'Clasifica este gasto en Finanzas antes de registrar la revisión financiera.',
    'Classifique esta despesa em Finanças antes de registrar a revisão financeira.',
  ],
  'action.finance.projectIssuingAuthorityRequired': [
    'Configura una entidad emisora del proyecto válida en la fecha de este gasto antes de clasificarlo.',
    'Configure uma entidade emissora do projeto válida na data desta despesa antes de classificá-la.',
  ],
  'action.approvals.milestoneReviewRecorded': [
    'Revisión del hito registrada.',
    'Revisão do marco registrada.',
  ],
  'action.approvals.reportReviewRecorded': [
    'Revisión del informe registrada.',
    'Revisão do relatório registrada.',
  ],
  'action.approvals.technicalChangeReviewRecorded': [
    'Revisión del cambio técnico registrada.',
    'Revisão da alteração técnica registrada.',
  ],
  'action.error.invalid': ['Los datos no son válidos.', 'Os dados são inválidos.'],
  'action.error.forbidden': [
    'No tienes permiso para realizar esta acción.',
    'Você não tem permissão para realizar esta ação.',
  ],
  'action.error.unauthenticated': [
    'Vuelve a iniciar sesión para continuar.',
    'Entre novamente para continuar.',
  ],
  'action.error.conflict': [
    'La acción entra en conflicto con el estado actual del registro.',
    'A ação entra em conflito com o estado atual do registro.',
  ],
  'action.error.unavailable': [
    'La acción no se pudo completar. Inténtalo de nuevo.',
    'Não foi possível concluir a ação. Tente novamente.',
  ],
  'action.error.financeRoleRequired': [
    'Se requiere el rol de Finanzas.',
    'É necessária a função de Finanças.',
  ],
  'action.error.reportEditAccess': [
    'Se requiere acceso de edición del informe.',
    'É necessário acesso para editar o relatório.',
  ],
  'action.billing.accountingPackFinalized': [
    'Paquete contable finalizado.',
    'Pacote contábil finalizado.',
  ],
  'action.billing.invoiceAdjustmentCreated': [
    'Borrador de ajuste de factura creado.',
    'Rascunho de ajuste da fatura criado.',
  ],
  'action.billing.invoiceAlreadySent': [
    'La factura ya está marcada como enviada.',
    'A fatura já está marcada como enviada.',
  ],
  'action.billing.invoiceApproved': ['Factura aprobada.', 'Fatura aprovada.'],
  'action.billing.invoiceRecalculated': [
    'Factura recalculada como borrador. Revísala y apruébala de nuevo.',
    'Fatura recalculada como rascunho. Revise-a e aprove-a novamente.',
  ],
  'action.billing.invoiceDeleted': ['Factura eliminada.', 'Fatura excluída.'],
  'action.billing.invoiceDraftCreated': [
    'Borrador de factura creado.',
    'Rascunho de fatura criado.',
  ],
  'action.billing.invoiceDraftCreatedForPeriod': [
    'Borrador de factura creado para {periodStart} → {periodEnd}, el último período completo con trabajo facturable aprobado.',
    'Rascunho de fatura criado para {periodStart} → {periodEnd}, o último período completo com trabalho faturável aprovado.',
  ],
  'action.billing.invoiceDraftExisting': [
    'Ya existe un borrador de factura.',
    'Já existe um rascunho de fatura.',
  ],
  'action.billing.invoiceAlreadyExists': [
    'Ya existe una factura para este flujo y periodo. Ábrela para revisar su estado.',
    'Já existe uma fatura para este fluxo e período. Abra-a para revisar seu estado.',
  ],
  'action.billing.creditNoteStateRestored': [
    'Estado de emisión de la nota de crédito restaurado.',
    'Estado de emissão da nota de crédito restaurado.',
  ],
  'action.billing.invoiceDraftExistingForPeriod': [
    'Se devolvió el borrador existente para {periodStart} → {periodEnd}.',
    'O rascunho existente foi devolvido para {periodStart} → {periodEnd}.',
  ],
  'action.billing.invoiceIssued': ['Factura emitida.', 'Fatura emitida.'],
  'action.billing.invoiceNumberPolicySaved': [
    'Política de numeración de facturas guardada.',
    'Política de numeração de faturas salva.',
  ],
  'action.billing.invoiceSent': [
    'Factura marcada como enviada manualmente.',
    'Fatura marcada como enviada manualmente.',
  ],
  'action.billing.invoiceUpdated': ['Factura actualizada.', 'Fatura atualizada.'],
  'action.billing.invoiceVoided': [
    'Factura anulada y registrada en la auditoría.',
    'Fatura anulada e registrada na auditoria.',
  ],
  'action.billing.jobsProcessed': [
    'Trabajos de facturación procesados.',
    'Tarefas de faturamento processadas.',
  ],
  'action.billing.legalEntityArchived': [
    'Entidad jurídica archivada.',
    'Entidade legal arquivada.',
  ],
  'action.billing.legalEntitySaved': ['Entidad jurídica guardada.', 'Entidade legal salva.'],
  'action.billing.legalEntityUpdated': [
    'Entidad jurídica actualizada.',
    'Entidade legal atualizada.',
  ],
  'action.billing.paymentRecorded': ['Pago registrado.', 'Pagamento registrado.'],
  'action.billing.paymentReversed': [
    'Reversión del pago registrada.',
    'Estorno do pagamento registrado.',
  ],
  'action.billing.periodClosed': [
    'Período de facturación cerrado.',
    'Período de faturamento fechado.',
  ],
  'action.billing.ruleArchived': [
    'Regla de facturación archivada.',
    'Regra de faturamento arquivada.',
  ],
  'action.billing.ruleUpdated': [
    'Regla de facturación actualizada.',
    'Regra de faturamento atualizada.',
  ],
  'action.billing.streamSaved': ['Flujo de facturación guardado.', 'Fluxo de faturamento salvo.'],
  'action.billing.taxProfileArchived': ['Perfil fiscal archivado.', 'Perfil fiscal arquivado.'],
  'action.billing.taxProfileSaved': ['Perfil fiscal guardado.', 'Perfil fiscal salvo.'],
  'action.billing.taxProfileUpdated': ['Perfil fiscal actualizado.', 'Perfil fiscal atualizado.'],
  'action.billing.readiness.noBillableSources': [
    'El período seleccionado no tiene horas ni gastos facturables aprobados. Revisa sus registros pendientes o elige otro período explícitamente; la aplicación no cambiará las fechas por ti.',
    'O período selecionado não tem horas nem despesas faturáveis aprovadas. Revise os registros pendentes ou escolha outro período explicitamente; o aplicativo não mudará as datas por você.',
  ],
  'action.billing.readiness.periodCutoffMismatch': [
    'Las fechas no coinciden con la cadencia de este flujo (por ejemplo, semanal es lunes a domingo). Elige el período correcto; la aplicación no lo sustituirá automáticamente.',
    'As datas não coincidem com a cadência deste fluxo (por exemplo, semanal é segunda a domingo). Escolha o período correto; o aplicativo não o substituirá automaticamente.',
  ],
  'action.billing.readiness.pendingTimeApproval': [
    'Hay registros de horas de este período pendientes de aprobación. Apruébalos o recházalos en Aprobaciones y vuelve a crear el borrador.',
    'Há registros de horas deste período pendentes de aprovação. Aprove ou rejeite-os em Aprovações e crie o rascunho novamente.',
  ],
  'action.billing.readiness.pendingExpenseApproval': [
    'Hay gastos de este período pendientes de aprobación operativa o revisión financiera. Complétalas en Aprobaciones → Revisión financiera y vuelve a crear el borrador.',
    'Há despesas deste período pendentes de aprovação operacional ou revisão financeira. Conclua as etapas em Aprovações → Revisão financeira e crie o rascunho novamente.',
  ],
  'action.billing.readiness.missingTaxProfile': [
    'Este flujo de facturación no tiene perfil fiscal. Añádelo en Configuración financiera y vuelve a crear el borrador.',
    'Este fluxo de faturamento não tem perfil fiscal. Adicione-o em Configuração financeira e crie o rascunho novamente.',
  ],
  'action.billing.readiness.inactiveTaxProfile': [
    'El perfil fiscal de este flujo no está activo. Actívalo o asígnale uno activo en Configuración financiera.',
    'O perfil fiscal deste fluxo não está ativo. Ative-o ou atribua um ativo em Configuração financeira.',
  ],
  'action.billing.readiness.missingLegalEntity': [
    'Este flujo de facturación no tiene entidad jurídica. Asígnale una en Configuración financiera.',
    'Este fluxo de faturamento não tem entidade legal. Atribua uma em Configuração financeira.',
  ],
  'action.billing.readiness.archivedLegalEntity': [
    'La entidad jurídica de este flujo está archivada. Restaúrala o asígnale una activa en Configuración financiera.',
    'A entidade legal deste fluxo está arquivada. Restaure-a ou atribua uma ativa em Configuração financeira.',
  ],
  'action.billing.readiness.legalEntityCurrencyMismatch': [
    'La moneda de la entidad jurídica no coincide con la del flujo. Corrígela en Configuración financiera.',
    'A moeda da entidade legal não coincide com a do fluxo. Corrija em Configuração financeira.',
  ],
  'action.billing.readiness.taxProfileCurrencyMismatch': [
    'La moneda del perfil fiscal no coincide con la del flujo. Corrígela en Configuración financiera.',
    'A moeda do perfil fiscal não coincide com a do fluxo. Corrija em Configuração financeira.',
  ],
  'action.billing.readiness.taxProfileLegalEntityMismatch': [
    'El perfil fiscal no pertenece a la entidad jurídica de este flujo. Reasígnalo en Configuración financiera.',
    'O perfil fiscal não pertence à entidade legal deste fluxo. Reatribua em Configuração financeira.',
  ],
  'action.billing.readiness.invalidPeriod': [
    'La fecha de fin es anterior a la de inicio. Elige un período válido.',
    'A data final é anterior à de início. Escolha um período válido.',
  ],
  'action.billing.readiness.invalidPeriodConfiguration': [
    'La cadencia de este flujo no puede calcular el período. Revisa la fecha de ancla o el día de corte en el flujo de facturación.',
    'A cadência deste fluxo não consegue calcular o período. Revise a data âncora ou o dia de corte no fluxo de faturamento.',
  ],
  'action.billing.readiness.missingFixedPrice': [
    'Este flujo de mano de obra con todo incluido no tiene precio fijo. Configúralo en el proyecto o en el flujo de facturación.',
    'Este fluxo de mão de obra com tudo incluído não tem preço fixo. Configure-o no projeto ou no fluxo de faturamento.',
  ],
  'action.billing.readiness.capExhausted': [
    'El tope de pedido de este proyecto ya se consumió. Ajusta el tope o factura otro flujo.',
    'O teto do pedido deste projeto já foi consumido. Ajuste o teto ou fatura outro fluxo.',
  ],
  'action.billing.readiness.missingClientRate': [
    'Hay horas aprobadas sin tarifa de cliente. Añade la tarifa laboral del cliente en Finanzas y vuelve a crear el borrador.',
    'Há horas aprovadas sem tarifa do cliente. Adicione a tarifa de mão de obra do cliente em Finanças e crie o rascunho novamente.',
  ],
  'action.billing.readiness.missingExpenseCurrencyConversion': [
    'Hay gastos en otra moneda sin conversión a la de facturación. Completa la conversión en Finanzas.',
    'Há despesas em outra moeda sem conversão para a de faturamento. Conclua a conversão em Finanças.',
  ],
  'action.billing.readiness.missingExpenseFinanceProjection': [
    'Hay gastos clasificados sin proyección financiera. Completa la clasificación comercial en Finanzas.',
    'Há despesas classificadas sem projeção financeira. Conclua a classificação comercial em Finanças.',
  ],
  'action.billing.readiness.customerSignoffRequired': [
    'Falta la conformidad del cliente para este período. Captúrala en el informe periódico del proyecto y vuelve a emitir.',
    'Falta a conformidade do cliente para este período. Capture-a no relatório periódico do projeto e emita novamente.',
  ],
  'action.billing.readiness.canonicalLegalEntityRevisionRequired': [
    'Este proyecto no tiene una revisión de entidad jurídica revisada para emitir. Asígnela en Configuración financiera.',
    'Este projeto não tem uma revisão de entidade legal revisada para emitir. Atribua-a em Configuração financeira.',
  ],
  'action.billing.readiness.missingInvoiceNumberPolicy': [
    'Falta la política de numeración de facturas aprobada. Configúrala en Facturación antes de emitir.',
    'Falta a política de numeração de faturas aprovada. Configure-a em Faturamento antes de emitir.',
  ],
  'action.billing.readiness.inactiveBillingConfiguration': [
    'El flujo de facturación o su configuración legal/fiscal no está activo. Revísalo en Configuración financiera.',
    'O fluxo de faturamento ou a configuração legal/fiscal não está ativo. Revise em Configuração financeira.',
  ],
  'action.billing.readiness.staleBillingConfiguration': [
    'La configuración de facturación o los registros de origen cambiaron. Revisa las condiciones vigentes; si la factura ya está aprobada, usa «Recalcular y revisar borrador» y vuelve a aprobarla.',
    'A configuração de faturamento ou os registros de origem mudaram. Revise as condições atuais; se a fatura já foi aprovada, use «Recalcular e revisar rascunho» e aprove-a novamente.',
  ],
  'action.conflict.billingPeriodIncomplete': [
    'Este período de facturación no está listo para un borrador. Revisa las causas abajo y corrígelas en Aprobaciones o Configuración financiera.',
    'Este período de faturamento não está pronto para um rascunho. Revise as causas abaixo e corrija-as em Aprovações ou Configuração financeira.',
  ],
  'action.conflict.reportNotEditable': [
    'El informe no se puede editar.',
    'O relatório não pode ser editado.',
  ],
  'action.documents.deleted': ['Documento eliminado.', 'Documento excluído.'],
  'action.documents.archived': ['Documento archivado.', 'Documento arquivado.'],
  'action.validation.documentArchive': [
    'Escribe un motivo de archivo de 3 a 500 caracteres.',
    'Informe um motivo de arquivamento de 3 a 500 caracteres.',
  ],
  'action.documents.uploaded': ['Documento cargado.', 'Documento enviado.'],
  'action.expense.draftSaved': ['Borrador de gasto guardado.', 'Rascunho de despesa salvo.'],
  'action.expense.removedOrVoided': [
    'Registro de gasto eliminado o anulado.',
    'Registro de despesa excluído ou anulado.',
  ],
  'action.expense.submitted': ['Gasto enviado.', 'Despesa enviada.'],
  'action.finance.assignmentRateOverrideSaved': [
    'Excepción de tarifa de asignación guardada.',
    'Substituição da tarifa da atribuição salva.',
  ],
  'action.finance.clientLaborRateDeactivated': [
    'Tarifa laboral del cliente desactivada.',
    'Taxa de mão de obra do cliente desativada.',
  ],
  'action.finance.clientLaborRateSaved': [
    'Tarifa laboral del cliente guardada.',
    'Taxa de mão de obra do cliente salva.',
  ],
  'action.finance.clientLaborRateSuperseded': [
    'Tarifa laboral del cliente sustituida.',
    'Taxa de mão de obra do cliente substituída.',
  ],
  'action.finance.compensationRuleDeactivated': [
    'Regla de compensación desactivada.',
    'Regra de remuneração desativada.',
  ],
  'action.finance.compensationRuleSaved': [
    'Regla de compensación guardada.',
    'Regra de remuneração salva.',
  ],
  'action.finance.compensationRuleSuperseded': [
    'Regla de compensación sustituida.',
    'Regra de remuneração substituída.',
  ],
  'action.finance.compensationSettled': ['Compensación liquidada.', 'Remuneração liquidada.'],
  'action.finance.internalCostRuleDeactivated': [
    'Regla de coste interno desactivada.',
    'Regra de custo interno desativada.',
  ],
  'action.finance.internalCostRuleSaved': [
    'Regla de coste interno guardada.',
    'Regra de custo interno salva.',
  ],
  'action.finance.internalCostRuleSuperseded': [
    'Regla de coste interno sustituida.',
    'Regra de custo interno substituída.',
  ],
  'action.finance.projectLegalEntityAssigned': [
    'Autoridad emisora del proyecto guardada.',
    'Autoridade emissora do projeto salva.',
  ],
  'action.validation.projectLegalEntityAssignment': [
    'La asignación de la autoridad emisora del proyecto no es válida.',
    'A atribuição da autoridade emissora do projeto é inválida.',
  ],
  'action.validation.invalid': ['Revisa los datos enviados.', 'Revise os dados enviados.'],
  'action.validation.invalidForm': [
    'Revisa los campos del formulario.',
    'Revise os campos do formulário.',
  ],
  'action.validation.invoiceIdRequired': [
    'Se requiere el identificador de la factura.',
    'O identificador da fatura é obrigatório.',
  ],
  'action.validation.missingEmails': [
    'Añade al menos una dirección de correo.',
    'Adicione pelo menos um endereço de e-mail.',
  ],
  'action.validation.missingUsername': ['Añade un alias de cuenta.', 'Adicione um alias de conta.'],
  'action.finance.reimbursementRecorded': ['Reembolso registrado.', 'Reembolso registrado.'],
  'action.navigation.wrongSection': ['Sección incorrecta.', 'Seção incorreta.'],
  'action.notifications.markedRead': [
    'Notificación marcada como leída.',
    'Notificação marcada como lida.',
  ],
  'action.planning.assignmentPublished': ['Asignación publicada.', 'Atribuição publicada.'],
  'action.planning.assignmentUpdated': ['Asignación actualizada.', 'Atribuição atualizada.'],
  'action.planning.assignmentCancelled': ['Asignación cancelada.', 'Atribuição cancelada.'],
  'action.planning.workerNotAssigned': [
    'El trabajador no está asignado a este proyecto durante todo el turno. Revisa las fechas o asígnalo al proyecto.',
    'O trabalhador não está atribuído a este projeto durante todo o turno. Revise as datas ou atribua-o ao projeto.',
  ],
  'action.planning.workerOverlap': [
    'El trabajador ya tiene otro turno que se solapa con este horario.',
    'O trabalhador já tem outro turno que se sobrepõe a este horário.',
  ],
  'action.planning.workerUnavailable': [
    'El trabajador figura como no disponible durante este turno.',
    'O trabalhador está indisponível durante este turno.',
  ],
  'action.planning.invalidWindow': [
    'La fecha y hora de fin deben ser posteriores al inicio.',
    'A data e hora de fim devem ser posteriores ao início.',
  ],
  'action.planning.invalidMinutes': [
    'Introduce minutos planificados válidos para el turno.',
    'Informe minutos planejados válidos para o turno.',
  ],
  'action.planning.changed': [
    'Esta asignación cambió mientras la editabas. Recarga y vuelve a revisar sus datos.',
    'Esta atribuição mudou enquanto você a editava. Recarregue e revise os dados.',
  ],
  'action.planning.alreadyCancelled': [
    'Esta asignación ya está cancelada.',
    'Esta atribuição já foi cancelada.',
  ],
  'action.planning.assignmentNotFound': [
    'No se encontró la asignación en tu ámbito de acceso.',
    'A atribuição não foi encontrada no seu escopo de acesso.',
  ],
  'action.planning.projectUnavailable': [
    'Este proyecto no admite nuevos turnos en su estado actual.',
    'Este projeto não aceita novos turnos em seu estado atual.',
  ],
  'action.planning.availabilitySaved': ['Disponibilidad guardada.', 'Disponibilidade salva.'],
  'action.planning.skillDeleted': ['Especialidad eliminada.', 'Especialidade excluída.'],
  'action.planning.skillSaved': ['Especialidad guardada.', 'Especialidade salva.'],
  'action.planning.skillUpdated': ['Especialidad actualizada.', 'Especialidade atualizada.'],
  'action.planning.workerSkillDeleted': [
    'Especialidad del trabajador eliminada.',
    'Especialidade do trabalhador excluída.',
  ],
  'action.planning.workerSkillUpdated': [
    'Especialidad del trabajador actualizada.',
    'Especialidade do trabalhador atualizada.',
  ],
  'action.projects.assignmentCreated': ['Asignación creada.', 'Atribuição criada.'],
  'action.projects.assignmentDeleted': ['Asignación eliminada.', 'Atribuição excluída.'],
  'action.projects.assignmentUpdated': ['Asignación actualizada.', 'Atribuição atualizada.'],
  'action.projects.clientArchived': ['Cliente archivado.', 'Cliente arquivado.'],
  'action.projects.clientContactDeleted': [
    'Contacto del cliente eliminado.',
    'Contato do cliente excluído.',
  ],
  'action.projects.clientContactSaved': [
    'Contacto del cliente guardado.',
    'Contato do cliente salvo.',
  ],
  'action.projects.clientContactUpdated': [
    'Contacto del cliente actualizado.',
    'Contato do cliente atualizado.',
  ],
  'action.projects.clientCreated': ['Cliente creado.', 'Cliente criado.'],
  'action.projects.clientUpdated': ['Cliente actualizado.', 'Cliente atualizado.'],
  'action.projects.milestoneDraftSaved': ['Borrador de hito guardado.', 'Rascunho de marco salvo.'],
  'action.projects.milestoneSubmitted': ['Hito enviado.', 'Marco enviado.'],
  'action.projects.projectCreated': ['Proyecto creado.', 'Projeto criado.'],
  'action.projects.clientDeleted': ['Cliente eliminado.', 'Cliente excluído.'],
  'action.projects.projectDeleted': ['Proyecto eliminado.', 'Projeto excluído.'],
  'action.projects.projectUpdated': ['Proyecto actualizado.', 'Projeto atualizado.'],
  'action.projects.scheduleSaved': ['Calendario guardado.', 'Cronograma salvo.'],
  'action.reports.autosaved': [
    'Informe guardado automáticamente.',
    'Relatório salvo automaticamente.',
  ],
  'action.reports.correctionDraftCreated': [
    'Borrador de corrección creado.',
    'Rascunho de correção criado.',
  ],
  'action.reports.correctionDraftWithdrawn': [
    'Borrador de corrección retirado. Ya puedes crear uno nuevo.',
    'Rascunho de correção retirado. Já pode criar um novo.',
  ],
  'action.reports.changesSaved': [
    'Cambios guardados. Envía el informe para revisión cuando esté listo.',
    'Alterações salvas. Envie o relatório para revisão quando estiver pronto.',
  ],
  'action.validation.correctionDraft': [
    'Revisa los campos corregidos y cambia al menos un dato operativo.',
    'Revise os campos corrigidos e altere pelo menos um dado operacional.',
  ],
  'action.reports.dailyDraftSaved': [
    'Borrador de informe diario guardado.',
    'Rascunho de relatório diário salvo.',
  ],
  'action.reports.draftDeleted': [
    'Borrador de informe eliminado.',
    'Rascunho de relatório excluído.',
  ],
  'action.reports.periodReportAlreadyApproved': [
    'El informe del período ya está aprobado.',
    'O relatório do período já está aprovado.',
  ],
  'action.reports.periodReportApproved': [
    'Informe del período aprobado.',
    'Relatório do período aprovado.',
  ],
  'action.reports.periodReportsRefreshed': [
    'Informes del período actualizados.',
    'Relatórios do período atualizados.',
  ],
  'action.reports.customerSignoffInvalidated': [
    'Conformidad del cliente invalidada.',
    'Conformidade do cliente invalidada.',
  ],
  'action.reports.customerSignoffRecorded': [
    'Conformidad del cliente registrada.',
    'Conformidade do cliente registrada.',
  ],
  'action.reports.customerSignoffEvidenceAttached': [
    'Evidencia de copia firmada adjuntada a la conformidad histórica.',
    'Evidência de cópia assinada anexada à conformidade histórica.',
  ],
  'action.validation.periodReportApproval': [
    'Se requiere una vinculación válida con la instantánea del informe del período.',
    'É necessário um vínculo válido com o instantâneo do relatório do período.',
  ],
  'action.validation.customerSignoff': [
    'Completa los datos de conformidad del cliente.',
    'Preencha os dados de conformidade do cliente.',
  ],
  'action.validation.customerSignoffInvalidation': [
    'Indica la conformidad y el motivo de invalidación.',
    'Informe a conformidade e o motivo da invalidação.',
  ],
  'action.reports.submitted': ['Informe enviado para revisión.', 'Relatório enviado para revisão.'],
  'action.reports.technicalChangeDraftSaved': [
    'Borrador de cambio técnico guardado.',
    'Rascunho de alteração técnica salvo.',
  ],
  'action.reports.technicalChangeSubmitted': [
    'Cambio técnico enviado para revisión.',
    'Alteração técnica enviada para revisão.',
  ],
  'action.reports.technicalDraftSaved': [
    'Borrador de informe PLC guardado.',
    'Rascunho de relatório PLC salvo.',
  ],
  'action.time.draftSaved': ['Borrador de horas guardado.', 'Rascunho de horas salvo.'],
  'action.time.batchDraftsSaved': [
    '{count} borradores diarios de horas guardados.',
    '{count} rascunhos diários de horas salvos.',
  ],
  'action.time.expenseDraftsSaved': [
    'Borradores de horas y gasto guardados.',
    'Rascunhos de horas e despesa salvos.',
  ],
  'action.time.draftUpdated': ['Borrador de horas actualizado.', 'Rascunho de horas atualizado.'],
  'action.time.layoutCopied': ['Estructura de tiempo copiada.', 'Layout de tempo copiado.'],
  'action.time.removedOrVoided': [
    'Registro de horas eliminado o anulado.',
    'Registro de horas excluído ou anulado.',
  ],
  'action.time.submitted': ['Registro de horas enviado.', 'Registro de horas enviado.'],
  'action.time.weekSubmitted': [
    '{timeSubmitted} registros de horas y {mealsSubmitted} gastos de comidas enviados para revisión.',
    '{timeSubmitted} registros de horas e {mealsSubmitted} despesas com refeições enviados para revisão.',
  ],
};

const validationEntities: Record<string, readonly [string, string]> = {
  accountStatus: ['el estado de la cuenta', 'o status da conta'],
  accountingPeriod: ['el período contable', 'o período contábil'],
  approvalDecision: ['la decisión de aprobación', 'a decisão de aprovação'],
  assignmentFields: ['la asignación', 'a atribuição'],
  assignmentIdRequired: ['la asignación', 'a atribuição'],
  assignmentOverride: ['la excepción de tarifa', 'a substituição da tarifa'],
  availabilityFields: ['la disponibilidad', 'a disponibilidade'],
  billingPeriod: ['el período de facturación', 'o período de faturamento'],
  billingRuleIdRequired: ['la regla de facturación', 'a regra de faturamento'],
  billingStream: ['el flujo de facturación', 'o fluxo de faturamento'],
  clientFields: ['el cliente', 'o cliente'],
  clientIdRequired: ['el cliente', 'o cliente'],
  clientLaborRate: ['la tarifa laboral del cliente', 'a taxa de mão de obra do cliente'],
  clientLaborRateId: ['la tarifa laboral del cliente', 'a taxa de mão de obra do cliente'],
  compensationRule: ['la regla de compensación', 'a regra de remuneração'],
  compensationRuleId: ['la regla de compensación', 'a regra de remuneração'],
  contactFields: ['el contacto', 'o contato'],
  contactIdRequired: ['el contacto', 'o contato'],
  correctionDraft: ['el borrador de corrección', 'o rascunho de correção'],
  dailyReportFields: ['el informe diario', 'o relatório diário'],
  documentContent: ['el documento', 'o documento'],
  documentIdRequired: ['el documento', 'o documento'],
  documentMetadata: ['los metadatos del documento', 'os metadados do documento'],
  documentPath: ['el documento', 'o documento'],
  documentRequired: ['el documento', 'o documento'],
  documentSensitivity: ['la sensibilidad del documento', 'a sensibilidade do documento'],
  documentTypeOrSize: ['el documento', 'o documento'],
  draftDelete: ['la eliminación del borrador', 'a exclusão do rascunho'],
  expenseFields: ['el gasto', 'a despesa'],
  expenseRecord: ['el registro de gasto', 'o registro de despesa'],
  financeDecision: ['la decisión financiera', 'a decisão financeira'],
  fixedAmount: ['el importe fijo', 'o valor fixo'],
  internalCostRule: ['la regla de coste interno', 'a regra de custo interno'],
  internalCostRuleId: ['la regla de coste interno', 'a regra de custo interno'],
  invitation: ['la invitación', 'o convite'],
  invoice: ['la factura', 'a fatura'],
  invoiceAdjustment: ['el ajuste de factura', 'o ajuste da fatura'],
  invoiceNumberPolicyFields: ['la política de numeración', 'a política de numeração'],
  invoiceSend: ['el envío de la factura', 'o envio da fatura'],
  invoiceVoid: ['la anulación de la factura', 'a anulação da fatura'],
  legalEntityFields: ['la entidad jurídica', 'a entidade legal'],
  legalEntityIdRequired: ['la entidad jurídica', 'a entidade legal'],
  lifecycleFields: ['el cambio de estado', 'a mudança de estado'],
  milestoneDecision: ['la decisión del hito', 'a decisão do marco'],
  milestoneDecisionType: ['el tipo de decisión', 'o tipo de decisão'],
  milestoneFields: ['el hito', 'o marco'],
  milestoneRecord: ['el registro del hito', 'o registro do marco'],
  notificationIdRequired: ['la notificación', 'a notificação'],
  payment: ['el pago', 'o pagamento'],
  planningFields: ['la planificación', 'o planejamento'],
  projectFields: ['el proyecto', 'o projeto'],
  projectIdRequired: ['el proyecto', 'o projeto'],
  projectReportingPeriod: [
    'el período de informes del proyecto',
    'o período de relatórios do projeto',
  ],
  receiptContent: ['el recibo', 'o recibo'],
  receiptPath: ['el recibo', 'o recibo'],
  receiptTypeOrSize: ['el recibo', 'o recibo'],
  reimbursement: ['el reembolso', 'o reembolso'],
  replacementClientLaborRate: ['la tarifa laboral sustituta', 'a taxa de mão de obra substituta'],
  replacementCompensationRule: [
    'la regla de compensación sustituta',
    'a regra de remuneração substituta',
  ],
  replacementInternalCostRule: [
    'la regla de coste interno sustituta',
    'a regra de custo interno substituta',
  ],
  report: ['el informe', 'o relatório'],
  reportAutosaveRequest: [
    'la solicitud de guardado automático',
    'a solicitação de salvamento automático',
  ],
  reportDecision: ['la decisión del informe', 'a decisão do relatório'],
  scheduleFields: ['el calendario', 'o cronograma'],
  settlementPeriod: ['el período de liquidación', 'o período de liquidação'],
  skillFields: ['la especialidad', 'a especialidade'],
  skillIdRequired: ['la especialidad', 'a especialidade'],
  taxProfileFields: ['el perfil fiscal', 'o perfil fiscal'],
  taxProfileIdRequired: ['el perfil fiscal', 'o perfil fiscal'],
  technicalChange: ['el cambio técnico', 'a alteração técnica'],
  technicalChangeDecision: ['la decisión del cambio técnico', 'a decisão da alteração técnica'],
  technicalChangeFields: ['el cambio técnico', 'a alteração técnica'],
  technicalReportFields: ['el informe técnico', 'o relatório técnico'],
  timeFields: ['el registro de horas', 'o registro de horas'],
  timeRecord: ['el registro de horas', 'o registro de horas'],
  timeSourceWeekDifferent: ['la semana del registro de horas', 'a semana do registro de horas'],
  workerProfile: ['el perfil del trabajador', 'o perfil do colaborador'],
  workerSkillFields: ['la especialidad del trabajador', 'a especialidade do colaborador'],
  workerSkillIdsRequired: ['el trabajador y la especialidad', 'o trabalhador e a especialidade'],
};

function validationMessage(locale: 'es' | 'pt', suffix: string): string {
  const entity = validationEntities[suffix];
  if (!entity) {
    return locale === 'es'
      ? 'No se pudo validar la solicitud.'
      : 'Não foi possível validar a solicitação.';
  }
  const label = entity[locale === 'es' ? 0 : 1];
  const withPreposition =
    locale === 'es'
      ? label
          .replace(/^el /, 'del ')
          .replace(/^la /, 'de la ')
          .replace(/^los /, 'de los ')
          .replace(/^las /, 'de las ')
      : label
          .replace(/^o /, 'do ')
          .replace(/^a /, 'da ')
          .replace(/^os /, 'dos ')
          .replace(/^as /, 'das ');
  if (suffix.endsWith('IdRequired')) {
    return locale === 'es'
      ? `Se requiere el identificador ${withPreposition}.`
      : `O identificador ${withPreposition} é obrigatório.`;
  }
  if (suffix.endsWith('Fields')) {
    return locale === 'es'
      ? `Completa los campos ${withPreposition}.`
      : `Preencha os campos ${withPreposition}.`;
  }
  if (suffix.endsWith('TypeOrSize')) {
    return locale === 'es'
      ? `El tipo o tamaño ${withPreposition} no es válido.`
      : `O tipo ou tamanho ${withPreposition} não é válido.`;
  }
  if (suffix.endsWith('Content')) {
    return locale === 'es'
      ? `El contenido ${withPreposition} no es válido.`
      : `O conteúdo ${withPreposition} não é válido.`;
  }
  if (suffix.endsWith('Path')) {
    return locale === 'es'
      ? `La ruta ${withPreposition} no es válida.`
      : `O caminho ${withPreposition} não é válido.`;
  }
  if (suffix === 'accountingPeriod') {
    return locale === 'es'
      ? 'Indica una fecha de inicio igual o anterior a la de fin. Si dejas las fechas vacías, se usa el mes completo anterior.'
      : 'Informe uma data inicial igual ou anterior à final. Se deixar as datas vazias, usa-se o mês completo anterior.';
  }
  if (suffix === 'timeSourceWeekDifferent') {
    return locale === 'es'
      ? 'La semana del registro de horas debe coincidir con la semana seleccionada.'
      : 'A semana do registro de horas deve coincidir com a semana selecionada.';
  }
  if (suffix === 'milestoneDecisionType') {
    return locale === 'es'
      ? 'Selecciona el tipo de decisión del hito.'
      : 'Selecione o tipo de decisão do marco.';
  }
  return locale === 'es'
    ? `Revisa los datos ${withPreposition}.`
    : `Revise os dados ${withPreposition}.`;
}

function actionMessage(locale: 'es' | 'pt', key: string): string {
  const direct = actionExact[key]?.[locale === 'es' ? 0 : 1];
  if (direct) return direct;
  const suffix = key.slice('action.'.length);
  if (suffix.startsWith('billing.accountingPack.')) {
    const state = suffix.split('.').at(-1) ?? 'queued';
    const stateText =
      locale === 'es'
        ? ({ failed: 'con errores', processing: 'procesando', queued: 'en cola', ready: 'listo' }[
            state
          ] ?? 'en cola')
        : ({ failed: 'com falha', processing: 'processando', queued: 'na fila', ready: 'pronto' }[
            state
          ] ?? 'na fila');
    return locale === 'es'
      ? `Paquete contable {packId} ${stateText}.`
      : `Pacote contábil {packId} ${stateText}.`;
  }
  if (suffix.startsWith('validation.'))
    return validationMessage(locale, suffix.slice('validation.'.length));
  return locale === 'es' ? 'La acción no se pudo completar.' : 'Não foi possível concluir a ação.';
}

function englishActionMessage(key: string): string {
  const emailMessages: Record<string, string> = {
    'action.billing.invoiceEmail.uncertain':
      'Delivery uncertain; check mail server before retrying. No automatic retry.',
    'action.billing.invoiceEmail.declined': 'Email not sent',
    'action.billing.invoiceEmail.sending': 'Email delivery is in progress.',
    'action.billing.invoiceEmail.queued': 'Invoice email queued. It has not been sent yet.',
    'action.billing.invoiceEmail.accepted':
      'SMTP server accepted the email. Inbox delivery is not confirmed.',
    'action.billing.invoiceEmail.failed': 'Email failed; administrator action required.',
    'action.billing.invoiceEmail.retrying': 'Email delivery error; automatic retry pending.',
    'action.billing.invoiceSent': 'Invoice marked as sent manually.',
    'action.billing.invoiceAlreadySent': 'Invoice already marked as sent.',
  };
  if (emailMessages[key]) return emailMessages[key];
  const suffix = key.slice('action.'.length);
  const exactEnglish: Record<string, string> = {
    'action.management.changed':
      'This record changed. Your entries remain in this form. Compare them with the current record before applying your changes again.',
    'action.management.planningOverlap':
      'This time window overlaps another assignment. Review the worker’s schedule and choose another time window.',
    'action.management.workerUnavailable':
      'The worker is unavailable during this time window. Choose another time window or review the worker’s availability.',
    'action.management.linkedMilestoneInvoice':
      'This milestone is linked to an invoice. Open the linked invoice and review its correction options before changing the milestone.',
    'action.management.finalReport':
      'This change belongs to a finalized report. Open the report and use a versioned correction.',
    'action.management.billingLinked':
      'This record is linked to billing. Manage the invoice before changing its sources.',
    'action.management.invoiceSource':
      'This record is an invoice source. Manage the invoice first.',
    'action.management.correctionHistory':
      'This record belongs to a correction history. Use the correction workflow.',
    'action.management.financialHistory':
      'This record has financial history. Use a financial correction.',
    'action.management.periodReport':
      'This record is included in a period report. Manage the report before changing its sources.',
    'action.management.reimbursement':
      'This expense has a reimbursement. Reverse or adjust the payment first.',
    'action.management.classificationHistory':
      'This expense has a financial classification history. Use a financial correction.',
    'action.management.settlement':
      'This time is included in a settlement. Adjust the settlement first.',
    'action.management.technicalChanges':
      'This report has technical changes. Manage those changes first.',
    'action.management.committedAttachments':
      'This report has committed attachments. Open the report and use a versioned correction.',
    'action.management.alreadyDraft':
      'This record is already a draft. Open the record to edit it directly.',
    'action.management.reason': 'Enter a correction reason between 3 and 2000 characters.',
    'action.management.windowOrder':
      'The end must be after the start. Change the start or end date and time.',
    'action.management.activeWorker': 'Select an active worker or project manager.',
    'action.management.assignmentWindow':
      'The project assignment does not cover this time window. Choose dates within the assignment or update the assignment first.',
    'action.management.reportProject':
      'Select a technical report from the chosen project, or change the project.',
    'action.management.safetyEvidence':
      'This change affects safety. Complete the validation and rollback information before saving.',
    'action.management.amount': 'Enter a positive amount with no more than two decimal places.',
    'action.management.plannedMinutes': 'Enter planned minutes as a whole number from 1 to 10080.',
    'action.management.projectNotFound':
      'The project is no longer available. Select a current project.',
    'action.management.recordNotFound':
      'The record is no longer available. Return to the record list and select an existing record.',
    'action.management.invalidField': 'Check {fieldLabel}: complete it with a valid value.',
    'action.success': 'Changes saved.',
    'action.error.unauthenticated': 'Sign in again to continue.',
    'action.error.forbidden': 'You do not have permission to perform this action.',
    'action.navigation.wrongSection': 'This action is not available in this section.',
    'action.validation.invitation': 'Invalid invitation.',
    'action.validation.accountStatus': 'Invalid account status change.',
    'action.validation.workerProfile': 'Invalid worker profile data.',
    'action.error.conflict': 'This action conflicts with the current record state.',
    'action.billing.invoiceAlreadyIssued': 'Invoice {invoiceNumber} was already issued',
    'action.billing.paymentAlreadyRecorded': 'This payment was already recorded',
    'action.access.workerProfile.updated': 'Worker profile updated.',
    'action.validation.invalidForm': 'Invalid form.',
    'action.validation.missingEmails': 'No email accounts selected.',
    'action.validation.invalid': 'Check the submitted values.',
    'action.validation.missingUsername': 'Username is required.',
    'action.access.localAccount.provisioned': 'Local portal access created.',
    'action.access.denied': 'You do not have permission to perform this action.',
    'action.validation.localProvision': 'Check local access and supplier fields.',
    'action.access.mailbox.createdLinkPending':
      'The mailbox was created in Stalwart, but its portal link is pending. Retry the same creation to finish linking it; a second mailbox will not be created.',
    'action.access.mailboxes.provisioned': 'Mailbox directory synchronized.',
    'action.access.accountStatus.updated': 'Account status updated.',
    'action.access.mailbox.passwordUpdated': 'Mailbox password updated.',
    'action.access.mailbox.destroyed': 'Mailbox deleted; portal account preserved.',
    'action.validation.approvalDecision': 'Invalid approval decision.',
    'action.approval.decisionRecorded': 'Decision recorded.',
    'action.validation.financeDecision': 'Invalid finance decision.',
    'action.approval.financeReviewRecorded': 'Finance review recorded.',
    'action.approval.expenseClassificationRequired':
      'Classify this expense in Finance before recording Finance review.',
    'action.finance.projectIssuingAuthorityRequired':
      'Set a project issuing authority effective on this expense date before classifying it.',
    'action.validation.billingStream': 'Invalid billing stream.',
    'action.billing.streamSaved': 'Billing stream saved.',
    'action.validation.legalEntityFields': 'Check legal entity fields.',
    'action.billing.legalEntitySaved': 'Legal entity saved.',
    'action.validation.invoiceNumberPolicyFields': 'Check invoice-number policy fields.',
    'action.billing.invoiceNumberPolicySaved': 'Invoice-number policy saved.',
    'action.validation.taxProfileFields': 'Check tax profile fields.',
    'action.billing.taxProfileSaved': 'Tax profile saved.',
    'action.validation.billingRuleIdRequired': 'Billing Rule ID required.',
    'action.validation.fixedAmount': 'Fixed amount must be a non-negative exact amount.',
    'action.billing.ruleUpdated': 'Billing rule updated.',
    'action.billing.ruleArchived': 'Billing rule archived.',
    'action.validation.legalEntityIdRequired': 'Legal Entity ID required.',
    'action.billing.legalEntityUpdated': 'Legal entity updated.',
    'action.billing.legalEntityArchived': 'Legal entity archived.',
    'action.validation.taxProfileIdRequired': 'Tax Profile ID required.',
    'action.billing.taxProfileUpdated': 'Tax profile updated.',
    'action.billing.taxProfileArchived': 'Tax profile archived.',
    'action.validation.billingPeriod': 'Invalid billing period.',
    'action.validation.invoiceAdjustment': 'Invalid invoice adjustment.',
    'action.billing.invoiceAdjustmentCreated': 'Adjustment draft created.',
    'action.validation.invoice': 'Invalid invoice.',
    'action.billing.invoiceApproved': 'Invoice approved.',
    'action.billing.invoiceDeleted': 'Invoice deleted.',
    'action.validation.payment': 'Invalid payment.',
    'action.billing.paymentRecorded': 'Payment recorded.',
    'action.billing.periodClosed': 'Billing period closed and sources locked.',
    'action.validation.invoiceVoid': 'Invalid void request.',
    'action.billing.invoiceVoided': 'Invoice voided with audit trail.',
    'action.validation.invoiceSend': 'Invalid send request.',
    'action.billing.accountingPackFinalized': 'Accounting Pack marked final.',
    'action.validation.invoiceIdRequired': 'Invoice ID required.',
    'action.billing.invoiceUpdated': 'Invoice draft details updated.',
    'action.validation.documentSensitivity': 'Document classification is invalid.',
    'action.validation.documentRequired': 'Choose a private document to upload.',
    'action.validation.documentMetadata': 'Project, artifact type and description are required.',
    'action.validation.documentTypeOrSize': 'Unsupported document type or size over 50 MB.',
    'action.validation.documentContent':
      'Document filename or content does not match its declared type.',
    'action.error.financeRoleRequired': 'Finance document access required.',
    'action.validation.documentPath': 'Invalid private document path.',
    'action.documents.uploaded': 'Private document uploaded and hash-registered.',
    'action.validation.documentIdRequired': 'Document ID required.',
    'action.documents.deleted': 'Document deleted.',
    'action.documents.archived': 'Document archived.',
    'action.validation.documentArchive': 'Enter an archive reason of 3–500 characters.',
    'action.validation.expenseFields': 'Check expense fields.',
    'action.validation.receiptTypeOrSize': 'Receipt must be JPG, PNG or PDF under 10 MB.',
    'action.validation.receiptContent':
      'Receipt filename or content does not match its declared file type.',
    'action.validation.receiptPath': 'Invalid receipt path.',
    'action.expense.draftSaved': 'Expense draft saved.',
    'action.validation.expenseRecord': 'Invalid expense record.',
    'action.expense.submitted': 'Expense submitted.',
    'action.reports.draftDeleted': 'Draft deleted.',
    'action.validation.compensationRule': 'Invalid compensation rule.',
    'action.finance.compensationRuleSaved': 'Worker compensation rule saved.',
    'action.validation.compensationRuleId': 'Compensation rule ID is invalid.',
    'action.validation.replacementCompensationRule': 'Invalid replacement compensation rule.',
    'action.finance.compensationRuleSuperseded': 'Compensation rule superseded.',
    'action.finance.compensationRuleDeactivated': 'Compensation rule deactivated.',
    'action.validation.settlementPeriod': 'Invalid settlement period.',
    'action.validation.reimbursement': 'Invalid reimbursement.',
    'action.validation.clientLaborRate': 'Invalid client rate.',
    'action.finance.clientLaborRateSaved': 'Client labor rate saved.',
    'action.validation.clientLaborRateId': 'Client labor rate ID is invalid.',
    'action.validation.replacementClientLaborRate': 'Invalid replacement client rate.',
    'action.finance.clientLaborRateSuperseded': 'Client labor rate superseded.',
    'action.finance.clientLaborRateDeactivated': 'Client labor rate deactivated.',
    'action.validation.internalCostRule': 'Invalid internal cost rule.',
    'action.finance.internalCostRuleSaved': 'Internal cost rule saved.',
    'action.validation.internalCostRuleId': 'Internal cost rule ID is invalid.',
    'action.validation.replacementInternalCostRule': 'Invalid replacement internal cost rule.',
    'action.finance.internalCostRuleSuperseded': 'Internal cost rule superseded.',
    'action.finance.internalCostRuleDeactivated': 'Internal cost rule deactivated.',
    'action.finance.assignmentCommercialFallbackSaved': 'Assignment rule preference saved.',
    'action.finance.assignmentCommercialReferencesSaved': 'Assignment commercial rules saved.',
    'action.finance.assignmentExpensePolicyCreated': 'Assignment expense policy saved.',
    'action.finance.projectReimbursementSaved': 'Project reimbursement default saved.',
    'action.finance.workerReimbursementSaved': 'Worker reimbursement override saved.',
    'action.finance.canonicalLegalEntityRevisionCreated': 'Issuing authority revision saved.',
    'action.validation.assignmentCommercialFallback': 'Check assignment rule preference.',
    'action.validation.assignmentCommercialReferences': 'Check assignment commercial rules.',
    'action.validation.assignmentExpensePolicy': 'Check assignment expense policy.',
    'action.validation.projectReimbursement': 'Check project reimbursement fields.',
    'action.validation.workerReimbursement': 'Check worker reimbursement fields.',
    'action.validation.canonicalLegalEntityRevision': 'Check issuing authority revision.',
    'action.validation.assignmentOverride': 'Invalid assignment override.',
    'action.finance.assignmentRateOverrideSaved': 'Assignment rate override saved.',
    'action.validation.notificationIdRequired': 'Notification is required.',
    'action.notifications.markedRead': 'Notification marked as read.',
    'action.validation.reportAutosaveRequest': 'Invalid report autosave request.',
    'action.error.reportEditAccess': 'Report edit access required.',
    'action.conflict.reportNotEditable':
      'Autosave is available only for draft reports or reports needing changes.',
    'action.reports.autosaved': 'Report draft autosaved.',
    'action.validation.draftDelete': 'Invalid draft deletion.',
    'action.validation.correctionDraft':
      'Check revised fields and change at least one operational value.',
    'action.reports.correctionDraftCreated': 'Correction draft created.',
    'action.reports.correctionDraftWithdrawn':
      'Correction draft withdrawn. You can create a new one.',
    'action.reports.changesSaved': 'Changes saved. Submit the report for review when ready.',
    'action.validation.projectReportingPeriod': 'Check project and reporting period.',
    'action.validation.dailyReportFields': 'Check the daily report fields.',
    'action.validation.technicalReportFields': 'Check the PLC report fields.',
    'action.reports.technicalDraftSaved': 'PLC report draft saved.',
    'action.validation.technicalChangeFields': 'Check technical change fields.',
    'action.reports.technicalChangeDraftSaved': 'Technical change draft saved.',
    'action.validation.report': 'Invalid report.',
    'action.reports.submitted': 'Report submitted for review.',
    'action.validation.technicalChange': 'Invalid technical change.',
    'action.reports.technicalChangeSubmitted': 'Technical change submitted for review.',
    'action.validation.planningFields': 'Check planning fields.',
    'action.planning.assignmentPublished': 'Assignment published.',
    'action.planning.assignmentUpdated': 'Assignment updated.',
    'action.planning.assignmentCancelled': 'Assignment cancelled.',
    'action.planning.workerNotAssigned':
      'The worker is not assigned to this project for the full shift. Check the dates or assign the worker.',
    'action.planning.workerOverlap': 'The worker already has an overlapping shift.',
    'action.planning.workerUnavailable': 'The worker is unavailable during this shift.',
    'action.planning.invalidWindow': 'The shift end must be after its start.',
    'action.planning.invalidMinutes': 'Enter valid planned minutes for the shift.',
    'action.planning.changed':
      'This assignment changed while you edited it. Reload and review it again.',
    'action.planning.alreadyCancelled': 'This assignment is already cancelled.',
    'action.planning.assignmentNotFound': 'The assignment was not found in your access scope.',
    'action.planning.projectUnavailable':
      'This project does not accept new shifts in its current state.',
    'action.validation.skillFields': 'Check expertise fields.',
    'action.planning.skillSaved': 'Expertise saved.',
    'action.validation.workerSkillFields': 'Check worker expertise fields.',
    'action.planning.workerSkillUpdated': 'Worker expertise updated.',
    'action.validation.skillIdRequired': 'Expertise is required.',
    'action.planning.skillUpdated': 'Expertise updated.',
    'action.planning.skillDeleted': 'Expertise deleted.',
    'action.validation.workerSkillIdsRequired': 'Worker and expertise are required.',
    'action.planning.workerSkillDeleted': 'Worker expertise deleted.',
    'action.validation.availabilityFields': 'Check availability fields.',
    'action.planning.availabilitySaved': 'Availability saved.',
    'action.validation.reportDecision': 'Invalid report decision.',
    'action.approvals.reportReviewRecorded': 'Report review recorded.',
    'action.validation.technicalChangeDecision': 'Invalid technical change decision.',
    'action.approvals.technicalChangeReviewRecorded': 'Technical change review recorded.',
    'action.validation.milestoneDecision': 'Invalid milestone decision.',
    'action.validation.milestoneDecisionType': 'Milestones must be approved or rejected.',
    'action.approvals.milestoneReviewRecorded': 'Milestone review recorded.',
    'action.validation.clientFields': 'Check client fields.',
    'action.validation.contactFields': 'Check contact fields.',
    'action.projects.clientContactSaved': 'Client contact saved.',
    'action.validation.projectIdRequired': 'Project ID required.',
    'action.validation.lifecycleFields': 'Project version is required.',
    'action.projects.projectUpdated': 'Project updated.',
    'action.validation.projectFields': 'Check project fields.',
    'action.validation.milestoneFields': 'Check milestone fields.',
    'action.projects.milestoneDraftSaved': 'Milestone draft saved.',
    'action.validation.milestoneRecord': 'Invalid milestone record.',
    'action.projects.milestoneSubmitted': 'Milestone submitted for review.',
    'action.validation.scheduleFields': 'Check schedule fields.',
    'action.projects.scheduleSaved': 'Expected schedule saved.',
    'action.validation.assignmentFields': 'Check assignment fields.',
    'action.projects.assignmentCreated': 'Assignment created.',
    'action.projects.clientUpdated': 'Client updated.',
    'action.projects.clientArchived': 'Client archived.',
    'action.validation.clientIdRequired': 'Client ID required.',
    'action.projects.clientDeleted': 'Client deleted.',
    'action.projects.projectDeleted': 'Project deleted.',
    'action.validation.contactIdRequired': 'Contact ID required.',
    'action.projects.clientContactUpdated': 'Client contact updated.',
    'action.projects.clientContactDeleted': 'Client contact deleted.',
    'action.validation.assignmentIdRequired': 'Assignment ID required.',
    'action.projects.assignmentUpdated': 'Assignment updated.',
    'action.projects.assignmentDeleted': 'Assignment removed.',
    'action.validation.timeFields': 'Check time fields.',
    'action.time.draftSaved': 'Time draft saved.',
    'action.time.batchDraftsSaved': '{count} daily time drafts saved.',
    'action.time.expenseDraftsSaved': 'Time and expense drafts saved.',
    'action.validation.timeSourceWeekDifferent': 'Choose a different source week.',
    'action.time.draftUpdated': 'Time draft updated.',
    'action.validation.timeRecord': 'Invalid time record.',
    'action.time.submitted': 'Time submitted.',
    'action.time.weekSubmitted':
      '{timeSubmitted} time drafts and {mealsSubmitted} linked meal expenses submitted for review.',
    'action.time.removedOrVoided': 'Time entry removed/voided.',
    'action.error.invalid': 'Check the submitted values and try again.',
    'action.reports.periodFollowupRecorded': 'Period follow-up recorded.',
    'action.closeout.draftPrepared': 'Closeout draft prepared.',
    'action.closeout.draftRefreshed':
      'Closeout draft refreshed; review and confirm the new client snapshot.',
    'action.closeout.clientSnapshotConfirmed': 'Exact client snapshot confirmed.',
    'action.closeout.packagesFinalized': 'Closeout packages finalized.',
    'action.closeout.reopened': 'Closeout reopened.',
    'action.access.invitation.created': 'Invitation created.',
    'action.billing.invoiceDraftCreated': 'Invoice draft created.',
    'action.billing.invoiceRecalculated':
      'Invoice recalculated as a draft. Review and approve it again.',
    'action.billing.invoiceDraftExisting': 'Existing invoice draft returned.',
    'action.billing.invoiceAlreadyExists':
      'An invoice already exists for this stream and period. Open it to review its current state.',
    'action.billing.creditNoteStateRestored': 'Credit note issued status restored.',
    'action.billing.invoiceIssued': 'Invoice issued.',
    'action.billing.jobsProcessed': 'Background jobs processed.',
    'action.expense.removedOrVoided': 'Expense removed or voided.',
    'action.finance.compensationSettled': 'Worker compensation settlement recorded.',
    'action.finance.reimbursementRecorded': 'Expense reimbursement recorded.',
    'action.projects.clientCreated': 'Client created.',
    'action.projects.projectCreated': 'Project created.',
    'action.reports.periodReportsRefreshed': 'Period reports refreshed.',
    'action.time.layoutCopied': 'Weekly time layout copied.',
    'action.access.mailbox.created': 'Mailbox created.',
    'action.access.mailbox.aliasExists': 'This mailbox alias already exists.',
    'action.access.mailbox.identityCollision':
      'This mailbox conflicts with an existing portal identity.',
    'action.access.mailbox.invalidAlias':
      'Use an alias of 2–64 lowercase letters, numbers, dots, underscores or hyphens.',
    'action.access.mailbox.invalidPassword':
      'Use a password of 12–128 characters without line breaks.',
    'action.access.mailbox.invalidQuota': 'The mailbox quota is invalid.',
    'action.access.mailbox.passwordRejected': 'The mail server rejected the password.',
    'action.access.mailbox.permissionDenied': 'The mail server did not authorize this operation.',
    'action.access.mailbox.rejected': 'The mail server rejected this operation.',
    'action.access.mailbox.relinkRequired':
      'This mailbox requires an explicit portal account relink.',
    'action.access.mailbox.userInactive':
      'Restore this archived portal user before linking the mailbox.',
    'action.billing.invoicePlanningDatesSaved': 'Invoice planning dates saved.',
    'action.finance.compensationExpectedPaymentSaved': 'Expected worker payment date saved.',
    'action.finance.compensationPaymentRecorded': 'Actual compensation payment recorded.',
    'action.finance.compensationPaymentReversed':
      'Compensation payment reversed with an audit event.',
    'action.finance.expenseClassified': 'Expense commercial classification saved.',
    'action.finance.expensePlanningDatesSaved': 'Expense planning dates saved.',
    'action.finance.projectCommercialPolicySaved': 'Project commercial policy saved.',
    'action.validation.compensationSettlementPlanning': 'Check the expected worker payment date.',
    'action.validation.compensationPayment': 'Check the actual payment fields.',
    'action.validation.compensationPaymentReversal': 'Check the payment reversal fields.',
    'action.validation.expenseCommercialClassification':
      'Check the expense commercial classification fields.',
    'action.validation.expensePlanningDates': 'Check the expense planning dates.',
    'action.validation.invoicePlanningDates': 'Check the invoice planning dates.',
    'action.validation.paymentReversal': 'Check the payment reversal details and reason.',
    'action.validation.projectCommercialPolicy': 'Check the project commercial policy fields.',
    'action.billing.paymentReversed': 'Payment reversal recorded.',
    'action.billing.invoiceDraftCreatedForPeriod':
      'Invoice draft created for {periodStart} → {periodEnd}, the last complete period with approved billable work.',
    'action.billing.invoiceDraftExistingForPeriod':
      'Existing invoice draft returned for {periodStart} → {periodEnd}.',
    'action.conflict.billingPeriodIncomplete':
      'This billing period is not ready for a draft. Review the causes below and fix them in Approvals or Finance configuration.',
    'action.billing.readiness.noBillableSources':
      'The selected period has no approved billable hours or expenses. Review its pending records or explicitly choose another period; the app will not change the dates for you.',
    'action.billing.readiness.periodCutoffMismatch':
      'These dates do not match this billing stream’s cadence (for example a weekly stream needs a Monday–Sunday week). Choose the correct period; the app will not replace it automatically.',
    'action.billing.readiness.pendingTimeApproval':
      'Time entries in this period are still waiting for approval. Approve or reject them in Approvals, then create the draft again.',
    'action.billing.readiness.pendingExpenseApproval':
      'Expenses in this period still need operational approval or Finance review. Complete both stages in Approvals → Finance review, then create the draft again.',
    'action.billing.readiness.missingTaxProfile':
      'This billing stream has no tax profile. Add one in Finance configuration, then create the draft again.',
    'action.billing.readiness.inactiveTaxProfile':
      'This stream’s tax profile is not active. Activate it or assign an active profile in Finance configuration.',
    'action.billing.readiness.missingLegalEntity':
      'This billing stream has no legal entity. Assign one in Finance configuration.',
    'action.billing.readiness.archivedLegalEntity':
      'This stream’s legal entity is archived. Restore it or assign an active entity in Finance configuration.',
    'action.billing.readiness.legalEntityCurrencyMismatch':
      'The legal entity currency does not match this billing stream. Correct it in Finance configuration.',
    'action.billing.readiness.taxProfileCurrencyMismatch':
      'The tax profile currency does not match this billing stream. Correct it in Finance configuration.',
    'action.billing.readiness.taxProfileLegalEntityMismatch':
      'The tax profile does not belong to this stream’s legal entity. Reassign it in Finance configuration.',
    'action.billing.readiness.invalidPeriod':
      'The period end is before the start date. Choose a valid period.',
    'action.billing.readiness.invalidPeriodConfiguration':
      'This stream’s cadence cannot calculate the period. Check the anchor date or monthly cutoff on the billing stream.',
    'action.billing.readiness.missingFixedPrice':
      'This all-in labor stream has no fixed price. Configure it on the project or billing stream.',
    'action.billing.readiness.capExhausted':
      'This project’s purchase-order cap is already consumed. Increase the cap or invoice another stream.',
    'action.billing.readiness.missingClientRate':
      'Approved hours are missing a client labor rate. Add the client rate in Finance, then create the draft again.',
    'action.billing.readiness.missingExpenseCurrencyConversion':
      'Expenses in another currency are missing conversion into the billing currency. Complete the conversion in Finance.',
    'action.billing.readiness.missingExpenseFinanceProjection':
      'Classified expenses are missing a finance projection. Complete commercial classification in Finance.',
    'action.billing.readiness.customerSignoffRequired':
      'Customer conformity is still required for this period. Capture it on the project period report, then issue again.',
    'action.billing.readiness.canonicalLegalEntityRevisionRequired':
      'This project has no reviewed legal-entity revision for issuing. Assign it in Finance configuration.',
    'action.billing.readiness.missingInvoiceNumberPolicy':
      'The approved invoice numbering policy is missing. Configure it in Billing before issuing.',
    'action.billing.readiness.inactiveBillingConfiguration':
      'This billing stream or its legal/tax configuration is not active. Review it in Finance configuration.',
    'action.billing.readiness.staleBillingConfiguration':
      'Billing configuration or source records changed. Review the current terms; if the invoice is already approved, use Recalculate and review draft, then approve it again.',
    'action.reports.dailyDraftSaved': 'Daily report draft saved.',
    'action.reports.periodReportApproved': 'Period report approved.',
    'action.reports.periodReportAlreadyApproved': 'Period report was already approved.',
    'action.reports.customerSignoffRecorded': 'Customer conformity recorded.',
    'action.reports.customerSignoffEvidenceAttached':
      'Signed-copy evidence attached to the historical conformity.',
    'action.reports.customerSignoffInvalidated': 'Customer conformity invalidated.',
    'action.validation.periodReportApproval': 'A valid period report snapshot binding is required.',
    'action.validation.customerSignoff': 'Customer conformity details are required.',
    'action.validation.customerSignoffInvalidation':
      'Conformity and invalidation reason are required.',
    'action.validation.projectLegalEntityAssignment':
      'The project issuing-authority assignment is invalid.',
    'action.finance.projectLegalEntityAssigned': 'Project issuing authority saved.',
    'action.validation.accountingPeriod':
      'Choose a start date on or before the end date. Empty dates use the previous complete month.',
  };
  if (exactEnglish[key]) return exactEnglish[key];
  if (suffix === 'error.invalid') return 'The submitted values are invalid.';
  if (suffix === 'error.forbidden') return 'You do not have permission to perform this action.';
  if (suffix === 'error.unauthenticated') return 'Sign in again to continue.';
  if (suffix === 'error.conflict') return 'This action conflicts with the current record state.';
  if (suffix === 'error.unavailable')
    return 'The action could not be completed. Try again shortly.';
  if (suffix.startsWith('billing.accountingPack.')) {
    const state = suffix.split('.').at(-1) ?? 'queued';
    const stateText =
      { failed: 'failed', processing: 'processing', queued: 'queued', ready: 'ready' }[state] ??
      state;
    return `Accounting pack {packId} ${stateText}.`;
  }
  return 'The action could not be completed.';
}

const problemEnglish: Record<string, string> = {
  'problem.notification.invalidLink':
    'This notification link is invalid. Open it from your activity inbox.',
  'problem.notification.unavailable':
    'This notification is no longer available. Return to your activity inbox.',
  'problem.closeout.financeRoleRequired':
    'An active Finance or Owner role is required to manage closeout.',
  'problem.closeout.ownerRoleRequired': 'Only an active Owner can reopen a closed project.',
  'problem.closeout.projectNotFound':
    'This project is no longer available. Review the project list.',
  'problem.closeout.revisionNotFound':
    'This closeout revision is no longer available. Review the current closeout.',
  'problem.closeout.reopenReasonRequired':
    'Enter a reason of 1 to 2000 characters before reopening.',
  'problem.closeout.documentSelectionInvalid':
    'The selected customer attachments contain duplicates or exceed the allowed document count. Review the selection.',
  'problem.closeout.documentUnavailable':
    'A selected document is unavailable or is not authorized for customer closeout. Review the selection.',
  'problem.closeout.packageTooLarge':
    'The closeout package exceeds its size limit. Choose fewer or smaller customer attachments.',
  'problem.closeout.clientSnapshotFinancialReview':
    'The client snapshot may contain financial information. Review its source records before publication.',
  'problem.closeout.clientConfirmationStale':
    'The client snapshot changed since confirmation. Review the current snapshot and confirm it again.',
  'problem.closeout.confirmationCheckRequired':
    'Confirm that you reviewed the exact client snapshot before continuing.',
  'problem.closeout.reasonRetained': 'Reason entered',
  'problem.closeout.selectionRetained': 'Documents you selected',
  'problem.closeout.documentNoLongerAvailable': 'Document no longer available',
  'problem.closeout.previousConfirmation':
    'You checked the previous snapshot. Review the current snapshot and check the box again.',
  'problem.closeout.confirmationRequired':
    'Confirm the exact current client snapshot before finalizing the closeout.',
  'problem.closeout.draftAlreadyActive':
    'A closeout draft is already active. Review that draft before continuing.',
  'problem.closeout.activeDraftRequired':
    'This closeout draft is no longer active. Review the current closeout.',
  'problem.closeout.draftChanged':
    'The closeout changed while this form was open. Review the updated draft before continuing.',
  'problem.closeout.reopenUnavailable':
    'This revision cannot be reopened because it is not the latest final revision of a closed project, or it was already reopened. Review the current closeout.',
  'problem.closeout.sourceChanged':
    'The closeout source records changed. Review them and prepare a fresh draft.',
  'problem.closeout.sourceInvalid':
    'A required closeout source or accepted customer conformity record is invalid or stale. Review the source records.',
  'problem.closeout.documentIntegrityFailed':
    'A selected source document failed a storage or integrity check. Review the source documents and contact an owner.',
  'problem.closeout.artifactWriteIncomplete':
    'The closeout artifact did not finish writing. Check the current revision before trying again.',
  'problem.remedy.reviewCloseout': 'Review current closeout',
  'problem.remedy.reviewCloseoutDocuments': 'Review closeout documents',
  'problem.remedy.reviewProjects': 'Review projects',
  'problem.finance.policyDuplicateStart':
    'A person expense policy already starts on this date. Review that policy before adding another.',
  'problem.finance.policyPeriodOverlap':
    'This policy period overlaps an existing policy for the same person, payer, and category. Review the current periods.',
  'problem.finance.policyEndBeforeStart': 'The policy end date must be on or after its start date.',
  'problem.finance.policyAssignmentUnavailable':
    'This person no longer has an active project assignment. Review the assignment before creating a policy.',
  'problem.finance.policyOutsideAssignment':
    "The policy dates must stay within this person's project assignment.",
  'problem.finance.policyEndRequired':
    'This assignment has an end date. Enter a policy end date within it.',
  'problem.finance.policyMarkupMismatch':
    'A markup requires a positive rate; other client treatments cannot include markup.',
  'problem.finance.reimbursementAmountInvalid':
    'The reimbursement amount must be positive and cannot exceed the approved worker reimbursement.',
  'problem.finance.partialReimbursementUnsupported':
    'Record the full approved worker reimbursement amount; partial reimbursement is not supported here.',
  'problem.finance.paymentExceedsBalance':
    'The payment exceeds the remaining worker compensation balance. Review the settlement before recording it.',
  'problem.finance.paymentCurrencyMismatch':
    'The payment currency must match the worker compensation settlement.',
  'problem.remedy.reviewAssignmentPolicy': 'Review assignment policy',
  'problem.crew.accountInactive':
    'Your account is no longer active for this action. Contact the project owner.',
  'problem.crew.assignmentRequired':
    'Both workers need active project assignments on the delegation start date. Contact the project owner to review assignments.',
  'problem.crew.batchRequestInvalid':
    'Refresh this form before saving crew time. Your entered hours can be copied into the new form.',
  'problem.crew.batchRetryChanged':
    'This request ID was already used with different hours. Review saved crew time before submitting again.',
  'problem.crew.batchWorkerBlocked':
    'No crew time was saved because a selected worker has a date, assignment, or existing time conflict. Review that worker and the current entries.',
  'problem.crew.categoryInvalid': 'Choose a valid operational time category.',
  'problem.crew.chiefRoleRequired':
    'Crew time entry requires an active crew chief role. Contact the project owner to review access.',
  'problem.crew.correctionStale':
    'This crew time changed before the correction. Review the current record before creating a new draft.',
  'problem.crew.correctionStateBlocked':
    'A corrected draft can be created here only after a reviewer returns this crew time for changes.',
  'problem.crew.dateOrderInvalid': 'The end date must follow the start date.',
  'problem.crew.delegationChanged':
    'This delegation was already changed or revoked. Review current delegations.',
  'problem.crew.delegationExists':
    'These workers already have an active crew delegation. Review it before adding another.',
  'problem.crew.delegationNotActive':
    'This crew delegation or a project assignment is no longer active for the selected date. Contact the project owner.',
  'problem.crew.draftChanged':
    'This crew draft changed while you were editing. Review the current version before saving.',
  'problem.crew.draftLinkedEvidence':
    'This crew draft is linked to another record and cannot be changed here. Review the linked record and request a documented correction.',
  'problem.crew.draftNotEditable':
    'Only a crew draft that has never been submitted can be edited or discarded. Review the record.',
  'problem.crew.draftVersionInvalid':
    'This form has no valid draft version. Review the current entry before saving.',
  'problem.crew.durationInvalid': 'Enter more than zero and no more than 24 hours.',
  'problem.crew.hourModeRequired': 'Choose shared hours or individual hours for this crew entry.',
  'problem.crew.individualHoursInvalid': 'Enter valid hours for every selected worker.',
  'problem.crew.intervalNotAllowed':
    'Crew batch hours cannot include a start or end time inferred from duration. Enter actual hours for each worker.',
  'problem.crew.membersRequired': 'Select between one and 100 assigned crew members.',
  'problem.crew.ownerRoleRequired':
    'Only the project owner can change crew delegations. Contact the owner for assistance.',
  'problem.crew.projectTimezoneRequired':
    'The project needs a valid timezone before crew access can be checked. Contact the project owner.',
  'problem.crew.receiptAccessRequired':
    'This receipt is unavailable under your current crew access. Review current receipts.',
  'problem.crew.receiptAmountFormatInvalid':
    'Enter each allocation as a positive amount, such as 6.50.',
  'problem.crew.receiptAmountInvalid':
    'The receipt amount is invalid for allocation. Review the saved receipt.',
  'problem.crew.receiptAmountsInvalid': 'Enter a positive amount for each distinct crew time row.',
  'problem.crew.receiptLinkedTimeRequired': 'Include the time row already linked to this receipt.',
  'problem.crew.receiptPayerInvalid':
    'A shared receipt must have one worker or the company as its payer. Review the receipt before allocation.',
  'problem.crew.receiptPayerRequired':
    'Include the receipt’s payer or attributed worker in the allocation.',
  'problem.crew.receiptRequestInvalid':
    'Refresh this form before allocating the receipt. Review existing allocations before trying again.',
  'problem.crew.receiptRetryChanged':
    'This receipt allocation request was already used with different amounts. Review existing allocations.',
  'problem.crew.receiptRowsRequired': 'Select two to 100 crew time rows for this shared receipt.',
  'problem.crew.receiptScopeMismatch':
    'The selected time rows and receipt must belong to the same project and date. Review both records.',
  'problem.crew.receiptTotalMismatch':
    'The allocation amounts must add up to the receipt amount exactly.',
  'problem.crew.receiptUnavailable':
    'The receipt is no longer an unallocated draft you entered. Review current receipts.',
  'problem.crew.receiptWorkersRequired':
    'Allocate the shared receipt to at least two different workers.',
  'problem.crew.samePerson': 'Choose different people for the chief and team member.',
  'problem.crew.sharedHoursInvalid':
    'Enter shared hours greater than zero and no more than 24 for each selected worker.',
  'problem.crew.timeAccessRequired':
    'This crew time entry is unavailable under your current delegation. Review your crew entries or contact the project owner.',
  'problem.crew.timeDailyLimit':
    'This worker already has time on the selected day. Total time cannot exceed 24 hours.',
  'problem.crew.timeDelegationChanged':
    'The crew delegation changed after this form opened. Contact the project owner to review access.',
  'problem.crew.timeIntervalOverlap':
    'This worker already has time recorded in the selected interval. Adjust the time or date.',
  'problem.crew.timeSubmissionChanged':
    'This crew time changed or is no longer a draft. Review the current entry before submitting.',
  'problem.crew.workerInactive':
    'Both selected workers need active accounts. Contact the project owner to review access.',
  'problem.remedy.reviewDelegations': 'Review current crew delegations',
  'problem.remedy.reviewCrewDay': 'Review current crew entries',
  'problem.remedy.reviewReceipts': 'Review current receipts and allocations',
  'problem.remedy.reviewCrewTime': 'Review updated crew time',
  'problem.remedy.contactProjectOwner': 'Contact the project owner to review access',
  'problem.remedy.reviewSupplierDirectory': 'Review supplier directory',
  'problem.remedy.reviewSupplierGrants': 'Review supplier grants',
  'problem.remedy.reviewSupplierAssignments': 'Review technician assignments',
  'problem.remedy.chooseOperationalProject': 'Choose an operational project',
  'problem.remedy.reviewSavedDrafts': 'Review saved drafts before retrying',
  'problem.remedy.reviewTimeDrafts': 'Review time drafts',
  'problem.remedy.correctField': 'Correct the highlighted field',
  'problem.remedy.confirmStatusChange': 'Confirm the status change',
  'problem.remedy.signInAgain': 'Sign in again',
  'problem.supplier.nameExists': 'Supplier name already exists',
  'problem.supplier.emailInvalid': 'Supplier email is invalid',
  'problem.supplier.technicianEmailInvalid': 'Technician email is invalid',
  'problem.supplier.technicianEmailUsed': 'Technician email already belongs to an account',
  'problem.supplier.loginEmailManaged': 'Manage login email from the account profile',
  'problem.supplier.activeRequired': 'Active supplier required',
  'problem.supplier.notFound': 'Supplier not found',
  'problem.supplier.technicianUnavailable': 'Supplier technician required',
  'problem.supplier.technicianStatusBlocked': 'Active or suspended supplier technician required',
  'problem.supplier.operationalProjectRequired': 'Operational project required',
  'problem.supplier.coordinatorUnavailable': 'Active supplier coordinator required',
  'problem.supplier.coordinatorLoginRequired':
    'Supplier coordinators require a usable login account',
  'problem.supplier.profileWorkerRequired':
    'Only existing worker accounts can receive a supplier profile',
  'problem.supplier.profileHistoryLocked':
    'Supplier profile with canonical time history cannot be reassigned',
  'problem.supplier.grantOverlap': 'Supplier project grant overlaps an active grant',
  'problem.supplier.grantChanged': 'Active supplier project grant required',
  'problem.supplier.assignmentExists': 'Technician assignment already exists',
  'problem.supplier.dateOrderInvalid': 'End date must follow start date',
  'problem.supplier.batchTechnicianRequired': 'Select at least one technician',
  'problem.supplier.batchLimit': 'A time batch is limited to 100 technicians',
  'problem.supplier.batchReplayChanged': 'Batch request was already used with different values',
  'problem.supplier.draftRequired': 'Select at least one draft',
  'problem.supplier.draftBatchLimit': 'A submission batch is limited to 100 drafts',
  'problem.supplier.draftSelectionInvalid': 'The selected drafts are invalid',
  'problem.supplier.timeSubmitStale': 'Time entry changed or cannot be submitted',
  'problem.supplier.timeEditStale': 'Time entry changed or cannot be edited',
  'problem.supplier.timeDiscardStale':
    'This draft changed or can no longer be discarded. Review its current state before trying again.',
  'problem.supplier.timeDraftLocked': 'Only an unlocked never-submitted time draft can change',
  'problem.supplier.timeCorrectionLocked':
    'This correction draft cannot be edited or deleted here. Review its correction record.',
  'problem.supplier.timeCorrectionRequired':
    'Returned, submitted, or approved time requires the reviewed correction path',
  'problem.supplier.timeCorrectionExists': 'A correction draft already exists for this time entry',
  'problem.supplier.timeCorrectionState':
    'Only approved or reviewer-returned time can create a correction draft',
  'problem.supplier.timeFinanceLocked':
    'This time has financial history and cannot be changed here. Contact an Owner about an explicit adjustment.',
  'problem.supplier.timeCorrectionReplay': 'Correction request conflicts with prior replay',
  'problem.supplier.timeCorrectionReason': 'Correction reason must contain at least 3 characters',
  'problem.supplier.timeCorrectionEmpty':
    'Change at least one operational field before creating a correction',
  'problem.supplier.statusInvalid': 'Invalid supplier status',
  'problem.supplier.technicianStatusInvalid': 'Invalid technician status',
  'problem.supplier.batchModeInvalid': 'Choose shared or individual hours',
  'problem.supplier.batchHoursRequired': 'Enter hours for every selected technician',
  'problem.supplier.batchHoursInvalid': 'Enter valid hours for every selected technician',
  'problem.supplier.batchHoursRange':
    'Individual hours must be greater than zero and no more than 24',
  'problem.supplier.batchModeConflict': 'Individual hours cannot include a shared time interval',
  'problem.supplier.intervalRequired': 'Start and end time are both required',
  'problem.supplier.intervalInvalid': 'The time interval or break is invalid',
  'problem.supplier.durationRequired': 'Enter hours, or a start and end time',
  'problem.supplier.durationRange': 'Duration must be greater than zero and no more than 24 hours',
  'problem.supplier.durationModeInvalid': 'Choose duration or time interval',
  'problem.supplier.phoneTooLong': 'Phone is too long',
  'problem.supplier.addressTooLong': 'Address is too long',
  'problem.supplier.notesTooLong': 'Notes are too long',
  'problem.supplier.companyTooLong': 'Company is too long',
  'problem.supplier.contactNameTooLong': 'Contact name is too long',
  'problem.supplier.profileWorkerUnavailable': 'Worker not found',
  'problem.supplier.grantRequired': 'Current supplier project grant required',
  'problem.supplier.technicianScopeRequired': 'Supplier technician project scope required',
  'problem.supplier.scopeRequired': 'Supplier scope required',
  'problem.supplier.coordinatorAccessChanged': 'Active supplier coordinator access required',
  'problem.supplier.ownerRequired': 'Owner administration required',
  'problem.supplier.accountRoleChanged': 'Account role changed',
  'problem.supplier.draftRecorderRequired':
    'Only the coordinator who recorded this draft may discard it',
  'problem.supplier.minutesInvalid': 'Minutes must be an integer from 0 to 1440',
  'problem.supplier.breakInvalid': 'Break minutes are invalid',
  'problem.supplier.timeNotFound':
    'This time entry is no longer available. Review the current drafts.',
  'problem.supplier.timeCorrectionStale': 'Returned correction changed before retry',
  'problem.supplier.timeAssignmentDate': 'Worker assignment does not cover corrected work date',
  'problem.supplier.timeAssignmentRequired':
    'The technician no longer has an active assignment for this project and date. Contact an Owner.',
  'problem.supplier.timeOwnershipRequired': 'Time entry ownership required',
  'problem.supplier.batchRequestInvalid': 'Batch request is invalid',
  'problem.supplier.timeWeekUnchanged': 'Source and target weeks must differ',
  'problem.supplier.existingIntervalInvalid':
    'An existing time interval needs review before new time can be saved.',
  'problem.supplier.sessionExpired': 'Live authenticated session required',
  'problem.supplier.correctionConfigurationMissing': 'Deployment identity is not configured',
  'problem.supplier.confirmStatusChange': 'Confirm this status change before saving.',
  'problem.supplier.profileInvalid': 'Choose a valid supplier profile.',
  'problem.supplier.dateInvalid': 'Enter a real date in YYYY-MM-DD format.',
  'problem.supplier.requiredField': 'Complete this required field.',
  'problem.supplier.assignmentGrantEnd':
    'This assignment would extend beyond the coordinator’s authorization ending {grantEnd}. Ask an Owner to review the grant or shorten the assignment.',
  'problem.supplier.clockFormatInvalid': 'Enter a valid time in HH:mm format.',
  'problem.supplier.batchNoneSaved': 'No time entry was saved.',
  'problem.management.ownerRequired': 'Owner access is required for this change. Contact an Owner.',
  'problem.management.confirmOperation': 'Confirm the operation before saving.',
  'problem.finance.previewInvalidFields':
    'Check the highlighted example fields and calculate again.',
  'problem.finance.previewPayerConflict':
    'A customer-direct expense cannot also have been advanced by the worker. Change the expense treatment or payer.',
  'problem.finance.previewPeriodInvalid':
    'Enter valid example and anchor dates before calculating billing periods.',
  'problem.finance.previewCalculationInvalid':
    'The example cannot be calculated with these values. Review the rates, hours, and multipliers.',
  'problem.finance.previewRoleRequired':
    'Finance access is required to calculate this example. Contact Finance or an owner.',
  'problem.finance.previewSessionRequired':
    'Sign in again before calculating this Finance example.',
  'problem.remedy.reviewOwnerAccess': 'Review owner access',
  'problem.remedy.reviewUserStatus': 'Review user status',
  'problem.remedy.reviewExistingPerson': 'Review existing person',
  'problem.remedy.reviewSupplierProfile': 'Review supplier profile',
  'problem.remedy.reviewUserAccess': 'Review user access',
  'problem.remedy.reviewMailboxIdentity': 'Review mailbox identity',
  'problem.remedy.reviewUpdatedRecord': 'Review updated record',
  'problem.remedy.correctEmail': 'Correct email',
  'problem.remedy.enterReason': 'Enter a reason',
  'problem.access.lastOwnerRequired':
    'The last active owner must keep owner access. Add another owner before changing this role.',
  'problem.access.selfStatusBlocked':
    'An owner cannot change their own account status here. Ask another authorized owner to review the account.',
  'problem.access.canonicalOwnerProtected':
    'The designated owner account cannot be changed through this mailbox action.',
  'problem.access.userInactive':
    'This portal account is inactive. Review its status before changing mailbox access.',
  'problem.access.mailIdentityStale':
    'This mailbox link changed or was removed. Review the updated account before retrying.',
  'problem.access.reasonRequired': 'Enter a reason for this account access change.',
  'problem.access.emailAlreadyUsed':
    'A portal account already uses this email. Choose the existing person or another email.',
  'problem.access.personAlreadyHasLogin':
    'This person already has portal access. Review their existing account instead of creating another login.',
  'problem.access.personInactive':
    'The selected person is no longer active. Review their status or choose an active person.',
  'problem.access.personRoleMismatch':
    'The selected person has a different role. Review their role before granting this access.',
  'problem.access.personSupplierMismatch':
    'The selected person belongs to a different supplier profile. Review that profile before granting access.',
  'problem.access.supplierHistoryLocked':
    'This person has supplier time history. Review the existing supplier profile before changing its supplier.',
  'problem.access.supplierLoginRequired':
    'A supplier coordinator needs working portal access. Create or restore their login first.',
  'problem.access.supplierWorkerRequired':
    'Only worker accounts can receive a supplier profile. Choose a worker or review this person’s role.',
  'problem.access.emailInvalid': 'Enter a valid email address for this portal account.',
  'problem.access.workforceProfileInvalid': 'Choose a person and a valid workforce profile.',
  'problem.access.localCredentialsInvalid': 'Name and a 12–128 character password are required',
  'problem.access.localRoleInvalid': 'Choose a valid access role.',
  'problem.access.supplierRequired': 'Select a supplier for this access role.',
  'problem.access.statusInvalid': 'Choose a person and a valid account status.',
  'problem.access.workerProfileInvalid':
    'Complete the person’s name, email and role before saving.',
  'problem.access.linkedMailboxEmail':
    'This person has a linked mailbox address. Change the mailbox identity through the authorized mail account flow.',
  'problem.remedy.reviewAssignments': 'Review assignments',
  'problem.remedy.chooseAvailableWorker': 'Choose an available worker',
  'problem.project.clientCurrencyMismatch':
    'Project currency must match the selected client’s currency.',
  'problem.project.initialWorkerDuplicate':
    'A worker was selected more than once. Keep one entry for each worker.',
  'problem.project.initialWorkerUnavailable':
    'A selected worker is no longer active. Choose an available worker.',
  'problem.project.initialWorkerDateOutsideProject':
    'The worker assignment must start within the project dates. Review the start date.',
  'problem.project.assignmentOverlap':
    'This worker already has an overlapping assignment on this project. Review the existing assignment dates.',
  'problem.project.assignmentWorkerUnavailable':
    'This worker is no longer active. Choose an available worker before assigning.',
  'problem.client.stale':
    'This client changed while you were editing. Review the updated client before saving again.',
  'problem.project.stale':
    'This project changed while you were editing. Review its current status before saving again.',
  'problem.assignment.stale':
    'This assignment changed while you were editing. Review the latest dates before saving again.',
  'problem.client.closeOpenProjects':
    'Close or archive the client’s open projects before closing the client.',
  'problem.project.clientArchived':
    'The client is archived. Review the client’s status before activating this project.',
  'problem.client.transitionNotAllowed':
    'The requested client status change is not allowed from its current status.',
  'problem.project.transitionNotAllowed':
    'The requested project status change is not allowed from its current status.',
  'problem.record.notArchived':
    'Only an archived record can be restored. Review its current status.',
  'problem.record.restoreTargetMissing':
    'This archived record has no safe previous status to restore. Contact the owner for review.',
  'problem.client.deleteHasProjects':
    'This client still has projects. Review those projects and archive the client instead if history must be kept.',
  'problem.client.deleteHasInvoices':
    'This client is referenced by invoice history. Archive the client instead of deleting it.',
  'problem.client.contactBillingHistory':
    'This contact is used by billing history and cannot be deleted. Update the active billing contact instead.',
  'problem.client.billingContactRequired':
    'Keep a billing email or another billing contact before removing this contact.',
  'problem.assignment.inactive':
    'This assignment is no longer active. Review the current assignment before making changes.',
  'problem.project.activeClientRequired':
    'The selected client is no longer active. Choose an active client or review its status.',
  'problem.project.managerUnavailable':
    'The selected project manager is no longer active. Choose an available manager.',
  'problem.project.deleteHasTime':
    'This project has time entries and cannot be deleted. Archive the project instead.',
  'problem.project.deleteHasExpenses':
    'This project has expenses and cannot be deleted. Archive the project instead.',
  'problem.project.deleteHasInvoices':
    'This project has invoices and cannot be deleted. Archive the project instead.',
  'problem.project.deleteHasDailyReports':
    'This project has daily field reports and cannot be deleted. Archive the project instead.',
  'problem.project.deleteHasTechnicalReports':
    'This project has technical reports and cannot be deleted. Archive the project instead.',
  'problem.billing.ownerRequired':
    'An owner must perform this billing action. Contact an owner to review the record.',
  'problem.billing.financeRequired':
    'Finance access is required for this billing action. Contact a finance administrator.',
  'problem.billing.idempotencyReused':
    'This request key was already used for different details. Review the existing record before submitting a new request.',
  'problem.billing.recordChanged':
    'This billing record or its sources changed while you were reviewing it. Review the current record before deciding what to do.',
  'problem.billing.approvedInvoiceRequired':
    'This invoice is no longer an unissued approved draft. Review its current state before recalculating or issuing.',
  'problem.billing.draftStateRequired':
    'The invoice has moved beyond the editable draft state. Review it before making another change.',
  'problem.billing.pdfNotReady':
    'The invoice PDF is still pending or failed. Check its artifact status before sending or downloading it.',
  'problem.billing.exportFailed':
    'This export failed. Review the pack status and request an authorized retry for this artifact.',
  'problem.billing.exportPending':
    'This export is still queued or running. Check the pack status before downloading.',
  'problem.billing.packFinal':
    'This accounting pack is final and cannot be changed. Review its existing artifacts or create a new revision.',
  'problem.billing.voidCollectionsPresent':
    'This invoice has collections. Review and reverse the applicable payments before an owner can void it.',
  'problem.billing.paymentBlocked':
    'The payment cannot be recorded against the invoice in its current state or for this amount or date. Review the invoice ledger and payment details.',
  'problem.billing.invoiceStateBlocked':
    'The invoice is not in a state that permits this action. Review its current state and history.',
  'problem.billing.issueConfigurationBlocked':
    'The invoice issuer, tax profile, or currency configuration is no longer ready for issuance. Ask Finance to review the setup.',
  'problem.billing.recalculationDetailsRequired':
    'Enter a reason and use the current invoice version before recalculating.',
  'problem.billing.adjustmentAmountBlocked':
    'The adjustment amount is invalid or exceeds the remaining amount on the original invoice. Review its credits and amount.',
  'problem.document.notFound':
    'This document is no longer available. Refresh the document list before continuing.',
  'problem.document.accessRequired':
    'You do not have permission to change this document. Contact its owner or an authorized administrator.',
  'problem.document.traceableImmutable':
    'This document is part of traceable history. Archive or supersede it through the permitted workflow.',
  'problem.document.changed':
    'The document changed while this form was open. Review its current state before trying another action.',
  'problem.document.archiveReasonRequired': 'Enter an archive reason of 3 to 500 characters.',
  'problem.time.weekChanged':
    'The week changed after you opened it. Review its current drafts before submitting.',
  'problem.time.linkedMealChanged':
    'A linked meal no longer matches its time entry. Review both drafts before submitting the week.',
  'problem.time.submissionChanged':
    'This time entry changed or is no longer a draft. Review its current state before submitting.',
  'problem.time.draftChanged':
    'This time entry changed while you were editing. Review the current draft before saving.',
  'problem.time.notEditableDraft':
    'Only an unlocked time draft that has never been submitted can be edited. Review the record or request a correction.',
  'problem.time.assignmentRequired':
    'An active project assignment must cover this work date. Contact the project owner to review access.',
  'problem.time.workerAssignmentRequired':
    'The selected worker has no active assignment covering this work date. Review the worker and date.',
  'problem.time.intervalOverlap':
    'This worker already has time recorded in the selected interval. Adjust the start or end time.',
  'problem.time.expenseRetryChanged':
    'This time and meal request was already used with different details. Review the saved drafts before trying again.',
  'problem.time.correctionDraftLocked':
    'This linked correction draft cannot be edited here. Review its correction record.',
  'problem.time.correctionRequired':
    'Reviewed time cannot be deleted. Open the record and request an audited correction.',
  'problem.time.lockedOrInvoiced':
    'Locked or invoiced time cannot be voided. Contact Finance for an audited adjustment.',
  'problem.time.allocatedReceipt':
    'This crew time is linked to an allocated receipt. Review the allocation and request a documented correction.',
  'problem.time.allocatedReceiptDateLocked':
    'The work date cannot change while this crew time is linked to an allocated receipt. Review the allocation and request a documented correction.',
  'problem.time.deleteChanged':
    'This time entry changed before deletion. Review its current state.',
  'problem.time.batchDuplicateDay':
    'The batch contains more than one entry for a day. Keep one entry per day and save again.',
  'problem.time.weekStartInvalid':
    'Select a week that starts on Monday, then review its drafts before submitting.',
  'problem.time.minutesInvalid': 'Enter a whole number of minutes between 0 and 1440.',
  'problem.time.dailyLimit':
    'This worker already has time on the selected day. Total time cannot exceed 24 hours.',
  'problem.time.intervalIncomplete': 'Enter both start and end time, or leave both empty.',
  'problem.time.intervalOrderInvalid': 'End time must be later than start time on the same day.',
  'problem.time.breakInvalid': 'Break minutes must be a whole number within the shift.',
  'problem.time.durationMismatch':
    'Recorded minutes must equal the time between start and end, less the break.',
  'problem.expense.submissionBlocked':
    'This expense changed, is no longer a draft, or requires a receipt. Review its current state and attach a receipt if required.',
  'problem.expense.notEditableDraft':
    'Only an unlocked expense draft can be edited. Review the record or request a correction.',
  'problem.expense.draftChanged':
    'This expense changed while you were editing. Review the current record before saving.',
  'problem.expense.receiptRequired': 'Attach a committed receipt before saving this expense.',
  'problem.expense.receiptAlreadyClaimed':
    'This receipt is already used by a project expense. Review the existing claim before submitting another.',
  'problem.expense.retryChanged':
    'This request ID was already used with different expense details. Review the saved expense before trying again.',
  'problem.expense.assignmentRequired':
    'An active project assignment must cover the expense date. Contact the project owner to review access.',
  'problem.expense.timeLinkInvalid':
    'The linked time entry must be active and match this worker, project, and date. Review the time entry.',
  'problem.expense.amountInvalid': 'Enter an expense amount greater than zero.',
  'problem.expense.receiptProjectMismatch':
    'This receipt does not belong to the selected project. Choose a receipt for this project.',
  'problem.expense.correctionDraftLocked':
    'This linked correction draft cannot be edited here. Review its correction record.',
  'problem.expense.allocatedReceiptLocked':
    'This receipt is allocated across crew shifts. Review the allocation and create a documented correction.',
  'problem.expense.receiptNotAvailable':
    'The selected receipt is unavailable or was not committed for your account. Attach a valid receipt.',
  'problem.expense.receiptAlreadyRegistered':
    'This receipt is already attached to another record. Review the existing claim before submitting another.',
  'problem.expense.deleteDraftOnly':
    'Only an expense draft that has never been submitted can be deleted. Review the record or request a correction.',
  'problem.expense.billedOrLocked':
    'Billed or locked expenses cannot be deleted. Contact Finance for an audited adjustment.',
  'problem.expense.deleteChanged':
    'This expense changed before deletion. Review its current state.',
  'problem.report.draftChanged':
    'This report changed while you were editing. Review the current version before saving.',
  'problem.report.submissionChanged':
    'This report changed or is no longer a draft. Review the current version before submitting.',
  'problem.report.correctionRequired':
    'Submitted or approved reports require an audited correction draft before editing.',
  'problem.report.finalized':
    'This report is part of a finalized report. Review the current record and request a versioned correction.',
  'problem.report.correctionDraftLocked':
    'This linked correction draft cannot be edited here. Review its correction record.',
  'problem.report.deleteDraftOnly':
    'Only a report draft that has never been submitted can be deleted. Review the report or request a correction.',
  'problem.report.reviewHistoryLocked':
    'This report has review history and cannot be deleted. Request an audited correction.',
  'problem.report.linkedTechnicalChanges':
    'This report has linked technical changes. Review those changes before deleting the draft.',
  'problem.report.deleteChanged': 'This record changed before deletion. Review its current state.',
  'problem.report.reviewStateChanged':
    'This report is no longer submitted for review. Open the current version before deciding.',
  'problem.report.projectNotActive':
    'The project is no longer active for report submission. Contact the project owner to review its status.',
  'problem.report.assignmentRequired':
    'An effective project assignment must cover the report date. Contact the project owner to review access.',
  'problem.report.safetyDetailsRequired':
    'Safety-related changes require validation and rollback details before saving.',
  'problem.finance.roleRequired': 'Finance access is required for this action.',
  'problem.approval.ownerReviewRequired':
    'This supplier time requires Owner review. Contact an Owner to decide it.',
  'problem.approval.reviewPermissionRequired':
    'You no longer have review access to this project. Contact a project reviewer.',
  'problem.approval.recordNotSubmitted':
    'This record is no longer submitted. Review its current status before deciding.',
  'problem.approval.recordChanged':
    'This record changed while you were reviewing it. Review the updated record before deciding.',
  'problem.approval.financeReviewUnavailable':
    'Finance review is no longer available for this record. Review its current approval and billing status.',
  'problem.approval.reasonRequired': 'Enter a reason before returning or rejecting this record.',
  'problem.approval.expenseClassificationRequired':
    'Classify this expense in Finance before recording Finance review.',
  'problem.finance.reimbursementConflict':
    'The worker reimbursement policy changed. Review the current policy before saving again; customer billing is separate.',
  'problem.finance.projectIssuingAuthorityRequired':
    'Set a project issuing authority effective on this expense date before classifying it.',
  'problem.finance.issuingCurrencyMismatch':
    'The project currency and issuing legal entity currency differ. Review the issuing authority before classifying this expense.',
  'problem.finance.workerReimbursementRequired':
    'Classify the expense and set its worker reimbursement before recording payment. Customer recovery is a separate decision.',
  'problem.finance.reimbursementFinalized':
    'This worker reimbursement was already finalized with different details. Review the recorded payment before making a correction.',
  'problem.finance.reimbursementUnavailable':
    'Only an approved worker-paid expense can be reimbursed. Review the expense status and payer.',
  'problem.finance.expensePayerTreatmentMismatch':
    'The payer and treatment conflict. Worker reimbursement applies only when the worker paid; customer-paid expenses need client-direct recovery.',
  'problem.finance.policyConflict':
    'This effective period overlaps an existing policy or assignment. Review the current periods before saving.',
  'problem.finance.compensationNotFinalized':
    'Finalize the worker compensation settlement before recording its payment.',
  'problem.finance.paymentRetryConflict':
    'This payment request was already used with different details. Review recorded worker payments before trying again.',
  'problem.finance.recordChanged':
    'This Finance record changed while the form was open. Review the updated record before saving again.',
  'problem.finance.expenseImmutable':
    'This expense has already entered billing or worker payment history. Review the record and use its correction path.',
  'problem.project.assignmentBlockedStatus':
    '{projectName} is {status}. New assignments are allowed only for Active, Planned, or Paused projects.',
  'problem.project.assignmentAllowedStatuses':
    'New assignments are allowed only for Active, Planned, or Paused projects.',
  'problem.project.unavailableOption': '{projectName} — {status} (unavailable for new assignments)',
  'problem.project.assignmentAdvanceWarning':
    'This project cannot receive new assignments while it is {status}. Review its status before continuing.',
  'problem.remedy.reviewProjectStatus': 'Review project status',
  'problem.remedy.contactOwner': 'Contact the project owner about its status.',
  'problem.field.summary': 'Review the {count} highlighted fields.',
  'problem.error.unexpected':
    'We could not confirm whether the action completed. Check the record before trying again. Reference: {correlationId}.',
  'problem.error.reference': 'Reference: {correlationId}',
  'problem.notice.actionNeeded': 'Action needed',
  'problem.notice.beforeContinue': 'Before you continue',
  'problem.notice.serviceUnavailable': 'Service temporarily unavailable',
  'problem.notice.saved': 'Changes saved',
  'problem.notice.checkSaveBeforeRetry':
    'Check whether the record was saved before submitting again.',
};

export function englishCoverageKey(key: string): string {
  return key.startsWith('action.') ? englishActionMessage(key) : (problemEnglish[key] ?? key);
}

export function translateCoverageKey(locale: 'es' | 'pt', key: string): string {
  const direct = (exact[key] ?? extraExact[key])?.[locale === 'es' ? 0 : 1];
  if (direct) return direct;
  if (key.startsWith('action.')) return actionMessage(locale, key);
  if (isCoverageInvariantKey(key)) return key;
  const explicit = explicitCoverageLiterals[key]?.[locale === 'es' ? 0 : 1];
  if (explicit) return explicit;
  throw new Error(`Missing explicit ${locale} coverage translation: ${key}`);
}

/**
 * Coverage audit primitive. A key is explicit when it is a technical display
 * invariant, has a complete literal entry, or is rendered by the semantic
 * action message templates above. This deliberately does not inspect the
 * translated output, so a mechanical word fallback cannot pass the audit.
 */
export function isExplicitCoverageTranslation(_locale: 'es' | 'pt', key: string): boolean {
  return (
    isCoverageInvariantKey(key) ||
    key.startsWith('action.') ||
    Boolean(exact[key] ?? extraExact[key] ?? explicitCoverageLiterals[key])
  );
}

export function coverageInvariantKeys(): ReadonlySet<string> {
  return invariantKeys;
}
