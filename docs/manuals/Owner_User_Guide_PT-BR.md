# Guia do usuário — Proprietário e Financeiro

## Objetivo e limites das evidências

Este guia de referência em português do Brasil explica as telas operacionais disponíveis aos administradores Proprietário e Financeiro. Ele corresponde à versão atual do portal identificada no registro de validação. As figuras são capturas dessa versão com dados fictícios. Mostram controles e estados, nunca registros de produção. Uma captura serve para orientação; não autoriza uma ação nem comprova a conclusão de um evento de negócio. As capturas preservam os textos da interface original; as instruções e legendas deste guia estão em português do Brasil.

Use a página Ajuda do portal para acessar os guias atribuídos à sua conta e o canal de suporte verificado na sua mensagem de convite para problemas de acesso. Não envie senhas, códigos de recuperação, recibos privados ou documentos de clientes por e-mail ou chat.

## Perfis e limites de dados

| Perfil                     | Acesso típico                                                                                       | Limites importantes                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrador Proprietário | Administração completa de operações, comercial, financeiro, faturamento, encerramento e auditoria   | Proteja os dados comerciais e use os fluxos controlados de correção do histórico.                                                                                                              |
| Administrador Financeiro   | Financeiro, faturamento, caixa, contabilidade, relatórios e encerramento conforme atribuído         | Não recebe acesso à Auditoria apenas porque este guia descreve o procedimento do Proprietário.                                                                                                 |
| Gestor de projeto          | Coordenação, revisão, acompanhamento de períodos e planejamento dos projetos atribuídos             | O escopo do projeto e as datas de vigência das atribuições limitam o acesso; configuração comercial e contabilidade não são atividades gerais do gestor.                                       |
| Auditor somente leitura    | Consulta autorizada de evidências e auditoria                                                       | Não pode emitir, aprovar, editar, encerrar, tentar novamente, registrar pagamentos ou alterar a segurança.                                                                                     |
| Trabalhador                | Seu próprio trabalho atribuído, horas, relatórios, despesas, documentos, perfil e Minha remuneração | Não pode usar faturamento, financeiro, contabilidade, auditoria, acompanhamento administrativo ou encerramento. A remuneração dos trabalhadores e as tarifas dos clientes permanecem privadas. |

O catálogo de Ajuda distribui este PDF detalhado apenas aos perfis Proprietário e Financeiro. Esta matriz esclarece os procedimentos para a coordenação com gestores e auditores; não concede a eles permissão para baixar o guia ou executar uma ação.

## Navegação, acesso e segurança

Entre com sua própria conta. Use a busca e a navegação lateral no computador ou a navegação compacta no celular para acessar uma área autorizada. Selecione Idioma antes de preparar materiais destinados aos usuários e saia da conta em dispositivos compartilhados. A Caixa de atividades fica em `/app/notifications`; abrir uma notificação leva ao registro de origem permitido e pode marcá-la como lida.

Chaves de acesso e MFA estão disponíveis no Perfil. A MFA é opcional para todos os perfis e operações. Se ativá-la, cadastre o autenticador, verifique seu código atual e guarde os códigos de recuperação de uso único em local privado quando forem exibidos. Não cadastre um dispositivo compartilhado nem divulgue materiais de recuperação.

## Ajuda e Caixa de atividades

:::figure owner /app/help Ajuda mostra os guias disponíveis para o perfil conectado.

1. Abra **Ajuda** e selecione o idioma do guia.
2. Baixe apenas um guia atribuído ao perfil atual. Uma negativa de acesso é um limite de autorização, não um link a ser contornado.
3. Abra **Caixa de atividades** em `/app/notifications` e escolha uma notificação para consultar seu contexto de origem.
4. Confirme o projeto, o registro e os campos alterados antes de agir. Marcar uma notificação como lida confirma a leitura do item; não aprova seu registro de negócio.

As notificações por e-mail são entregues apenas a destinatários corporativos. A caixa de atividades continua sendo a referência do portal quando um e-mail atrasa, é rejeitado ou fica indisponível.

## Projetos, trabalhadores, atribuições e calendários de vigência

:::figure owner /app/projects Projetos e atribuições são registros com escopo definido, não uma fonte de divulgação de remuneração.

Use Projetos para selecionar o cliente, o projeto, os marcos, os contatos e o histórico de atribuições. Antes de alterar uma atribuição, confira o trabalhador indicado, o projeto, as datas de início e término, o trabalho planejado, a permissão de revisão e a versão atual. Atualizar uma atribuição preserva seu histórico; removê-la encerra sua vigência e não exclui definitivamente o registro histórico.

Use Planejamento para publicar uma atribuição de campo somente após a aprovação da capacidade e do projeto. Competências e disponibilidade podem orientar o planejamento, mas não devem divulgar a remuneração dos trabalhadores. Um trabalhador pode ser atribuído a vários projetos com funções, datas e jornadas diferentes; registre o trabalho efetivamente realizado na atribuição e na data corretas.

Regras comerciais, autoridade emissora, tarifas de clientes e custo interno total são determinados no Financeiro por projeto, trabalhador/categoria/atividade e data de vigência. Uma configuração posterior não deve reescrever o tratamento comercial de trabalhos anteriores. Confira o período de vigência antes de alterar qualquer tarifa, atribuição de entidade jurídica ou regra.

### Clientes e configuração do projeto

Abra **Projetos** e escolha a visualização Clientes para localizar o cliente, os contatos e os locais. Antes de adicionar ou alterar um contato, confirme o cliente, a finalidade operacional pretendida e se é um contato de faturamento. Uma atualização de contato não altera retroativamente o retrato histórico de uma fatura emitida.

Para criar um cliente, escolha **Novo cliente** e preencha os campos obrigatórios **Razão social**, **Nome de exibição**, **Moeda**, **Fuso horário**, **Endereço de faturamento** e **Prazo de pagamento (dias)**. Adicione **Código do cliente**, **Nome do contato de faturamento**, **E-mail do contato de faturamento**, **Pedido de compra / referência** e **Observações** somente quando conhecidos. Selecione **Criar cliente**. Para corrigir um cadastro atual, use o formulário de atualização exibido para aquele cliente; ele inclui a versão do registro apresentada, de modo que um envio desatualizado é rejeitado em vez de sobrescrever a alteração de outro administrador.

Abra o registro do projeto antes de alterar marcos, cronograma, equipe ou documentos de origem destinados ao cliente. Confirme o número do projeto, o estado e as datas. Use **Criar marco** apenas para uma entrega aprovada. O registro do projeto fornece contexto; não autoriza transferir trabalho, tarifas ou faturas de outro projeto.

Para criar um projeto, escolha **Novo projeto**, selecione o **Cliente** e defina **Nome**, **Código do centro de custo**, Descrição, Moeda, Gestor do projeto, **Modelo de faturamento**, **Fuso horário do local**, Data de início, Data prevista de término, Horas previstas por dia e Horas mínimas diárias do cliente. Defina **Tipo de orçamento** e somente os campos de orçamento/limite aprovados. Escolha **Criar projeto** e reabra-o para confirmar o número exibido. Use **Salvar projeto** apenas para corrigir os campos atuais. Arquive somente após a decisão autorizada de encerramento/retenção; arquivar não substitui o encerramento de faturas, registros ou entrega final.

### Atribuições da equipe: vários trabalhadores no mesmo projeto

Use a visualização Equipe para buscar por **Nome, função ou projeto** e abrir a atribuição ativa do trabalhador. No mesmo projeto, cada trabalhador pode ter minutos planejados, datas de vigência e configuração comercial de remuneração diferentes. **Atribuir trabalhador** cria uma atribuição de trabalhador; o gestor é configurado separadamente no projeto.

1. Confirme que o Trabalhador A e o Trabalhador B têm, cada um, uma atribuição ativa no mesmo projeto, com suas próprias datas de início e término. Não reutilize o identificador da atribuição nem as datas de um trabalhador para outro.
2. Crie a atribuição com **Data de início** e, opcionalmente, **Data de término**. Use **Atualizar atribuição** para alterar as datas, os **Minutos planejados** e, quando permitido, **Pode revisar**. Salve cada trabalhador separadamente.
3. Abra Financeiro → Comercial e use **Criar regra de remuneração** para esse mesmo projeto. Para o Trabalhador A, selecione **Trabalhador**, **Escopo do projeto** (o mesmo projeto, não o padrão global), **Moeda**, **Tipo de regra**, **Base de cálculo**, o **Valor por hora** visível ou o valor diário e **Vigente a partir de**. Salve a regra somente após conferir o valor decimal e a data. Use os controles de ciclo de vida da regra para substituir ou encerrar uma regra existente.
4. Crie uma regra de remuneração separada para o Trabalhador B, com seus próprios Trabalhador, Escopo do projeto, Moeda, Tipo de regra, Base de cálculo e datas de vigência. Use o campo de percentual visível apenas para uma regra percentual; não coloque uma porcentagem no campo de valor por hora ou diário.
5. Revise o histórico resultante de políticas e atribuições. As regras de mão de obra do cliente e de custo interno total têm formulários próprios e não substituem uma regra de remuneração do Trabalhador. Se um registro passado de trabalho realizado estiver incorreto, use seu fluxo de correção; não retroaja uma nova configuração para alterar silenciosamente a verdade histórica.

Exemplo de configuração: um projeto tem o Trabalhador A atribuído como técnico de campo de 1 a 30 de setembro, com uma regra de remuneração de **25,00** por hora, e o Trabalhador B como especialista em controles de 15 a 30 de setembro, com uma regra de **180,00** por dia cuja Base de cálculo é **diária**. As horas efetivamente trabalhadas permanecem factuais e separadas. As regras de mão de obra do cliente e de custo interno total usam formulários separados, e nenhum desses valores deve ser copiado para o formulário de remuneração. O Proprietário verifica o escopo e as datas de vigência de cada regra antes da aprovação. Este é um padrão de configuração, não uma afirmação de que algum trabalhador foi pago ou de que uma fatura foi emitida.

### Planejamento e disponibilidade

Em **Planejamento**, selecione o projeto, o trabalhador, a data da atribuição e a duração planejada antes de **Publicar atribuição**. Primeiro compare a janela de disponibilidade do trabalhador e as atribuições existentes. Publicar o planejamento não cria horas efetivamente trabalhadas. Na área de gestão de Equipe/Perfil, salve a alteração de disponibilidade com sua janela; disponibilidade é um dado operacional e nunca expõe remuneração ou tarifas de clientes.

## Horas, despesas, aprovações e correções

:::figure owner /app/time Horas registra o trabalho realizado; jornadas previstas e mínimos faturáveis não criam horas reais.

Revise Horas por projeto e período. Confira as evidências de origem, as datas, a duração efetiva e a atribuição aplicável antes de aprovar. Jornada prevista, mínimo do cliente e tratamento de deslocamentos podem afetar cálculos comerciais posteriores, mas nunca alteram o tempo factual trabalhado.

Revise Despesas com o pagador real, recibo, categoria, moeda, projeto, justificativa profissional e tratamento comercial. Um reembolso e uma cobrança ao cliente podem seguir regras separadas. Itens devolvidos exigem uma correção fundamentada; o histórico aprovado permanece rastreável, sem ser sobrescrito silenciosamente.

Use Aprovações para abrir a fila pertinente, examinar as evidências de horas/relatório/recibo e aprovar ou devolver com uma observação factual. A aprovação operacional é uma revisão interna. Não é aceite do cliente, assinatura do cliente, comprovante de recebimento nem evidência de transferência.

### Procedimento de horas

Em **Horas**, selecione o projeto e o período, abra o registro e compare a data do serviço, atividade, duração efetiva, atribuição e relatório de suporte. Escolha o controle visível de aprovar ou devolver somente após conferir a fonte. Ao devolver, informe o motivo factual que esclareça ao Trabalhador o que corrigir. Em uma correção de histórico aprovado, preserve o motivo e a referência ao original em vez de criar uma substituição indistinguível.

### Procedimento da fila de aprovações

Em **Aprovações**, escolha a fila **Horas**, **Aprovações de projeto** ou **Revisão financeira** correspondente ao registro. Abra o registro, leia suas evidências e o estado exibido e aprove ou devolva com uma observação factual. Não use uma ação da fila para testar uma tela. Uma ação interna bem-sucedida não assina um relatório do cliente, emite uma fatura, agenda remuneração nem realiza uma transferência.

### Procedimento de despesas

Em **Despesas**, abra o item enviado e confira **Projeto**, **Data**, **Categoria**, **Valor**, **Moeda**, **Pagador**, justificativa profissional e recibo. Confirme se o tratamento comercial e o tratamento de reembolso são adequados antes da aprovação. Para um item devolvido, indique a correção necessária. Não altere um recibo original apenas para mudar um resultado financeiro.

## Documentos privados, anexos de relatórios e envio de arquivos

:::figure owner /app/documents O acesso a documentos privados é verificado antes do armazenamento e a cada download.

Use Documentos apenas para arquivos autorizados do projeto. Confirme o projeto, o público destinatário, a classificação do arquivo e sua sensibilidade antes de enviar. O sistema registra metadados seguros de armazenamento e dados de integridade. Um arquivo pode ficar em quarentena ou aguardando verificação antes de estar disponível; não trate o envio como concluído e compartilhável até que seu estado exibido permita isso.

Se um envio for rejeitado, ficar indisponível ou falhar, mantenha o original, leia o erro exibido, corrija o arquivo ou a conexão e tente novamente apenas pelo mesmo fluxo autorizado. Não crie evidências duplicadas nem envie credenciais, materiais de clientes sem relação com o registro, recibos alterados ou um arquivo privado apenas para preencher uma tela. Os downloads continuam sujeitos à autorização por perfil e objeto.

Os anexos de relatórios Diários e Técnicos / PLC têm seus próprios tipos permitidos. Anexe apenas evidências factuais do trabalho. Um PDF de relatório ou documento de assinatura anexado deve corresponder exatamente ao arquivo e ao hash exibidos para a versão selecionada do relatório.

## Relatórios, conformidade do cliente e acompanhamento de períodos

:::figure owner /app/reports/review A revisão de períodos agrupa os registros de períodos do cliente por projeto e intervalo de datas.

Use **Relatórios** para registros diários e técnicos. Use **Revisão de períodos** em `/app/reports/review` para escolher o projeto autorizado e o intervalo de datas, examinar a cobertura das fontes, o estado do relatório, a versão e o hash do retrato histórico e abrir o relatório específico do período.

:::figure owner /app/reports/period/:id Um relatório de período do cliente identifica o retrato histórico exato antes do registro de assinatura ou acompanhamento.

A sequência correta de conformidade do cliente é:

1. Revise e aprove o conteúdo operacional pelo fluxo de revisão permitido.
2. Gere ou confirme o PDF atual do cliente. Confira se o PDF está pronto e se sua versão e seu SHA-256 correspondem ao relatório que será enviado.
3. Envie ou apresente exatamente esse PDF pelo processo de negócio aprovado. Registrar um e-mail ou acompanhamento não é uma assinatura do cliente.
4. Registre a conformidade do cliente somente a partir de evidência real de cópia assinada vinculada ao mesmo retrato histórico/hash, com o signatário e a data reais. Nunca invente uma assinatura nem reutilize evidências de outra versão.
5. Se o relatório for atualizado, a assinatura e o acompanhamento anteriores ficam desatualizados para o novo retrato histórico. Obtenha um novo arquivo assinado válido quando a conformidade for exigida.

O acompanhamento de períodos registra um dos tipos de evento exibidos, que só podem ser acrescentados: **Compartilhado**, **Exportado**, **Aguardando signatário indicado**, **Devolvido** ou **Contestado**. Informe o método/data/referência de envio exigidos para Compartilhado ou Exportado, o signatário indicado para Aguardando signatário indicado ou o motivo para Devolvido/Contestado; selecione o funcionário responsável, a próxima data de acompanhamento e a chave de nova tentativa. Compartilhado/Exportado é uma declaração da equipe sobre o envio, não um e-mail ao cliente enviado por esta funcionalidade nem evidência de assinatura. Cada evento está vinculado ao retrato histórico exato. Um gestor só pode registrar acompanhamento de um projeto atribuído com permissão de revisão; Trabalhadores não têm acesso a esse fluxo administrativo.

## Configuração comercial e simulação

:::figure owner /app/finance?view=commercial A configuração comercial tem datas de vigência e é controlada pelo proprietário e pelo financeiro.

Abra Financeiro na visualização Comercial. Selecione o projeto correto e examine a política comercial, os fluxos de faturamento, a entidade jurídica, o perfil tributário, a política de numeração de faturas e as tarifas antes de alterar qualquer item. As datas de início e término de vigência devem refletir a decisão de negócio aprovada. As atribuições anteriores de entidade jurídica e os registros emitidos permanecem como evidências históricas.

Use **Acordo comercial e exemplo** em `/app/finance/preview` para uma ilustração de cálculo editável de um único trabalhador em um único dia de trabalho. Seus campos abrangem remuneração por hora, custo horário total incluindo remuneração, horas reais/de referência/mínimas, a responsabilidade selecionada pelas despesas, horas extras opcionais, alternativa de preço fixo e periodicidade de faturamento de exemplo. Os valores editáveis não são tarifas de projeto salvas nem configuração de projeto. A simulação não modela deslocamentos, remuneração percentual, limites, impostos ou mínimos com tarifas mistas; revise esses pontos na configuração comercial vigente do projeto. O resultado é antes dos impostos e não registra pagamento, fatura, aceite do cliente ou confirmação bancária.

## Faturamento, faturas emitidas e correções

:::figure owner /app/billing O faturamento começa com registros de origem validados e um rascunho, não com uma fatura emitida.

1. Em **Faturamento**, selecione o fluxo e o período. Resolva as mensagens de prontidão: fontes faturáveis aprovadas, limites do período, entidade jurídica/perfil tributário, moeda, limites, tarifas e eventual aceite obrigatório do cliente.
2. Crie ou revise o rascunho. Confirme destinatário, pedido de compra/referência, itens, valores exatos, tratamento tributário e condições de pagamento. Use a prévia/PDF dos detalhes do rascunho para conferir o documento pretendido.
3. Emita somente após a revisão autorizada. A emissão consome o número controlado e cria um retrato histórico imutável; alterações posteriores de cliente, contato ou tarifa não o reescrevem.
4. Envie apenas pela ação de entrega autorizada e confira o estado resultante. O e-mail pode se limitar a destinatários corporativos; um evento na caixa de saída não comprova que o cliente recebeu ou aceitou a fatura.
5. Registre um pagamento somente com evidência de pagamento oficial. Pagamento parcial, vencido e pago são estados da fatura/do registro financeiro. Uma previsão financeira ou data de caixa não é um saldo bancário.

Para um erro após a emissão, use o ciclo de cancelamento, crédito, ajuste ou substituição disponível, com motivo e data de vigência. Não edite nem exclua um retrato histórico emitido. Um estorno de pagamento também exige o fluxo controlado de estorno e uma data real de vigência; ele não apaga o evento original de pagamento.

### Sequência de controle de faturas

No registro de Faturamento, use **Criar rascunho de fatura** apenas após resolver as mensagens de prontidão. Nos detalhes do rascunho, use **Salvar detalhes** para campos exclusivos do rascunho, como número do pedido de compra, desconto, dados bancários, beneficiário e aviso de atraso; reabra **Prévia** e **Abrir PDF** para revisar o documento. Use **Aprovar fatura**, **Emitir fatura**, **Registrar pagamento**, **Estornar pagamento**, **Cancelar fatura** e **Criar ajuste** somente no estado correspondente do ciclo de vida e com evidências reais. **Enviar fatura** é uma ação da fatura; confira o registro/estado resultante da caixa de saída, que por si só não demonstra aceite do cliente ou recebimento confirmado.

### Procedimento de remuneração e reembolso

A remuneração dos trabalhadores é configurada e revisada como dado financeiro interno, separadamente do faturamento ao cliente. Em Financeiro → Comercial, selecione o projeto e confira o escopo de trabalhador/categoria/atividade, a tarifa exata e as datas de vigência de cada regra de remuneração. Minha remuneração pode mostrar os estados estimado, aprovado, agendado, finalizado ou pago apenas para aquele Trabalhador. **Finalizado** representa a remuneração definitiva calculada, não a confirmação de uma transferência; **Pago** exige uma data real de pagamento registrada. O reembolso também é distinto do tratamento da despesa no faturamento ao cliente. Nunca use o demonstrativo de um trabalhador para avaliar a remuneração de outro.

## Financeiro, calendário de caixa e registro de cobranças

:::figure owner /app/finance/cash O calendário de caixa separa eventos reais de caixa de itens previstos e pendentes.

A visão geral do Financeiro e a Revisão econômica mostram os dados econômicos internos do projeto no escopo e período selecionados. Trate receita, custo, margem, remuneração dos trabalhadores e orçamentos de projeto como confidenciais. Concilie as visualizações com os registros de origem aprovados antes de confiar em um total agregado.

Use **Calendário de caixa** em `/app/finance/cash` para filtrar por intervalo de datas, projeto e agrupamento. Ele apresenta itens relacionados ao caixa com datas e links para suas fontes. Previsão, liquidação agendada, recebimento esperado e remuneração finalizada não comprovam que houve transferência bancária. Caixa não é saldo bancário; use evidências bancárias/de pagamento confirmadas para a conciliação.

Use **Cobranças / registro financeiro** em `/app/ledger` para filtrar registros de faturas, custos e recebimentos, revisar pagamentos parciais e estornos e exportar apenas para um destinatário autorizado. Concilie o registro com a evidência bancária oficial antes de considerar um recebimento confirmado.

## Pacotes contábeis e tarefas em segundo plano

:::figure owner /app/accounting Os pacotes contábeis mostram separadamente o estado de cada exportação.

Crie um Pacote contábil apenas para o período autorizado selecionado, após a conciliação. A solicitação coloca o trabalho na fila do serviço; usuários comuns nunca executam tarefas manualmente. **Na fila** significa aceito para processamento, **em processamento** significa que o serviço está trabalhando, **pronto** significa que aquele arquivo pode ser baixado e **falhou** significa que nenhum arquivo foi fabricado para o formato que falhou.

Revise os formatos independentemente. Um PDF pronto não torna um XLSX pronto, e uma exportação com falha não invalida outra pronta. Use o controle indicado de nova tentativa apenas para um formato em estado final de falha e após corrigir a causa; preserve o erro e o contexto de auditoria. Finalizar um pacote exige as exportações obrigatórias e a conciliação e não confirma transferência bancária.

## Encerramento do projeto, pacote do cliente e reabertura

:::figure owner /app/projects/:id/closeout As revisões de encerramento preservam o público selecionado e as evidências de origem.

Abra a página Encerramento do projeto. Selecione apenas documentos do cliente elegíveis, limpos/permitidos e referências de períodos aceitos elegíveis. O pacote do cliente exclui dados financeiros internos e arquivos não autorizados/privados. Prepare o rascunho, examine os resumos dos pacotes interno e destinado ao cliente e atualize o rascunho se a seleção de fontes autorizadas mudar.

A confirmação do cliente é uma declaração controlada de encerramento, separada da aprovação operacional e da cópia assinada de um período do cliente. Registre-a apenas quando a confirmação real de negócio existir. A finalização congela uma revisão imutável e seus arquivos para download destinados ao público correto. Um download ZIP é um arquivo da revisão, não uma permissão para distribuí-lo fora do público previsto.

Se for necessário trabalho posterior, use **Reabrir** com o motivo obrigatório. A reabertura cria uma revisão subsequente; não altera um pacote finalizado. Revise a lista de fontes, os hashes e o público da nova revisão antes de finalizá-la.

## Auditoria, suporte e recuperação segura

Proprietários podem usar Auditoria para examinar eventos de segurança e financeiros que só podem ser acrescentados. Auditores usam apenas suas visualizações autorizadas de leitura. Um evento de auditoria ajuda a explicar uma ação controlada; não pode ser editado para se tornar comprovante de aceite ou pagamento.

### Procedimento de Auditoria e Perfil

Em **Auditoria**, filtre ou localize o evento pertinente e compare sua ação, entidade, autor, data/hora e detalhes com o registro em análise. A auditoria só permite acrescentar eventos; não tente editar, remover ou recriar um evento. Em **Perfil**, gerencie apenas seu próprio idioma, chaves de acesso e MFA opcional. Cadastre uma chave de acesso somente em um dispositivo pessoal apropriado. Ao ativar MFA, conclua **Verificar MFA** com o código do autenticador e guarde os códigos de recuperação exibidos em local privado. Alterações de Perfil nunca concedem um perfil financeiro, de faturamento ou de auditoria.

Se um controle necessário estiver ausente, uma rota retornar erro de autorização, um envio for bloqueado, uma figura diferir da tela atual ou um valor divergir de evidências aprovadas, pare e use o canal de suporte verificado na mensagem de convite. Não contorne o controle de acesso por perfil, não fabrique aceite do cliente, não execute uma tarefa manualmente e não faça uma alteração financeira para testar o portal.
