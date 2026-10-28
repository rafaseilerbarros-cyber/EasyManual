# EasyManual - Sistema Inteligente de Manuais de Aviação

![EasyManual Version](https://img.shields.io/badge/EasyManual-v2.4-amber)
![Firebase](https://img.shields.io/badge/Stack-Firebase%20%2B%20HTML5%20%2B%20Tailwind-red)

O **EasyManual** é um aplicativo de alta performance projetado para facilitar, acelerar e otimizar o acesso a manuais e documentos técnicos da aviação (FCOM, QRH, MEL, POH) para pilotos, tripulantes, estudantes de aviação e companhias aéreas.

---

## 🛠️ Tecnologia & Stack (STACK 01)
- **Hospedagem, Banco de Dados & Autenticação**: Firebase (Firebase Hosting, Firestore / Realtime DB, Google Auth)
- **Frontend**: HTML5, Tailwind CSS, Lucide Icons, Canvas SVG para Flow Map
- **Design Tokens & Palette**:
  - `Background`: `#040122` (Cockpit Night Dark)
  - `Texto Principal`: `#FFFFFF`
  - `Subtexto`: `#94A3B8`
  - `Accent Gold/Amber`: `#F59E0B`
  - `Accent Red`: `#E23B2E`
  - `Fontes`: Satoshi & Inter

---

## 📱 Telas & Módulos Implementados

### 1. Página Inicial (`screens/pagina-inicial.md`)
- Hero banner com imagem de alta definição ("Cockpit Wallpaper") e frase de efeito: *"Seus manuais a um click de distancia"*.
- 2º Bloco: Texto de síntese corporativa descrevendo a solução EasyManual.
- 3º Bloco: Gráficos e dados de confiabilidade obtidos com o grupo de testes operacionais (99.8% precisão, 4x mais rápido, 50.000+ páginas).
- 4º Bloco: Rodapé / baseline com e-mail de contato (`20150189@notredamecampinas.net.br`) e copyright.

### 2. Sobre Nós (`screens/sobre-nos.md`)
- Preserva o cabeçalho e identidade da marca.
- **Missão**: Simplificar, agilizar e modernizar o acesso aos manuais de aviação.
- **Visão**: Ferramenta onipresente na cabine e estudo de tripulantes.
- **Valores**: Agilidade Profissional, Segurança e Confiabilidade (auditada por SMEs), Acessibilidade no Aprendizado, Inovação em IA.
- **Problema vs Solução**: Resolução de gargalos operacionais em terra e em voo.

### 3. Login & Cadastro (`screens/login.md`, `screens/cadastro.md`)
- Formulários com validação, aceite de termos de segurança (*"I agree with the security terms"*), persistência do usuário e simulação de autenticação Firebase.

### 4. Alteração de Conta (`screens/alteracao-de-conta.md`)
- Configurações de conta onde o usuário pode atualizar seu nome, e-mail, senha e visualizar o plano ativo.

### 5. Planos & Tarifas (`screens/planos.md`)
- **Cards Interativos de Boarding Pass**: 6 cartões em formato de bilhete de embarque com animação 3D Flip (Passenger = Nome do perfil). Ao clicar no ticket, ele vira exibindo a descrição detalhada e o botão "Adquirir".
- **Planos Disponíveis**:
  1. *Entusiastas* - R$ 200,00/ano
  2. *Estudantes* - R$ 500,00/ano
  3. *Pilotos Operacionais* - R$ 1.000,00/ano (Mais Popular)
  4. *Escolas / CIACs* - R$ 22.500,00/ano
  5. *Táxi Aéreo* - R$ 250.000,00/ano
  6. *Companhias Aéreas* - R$ 600.000,00/ano
- **Tabela de Informações dos Planos**: Matriz comparativa de usuários, custo unitário e permissões dos módulos.
- **Modal de Checkout**: Simulação de aquisição que atualiza o plano no banco de dados.

### 6. Upload de Arquivos (`screens/upload-de-arquivos.md`)
- Gerenciador de base de conhecimento no estilo NotebookLM.
- Suporte a drag-and-drop para PDFs e documentos de aviação com indexação em tempo real.

### 7. Treinamento (`screens/treinamento.md`)
- Assistente interativo de estudo baseado em IA estilo **NotebookLM** (`notebooklm.google.com`).
- Responde perguntas com citações exatas da seção e página dos manuais carregados no Upload.

### 8. Chat de Busca (`screens/chat-de-busca.md`)
- Ferramenta de resposta rápida a panes em voo (ex: `ENG 1 FAIL`, `HYD BLUE SYS PRESS`, `AVIONICS SMOKE`).
- Mostra imediatamente no manual a localização da resposta e a lista de *Memory Items*.

### 9. Flow Map (`screens/flow-map.md`)
- Editor de fluxos de procedimento com layout visual de cockpit A320 (inspirado no `flowdeck.es`).
- Permite clicar sobre os painéis do cockpit para posicionar nós sequenciais (`#F59E0B`), desenha linhas bezier com setas dinâmicas e permite editar o texto da ação dentro de cada bolinha.
- Presets pré-carregados: *Cockpit Prep Flow* e *Before Start Flow*.

### 10. Estilo do Site & Navegação (`customs/cabecalho-do-site.md`, `customs/aba-lateral-esquerda-para-mudar-de-funcao.md`)
- **Cabeçalho**: Logo interativo, menu de navegação, status de login e botão de perfil.
- **Aba Lateral Esquerda**: Navegação rápida em IA entre os 4 módulos operacionais (*Upload*, *Treinamento*, *Chat de Busca*, *Flow Map*).

---

## 🚀 Como Executar Localmente
Basta abrir o arquivo [`index.html`](file:///C:/Users/Rafael/.gemini/antigravity/scratch/easymanual/index.html) em qualquer navegador moderno (Chrome, Edge, Firefox, Safari).

---

## ☁️ Como Deployar no Firebase Hosting
1. Instale o Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Realize o login no Firebase:
   ```bash
   firebase login
   ```
3. Publique a aplicação:
   ```bash
   firebase deploy
   ```

## Hero SkyElite em React e TypeScript

O hero e o menu móvel ficam em `src/skyelite.tsx`. As demais telas mantêm o funcionamento atual. O bundle `assets/skyelite.js` é versionado para que o `index.html` continue abrindo diretamente no navegador, sem servidor de build. Tailwind, fontes e vídeo continuam exigindo internet.

Para desenvolver: `npm ci`, `npm run typecheck` e `npm run build`. Após editar o TSX, gere e versione o bundle novamente.
