# Guia funcional de administração e finanças

## Comece aqui: escolha seu perfil

Este guia reúne os caminhos do Proprietário, de Finanças e do Auditor. Use o caminho correspondente à conta conectada. Procedimentos explicam como o fluxo funciona; eles não ampliam as permissões da conta.

- [Regras compartilhadas de identidade, sessão e registros de origem](#regras-compartilhadas-de-identidade-sessao-e-registros-de-origem)
- [Proprietário: administração, projetos, planejamento e aprovações](#proprietario-administracao-projetos-planejamento-e-aprovacoes)
- [Finanças: análise econômica, faturamento, caixa e remuneração](#financas-analise-economica-faturamento-caixa-e-remuneracao)
- [Pacotes contábeis: gerar, acompanhar e finalizar](#pacotes-contabeis-gerar-acompanhar-e-finalizar)
- [Auditor: evidências somente leitura e Auditoria global](#auditor-evidencias-somente-leitura-e-auditoria-global)
- [Preservar histórico, agir sobre feedback e obter suporte](#preservar-historico-agir-sobre-feedback-e-obter-suporte)
- [Matriz de permissões](#matriz-de-permissoes)

Acesso — Consulta: Proprietário, Finanças e Auditor em seus escopos autorizados separados. Criação: nenhuma neste capítulo de orientação. Aprovação: nenhuma. Alteração: nenhuma.

## Regras compartilhadas de identidade, sessão e registros de origem

Acesso — Consulta: cada perfil vê somente os registros de projeto, financeiros e de evidência permitidos para sua conta. Criação: Proprietário e Finanças criam registros em seus fluxos autorizados; Auditor não cria registro de origem. Aprovação: o fluxo responsável de Proprietário ou Finanças, nunca uma visão somente leitura. Alteração: rascunhos ou fluxos explícitos de correção; histórico finalizado permanece rastreável.

Use sua própria conta e abra **Ajuda** para o guia atual atribuído ao perfil. A **Caixa de atividades** leva a um registro de origem que você pode consultar; ler um aviso não é aprovar. Encerre a sessão em dispositivo compartilhado e nunca compartilhe senha, sessão ou código de recuperação. Passkeys e MFA opcionais são administrados em **Perfil**, quando disponíveis.

Confirme projeto, período, identificador, estado e datas de vigência antes de agir. Resumos financeiros derivam de registros de origem aprovados e regras com vigência. Previsão, cobrança esperada ou liquidação programada não são saldo bancário nem prova de pagamento. Jobs pendentes, documentos em quarentena e eventos bancários não confirmados continuam em estado inconclusivo.

<!-- screenshot:owner:home -->

## Proprietário: administração, projetos, planejamento e aprovações

Acesso — Consulta: Proprietário pode consultar registros administrativos, operacionais e financeiros entre projetos dentro da conta. Criação: Proprietário cria clientes, projetos, atribuições, autorizações de fornecedores e registros administrativos. Aprovação: Proprietário aprova ou solicita correções em registros operacionais autorizados e revisa horas de fornecedor; aceite do cliente continua sendo ação do cliente. Alteração: Proprietário altera administração, planejamento e rascunhos permitidos por ações datadas e auditáveis; retratos financeiros emitidos usam fluxos controlados de correção.

Crie o cliente com sua identidade de cobrança e use **Novo projeto** para informar nome, fuso do local, gerente, modelo de cobrança, início e fim planejado. Reabra o projeto salvo para conferir número e datas. Em **Projetos**, abra **Calendário de projetos**, navegue entre meses, selecione um dia e abra o evento da agenda. A data final do projeto é inclusiva; o fim de um turno com horário é exclusivo.

Em **Planejamento**, filtre projeto e colaborador, selecione uma data para preparar o formulário de atribuição ou selecione um turno existente para abrir seu editor. Compare atribuição ativa, disponibilidade em UTC e sobreposições antes de **Publicar atribuição**. Editar turno publicado é ação do Proprietário. Planejamento é trabalho esperado e nunca cria horas efetivas, remuneração, evidência de fatura nem aceite do cliente.

Use **Projetos → Equipe** para atribuições datadas e alterações de função; encerrar acesso preserva o histórico. Em **Fornecedores**, nomeie coordenador ou técnico externo e autorize cada instalação por datas de vigência. Um perfil restrito de fornecedor nunca recebe permissões de Finanças ou aprovação apenas porque o Proprietário consegue consultá-lo.

Em **Aprovações**, confira tempo, despesas e relatórios Diário ou Técnico / PLC enviados com suas evidências de origem. Aprove ou solicite correções com motivo factual. Horas originadas por fornecedor exigem análise do Proprietário. Preserve registros devolvidos por rascunhos de correção. O Proprietário administra aprovação operacional e limites administrativos; Finanças trata a parte econômica descrita abaixo.

<!-- screenshot:owner:planning-month -->
<!-- screenshot:owner:planning-editor -->
<!-- screenshot:owner:help -->

## Finanças: análise econômica, faturamento, caixa e remuneração

Acesso — Consulta: Finanças consulta Visão financeira, Projetos, Faturamento, Despesas, Relatórios, Recebimentos / livro, Contabilidade e Perfil autorizados. Criação: Finanças cria rascunhos financeiros, recebimentos, liquidações e pagamentos reais autorizados. Aprovação: Finanças aprova ou emite dentro do fluxo financeiro quando a ação estiver disponível; aprovação operacional e aceite do cliente continuam separados. Alteração: Finanças altera regras com vigência e rascunhos editáveis com motivo; faturas emitidas e pacotes finalizados exigem correção controlada ou nova versão.

Abra **Projetos** primeiro e confirme cliente, projeto e datas de vigência. Em **Configuração comercial**, confira entidade legal, fluxo de faturamento, perfil fiscal, tarifas e vigências. Altere apenas a regra e o período aprovados; configuração posterior não pode reescrever registros antigos. Disponibilidade em **Perfil** é contexto de planejamento UTC, não autorização para publicar turno nem regra de remuneração.

Em **Revisão econômica**, abra **Registros de origem** e concilie receita faturada, mão de obra direta, despesas e margem às linhas contribuintes. Revise remuneração e reembolso de colaboradores separadamente do faturamento do cliente. **Finalizar remuneração** fecha o cálculo revisado; não é transferência bancária.

Em **Faturamento**, resolva mensagens de prontidão com fontes aprovadas e aceite do cliente antes de criar ou emitir uma fatura. Confira entidade, moeda, numeração, impostos e linhas e revise o PDF gerado. Edite somente rascunho. Depois de emitida, use anulação, crédito/ajuste ou substituição controlados com motivo; nunca edite diretamente um retrato emitido.

Em **Recebimentos / livro**, vincule cada fatura emitida a recebimentos totais ou parciais com data real e referência. No **Calendário de caixa**, distinga cobrança esperada e liquidação programada do dinheiro efetivamente recebido ou pago. **Registrar pagamento real** exige transferência verdadeira com data, valor, moeda e referência. Pagamento parcial deixa saldo; **Estornar pagamento** acrescenta correção auditada.

<!-- screenshot:finance:finance -->
<!-- screenshot:finance:profile -->

## Pacotes contábeis: gerar, acompanhar e finalizar

Acesso — Consulta: somente Proprietário e Finanças consultam geração, artefatos, finalização e download de Pacotes contábeis. Criação: Proprietário ou Finanças cria pacote para período contábil permitido. Aprovação: Proprietário ou Finanças revisa e finaliza. Alteração: pacote finalizado não é editado; correção posterior exige nova versão. Auditor: não pode gerar, finalizar ou baixar artefatos de Pacote contábil neste limite.

Escolha projeto e período contábil e use **Gerar pacote** depois de conferir os registros de origem. O pacote reúne evidências revisadas de faturas, recebimentos, custos de pessoal e despesas do período. Trate os estados com veracidade: **Na fila** significa processamento pendente, **Processando** está em execução, **Pronto** permite baixar o artefato correspondente e **Falhou** exige a tentativa oferecida ou suporte. Falha de um artefato independente não torna outro arquivo indisponível em pronto.

Abra cada artefato **Pronto** e concilie período, linhas de origem e totais antes de **Finalizar**. A finalização congela essa versão revisada como evidência histórica. Correções posteriores nas fontes exigem outra versão do Pacote contábil; não sobrescreva nem substitua silenciosamente o pacote finalizado. Guarde o identificador do pacote e o estado do artefato ao relatar problema.

## Auditor: evidências somente leitura e Auditoria global

Acesso — Consulta: Auditor pode consultar vistas autorizadas de auditoria, Visão financeira, faturamento, Recebimentos / livro e evidências, além de **Auditoria** global. Criação: nenhum desses registros de negócio; Auditor não administra usuários nem configurações organizacionais de segurança. Aprovação: nenhuma. Alteração: nenhuma; até um pedido de correção é encaminhado ao Proprietário ou usuário de Finanças responsável. Idioma e controles de autenticação da própria conta continuam sujeitos aos controles de **Perfil** exibidos para ela. Geração, finalização e download de Pacotes contábeis continuam exclusivos de Proprietário/Finanças.

Comece pelo projeto, período, identificador e estado exibidos. Abra a origem e compare datas, ator, versão e evidências anexas. Em **Auditoria**, filtre a lista de eventos de acréscimo para verificar quem alterou o quê e quando. A Auditoria global está disponível para Proprietário e Auditor; Finanças não recebe essa autoridade global.

Hora aprovada, aceite do cliente, fatura emitida e pagamento confirmado são fatos separados. Não deduza um do outro. Um retrato financeiro gerado ou finalizado é evidência histórica; uma correção posterior não o apaga. Calendários e datas de planejamento dão contexto, não autoridade para publicar ou editar. Janelas de disponibilidade não são horas reais, e trabalho planejado não prova execução.

Se um registro, evento ou documento estiver fora da autorização, preserve a negativa no apontamento e peça análise delimitada ao Proprietário. Não use controle de edição indisponível, sessão de outra pessoa nem aprovação/pagamento de teste para investigar.

<!-- screenshot:auditor:audit -->
<!-- screenshot:auditor:help -->

## Preservar histórico, agir sobre feedback e obter suporte

Acesso — Consulta: Proprietário, Finanças e Auditor consultam somente registros permitidos pelo perfil. Criação: Proprietário ou Finanças cria correção, anulação, crédito, substituição, reversão ou nova versão de pacote quando autorizado; Auditor cria um apontamento, não uma mutação de origem. Aprovação: o fluxo responsável de Proprietário ou Finanças; Auditor não aprova. Alteração: somente rascunho editável e fluxos controlados de correção/nova versão; Auditoria de acréscimo e histórico emitido/finalizado são conservados.

Quando um controle rejeitar a ação, anote código ou motivo exibido, identificador de origem, projeto ou período, estado atual e próximo passo. Confira escopo, vigência, prontidão da fonte e versão antes de tentar novamente. Edição de disponibilidade desatualizada exige recarga e conciliação. Não troque pessoa, projeto, data ou período financeiro para limpar um aviso e não retroaja pagamento ou fatura.

Use **Ajuda** e o canal verificado de suporte **admin@j-aautomation.com** para problemas persistentes de acesso, fonte, artefato ou pagamento. Auditores devem incluir referência do evento ou da origem e a inconsistência exata. Proprietário e Finanças devem incluir período contábil, estado do artefato ou estado da fatura. Não envie credenciais nem dados de cliente sem relação. Auditoria e histórico de origem do portal permanecem como verdade do registro.

## Matriz de permissões

Acesso — Consulta: o escopo vigente e o limite de privacidade do perfil. Criação: somente registros e rascunhos autorizados pelo perfil. Aprovação: somente o limite explícito do revisor. Alteração: apenas rascunhos, configurações datadas e fluxos controlados de correção/nova versão.

- **Proprietário:** consulta, cria e altera administração, clientes, projetos, atribuições, autorizações de fornecedor, planejamento e registros operacionais; aprova envios operacionais autorizados e horas de fornecedor; administra usuários e segurança; acessa fluxos financeiros e Pacotes contábeis; consulta e usa Auditoria global.
- **Finanças:** consulta, cria e altera Revisão econômica, Configuração comercial, Faturamento, Recebimentos / livro, remuneração, pagamentos reais e Pacotes contábeis; aprova ou emite quando o fluxo financeiro permitir; não administra usuários do Proprietário, nomeia fornecedores nem usa Auditoria global.
- **Auditor:** consulta evidências autorizadas e Auditoria global em modo somente leitura; não cria projeto, atribuição, disponibilidade, aprovação, fatura, pagamento ou encerramento e não administra usuários nem configurações organizacionais de segurança; não aprova nem altera registros de negócio auditados. Idioma e controles de autenticação da própria conta continuam sujeitos ao **Perfil**. Ações e downloads de Pacotes contábeis continuam exclusivos de Proprietário/Finanças.

Conhecer um procedimento, ver um rótulo de navegação ou abrir um link de origem não concede a permissão correspondente.
