# Ativar autenticação e planos

O frontend passa a usar Firebase Authentication, Firestore e Storage no projeto Firebase que hospeda o site. As operações protegidas são Cloud Functions em `us-central1`. Stripe Checkout e Customer Portal cuidam da assinatura anual; o navegador nunca pode atribuir planos. Não há chave privada no frontend.

## Permissões anunciadas e implementadas

| Plano | Preço anual | Usuários no workspace | Arquivos | Módulos |
| --- | ---: | ---: | --- | --- |
| Entusiastas | R$ 200 | 1 | 1 | Upload e Busca |
| Estudantes | R$ 500 | 1 | Sem cota comercial | Upload, Busca e Treinamento |
| Pilotos Operacionais | R$ 1.000 | 1 | Sem cota comercial | Todos, incluindo Flow Map |
| Escolas / CIACs | R$ 22.500 | 30 | Sem cota comercial | Todos |
| Táxi Aéreo | R$ 250.000 | 500 | Sem cota comercial | Todos |
| Companhias Aéreas | R$ 600.000 | 2.000 | Sem cota comercial | Todos |

A cota de arquivos é compartilhada pelo workspace. Cada PDF/TXT pode ter até 20 MB. Uploads pendentes contam na cota para evitar concorrência; uploads abandonados expiram em uma hora, com limpeza a cada hora. As cotas dos serviços Firebase continuam aplicáveis.

Novas contas começam **sem plano ativo**. Login não concede assinatura. Contas de e-mail/senha precisam verificar o e-mail antes de comprar, enviar arquivos ou aceitar convites. Contas Google usam a verificação do provedor.

## Configuração do Firebase

1. Selecione o projeto Firebase usado pelo EasyManual; ative faturamento Blaze (Functions, Storage e agendamento exigem serviços faturáveis).
2. Em Authentication → Sign-in method, ative **E-mail/senha** e **Google**, informando o e-mail de suporte do projeto. Autorize os domínios do site em Authentication → Settings → Authorized domains. Configure os modelos de verificação e recuperação de senha.
3. Crie o banco Firestore `(default)` e o bucket padrão do Cloud Storage. Use regras deste repositório, não o modo de teste. Na primeira publicação, aceite a autorização para as regras do Storage consultarem o Firestore.
4. O Hosting fornece `/__/firebase/init.json` automaticamente com a configuração pública do projeto. Não crie um arquivo com credenciais particulares. Em outros provedores de hospedagem, forneça esse endpoint com os campos públicos `apiKey`, `authDomain`, `projectId`, `storageBucket` e `appId` do mesmo projeto. Nunca adicione service account ou secret Stripe.
5. Instale dependências com Node 22:

```bash
npm ci
npm ci --prefix functions
```

## Configuração do Stripe

Crie seis preços **recorrentes anuais em BRL**, sem período de teste, com os valores da tabela. Anote os IDs `price_...`. Comece em modo de teste e publique com chaves e preços do mesmo modo.

Armazene no Secret Manager pelo CLI do Firebase (os comandos abrem entrada interativa; não coloque valores na linha de comando nem no Git):

```bash
npx --prefix functions firebase functions:secrets:set STRIPE_SECRET_KEY --project SEU_PROJETO
npx --prefix functions firebase functions:secrets:set STRIPE_PRICE_IDS --project SEU_PROJETO
npx --prefix functions firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project SEU_PROJETO
```

`STRIPE_PRICE_IDS` é um objeto JSON com as seis chaves abaixo e os IDs reais dos preços:

```json
{
  "entusiastas": "price_...",
  "estudantes": "price_...",
  "pilotos": "price_...",
  "escolas": "price_...",
  "taxi": "price_...",
  "companhias": "price_..."
}
```

Na publicação, informe `APP_URL` como a origem HTTPS pública do site, sem barra no final (por exemplo, `https://SEU_PROJETO.web.app`). O Firebase CLI solicitará esse parâmetro e poderá criar um arquivo local de ambiente. Ele é ignorado pelo Git. Não use URL recebida do navegador para retorno do pagamento.

No Stripe, registre um webhook HTTPS apontando à URL retornada na publicação da função `stripeWebhook` (normalmente `https://us-central1-SEU_PROJETO.cloudfunctions.net/stripeWebhook`) e habilite:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Use o segredo de assinatura `whsec_...` desse endpoint em `STRIPE_WEBHOOK_SECRET`. Se precisar criar o endpoint depois da primeira publicação, atualize o segredo e publique novamente a função. A verificação criptográfica usa o corpo original da requisição. Uma visita a `?billing=success` nunca libera acesso.

Ative o Customer Portal no Stripe com os mesmos seis preços, pagamento obrigatório nas alterações que gerem cobrança e cancelamento ao fim do período. Não habilite preços alternativos, trials ou quantidades editáveis. Alterações de plano, dados de cobrança, faturas e cancelamento ficam em **Minha conta → Gerenciar assinatura e pagamentos**. Checkout recusa uma segunda assinatura ativa; tentativas repetidas reutilizam a mesma sessão. Um checkout em aberto bloqueia outro plano por até 35 minutos.

## Publicação

```bash
npm run build
npm test
npm run test:security
npx --prefix functions firebase deploy --project SEU_PROJETO --only functions,firestore,storage,hosting
```

O deploy é separado do merge do PR. Apenas publicar o HTML não habilita login/pagamentos: as funções, regras, provedores e segredos acima são necessários.

## Equipes, redução e cancelamento

O titular gera um código vinculado ao e-mail do convidado em Minha conta e compartilha-o manualmente. O convite dura 24 horas e só pode ser usado uma vez pela conta com aquele e-mail verificado. A entrada é transacional: dois convites não ocupam a última vaga ao mesmo tempo. O titular também ocupa uma vaga. O convidado precisa estar numa conta pessoal sem assinatura, arquivos ou outros membros; não há migração automática de conteúdo entre workspaces.

Somente o titular pode comprar/gerenciar assinatura, convidar ou remover membros. Membros usam os arquivos e o flow compartilhado; remoção revoga imediatamente o acesso no servidor. A conta removida cria um workspace pessoal sem plano no próximo login. O flow é salvo explicitamente pelo botão **Salvar flow no workspace**; a última gravação substitui o flow compartilhado atual.

`active` com período vigente é o único estado que concede módulos. `past_due`, `unpaid`, `incomplete`, cancelamento efetivo, expiração ou preço desconhecido bloqueiam acesso. Cancelamento ao fim do período conserva acesso até a data paga. A redução de plano preserva arquivos; acima da cota não permite novos uploads. Redução abaixo do número de membros bloqueia módulos até o titular remover usuários excedentes, mantendo o gerenciamento de conta acessível.

As respostas de treinamento e busca já existentes continuam sendo demonstrações locais. Este PR armazena os arquivos, controla acesso aos módulos e salva flows; não implementa extração/indexação dos PDFs nem inferência de IA. A tela de upload deixa essa condição explícita.

## Verificação

`npm test` verifica política de planos e comportamento do frontend com SDKs simulados. `npm run test:security` usa os emuladores reais Firestore/Storage (Java 17+ para firebase-tools 14) para verificar regras, concorrência de cotas/vagas, remoção, assinatura criptográfica dos webhooks e fluxos Stripe com API de pagamento simulada. Nenhum teste efetua cobrança ou depende de credencial real.

Antes de liberar produção, valide no ambiente de teste configurado: login Google com uma conta real, e-mail/senha e recuperação, verificação de e-mail, compra Stripe de teste, renovação com falha, cancelamento, troca de plano e isolamento entre duas contas. Esses testes externos não podem ser executados apenas com acesso ao repositório.
