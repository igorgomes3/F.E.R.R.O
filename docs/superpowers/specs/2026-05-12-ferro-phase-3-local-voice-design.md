# F.E.R.R.O Fase 3: Voz Local Robusta

## Objetivo

Adicionar entrada por voz local e nativa ao F.E.R.R.O, sem depender de servicos cloud ou do Handy, para que o jogador possa registrar memoria tatica e executar comandos simples durante a partida.

O resultado esperado e: o usuario fala `Ashe flashou`, o F.E.R.R.O transcreve localmente, registra o timer na memoria tatica e mostra feedback claro de gravacao, transcricao e resultado.

## Decisoes aprovadas

- Backend STT: `whisper.cpp` como binario local.
- Instalacao: instalador interno com override manual para executavel e modelo.
- Modos de entrada: push-to-talk e toggle como modos de primeira classe.
- Escopo de voz: memoria tatica + comandos simples do app.
- Fora de escopo: modo assistente geral via LLM por voz.

## Principios

- Voz e canal de entrada, nao uma nova logica de memoria.
- A transcricao deve alimentar o mesmo parser textual ja usado pela memoria tatica.
- O sistema deve falhar de forma explicita: sem microfone, sem modelo, transcricao vazia, conflito de hotkey e erro do whisper devem aparecer para o usuario.
- O backend STT deve ser substituivel no futuro sem reescrever hotkeys, UI ou roteamento.
- Durante a partida, o fluxo deve priorizar baixa friccao e previsibilidade, nao conversa aberta com LLM.

## Arquitetura

Fase 3 adiciona um subsistema de entrada de voz ao lado do TTS existente.

### Componentes principais

- `SttService`: valida configuracao do whisper.cpp, executa transcricao sobre arquivo WAV e retorna transcript normalizado ou erro estruturado.
- `WhisperInstallerService`: baixa, extrai e verifica o binario whisper.cpp e um modelo recomendado, seguindo o padrao existente do instalador do Piper.
- `AudioCaptureService`: inicia e para gravacao local em arquivo WAV temporario, impede gravacoes sobrepostas e limpa arquivos temporarios quando possivel.
- `VoiceInputController`: orquestra hotkeys globais, captura, STT, roteamento, status e eventos para o renderer.
- `VoiceCommandRouter`: processa transcricoes. Primeiro tenta comandos simples do app; se nao houver comando, envia o texto para `Engine.handleTacticalCommand`.
- UI de voz: mostra estado de instalacao, paths configurados, modo ativo, hotkeys, status de gravacao/transcricao, ultimo transcript e ultimo resultado.

### Fluxo de dados

```text
global hotkey -> AudioCaptureService -> WAV temporario -> SttService/whisper.cpp -> transcript -> VoiceCommandRouter -> comando app ou memoria tatica -> feedback UI
```

## Configuracao

Adicionar configuracao persistida para voz de entrada:

```ts
voiceInput: {
  enabled: boolean;
  mode: "push_to_talk" | "toggle";
  pushToTalkHotkey: string;
  toggleHotkey: string;
  stt: {
    provider: "whisper_cpp";
    executablePath: string;
    modelPath: string;
    language: "pt" | "en" | "auto";
    threads: number;
  };
}
```

Defaults sugeridos:

- `enabled`: `false` ate o usuario configurar/instalar.
- `mode`: `push_to_talk`.
- `pushToTalkHotkey`: `Alt+Space`, sujeito a validacao de conflito.
- `toggleHotkey`: `Alt+Shift+Space`, sujeito a validacao de conflito.
- `language`: `pt`.
- `threads`: valor conservador baseado em CPU, com fallback para `4`.

## Instalacao do whisper.cpp

O instalador deve seguir a experiencia do Piper:

- Acao explicita na UI para instalar/baixar.
- Progresso por etapas: baixando binario, extraindo, baixando modelo, verificando, concluido ou erro.
- Paths configuraveis manualmente para usuarios avancados.
- Verificacao deve checar se o executavel existe, se o modelo existe e se um comando de versao/help responde.
- O modelo recomendado deve priorizar latencia e qualidade suficiente para comandos curtos. A escolha inicial deve ser um modelo pequeno/base quantizado compativel com whisper.cpp.

O instalador nao deve bloquear a possibilidade de usar paths manuais.

## Captura de audio

O `AudioCaptureService` deve expor uma interface pequena:

```ts
type AudioCaptureSession = {
  id: string;
  startedAt: string;
  outputPath: string;
};

startRecording(): Promise<AudioCaptureSession>;
stopRecording(sessionId: string): Promise<{ outputPath: string; durationMs: number }>;
cancelRecording(sessionId: string): Promise<void>;
```

Regras:

- Nao permitir duas gravacoes simultaneas.
- Toggle deve ignorar novo start se ja estiver gravando e tratar o hotkey como stop.
- Push-to-talk deve iniciar no key down e parar no key up.
- Gravacoes muito curtas devem retornar erro amigavel, nao chamar STT.
- Falhas de permissao/microfone devem atualizar status e renderer.

## Hotkeys

O `VoiceInputController` registra hotkeys globais usando recursos do Electron.

Estados minimos:

- `disabled`: voz desativada ou configuracao incompleta.
- `idle`: pronta para gravar.
- `recording`: capturando audio.
- `transcribing`: aguardando whisper.cpp.
- `routing`: aplicando transcript ao comando/memoria.
- `error`: erro recuperavel exibido ao usuario.

Regras:

- Registrar hotkeys apenas quando voz estiver habilitada e configuracao valida.
- Se uma hotkey falhar por conflito, manter voz desativada e mostrar mensagem acionavel.
- Reconfigurar hotkeys quando settings mudarem.
- Remover hotkeys no shutdown do app.

## STT

`SttService` deve construir a chamada ao whisper.cpp sem expor detalhes ao resto do app.

Entrada:

```ts
transcribe(inputPath: string, options: { language: "pt" | "en" | "auto"; threads: number }): Promise<SttResult>;
```

Saida:

```ts
type SttResult =
  | { ok: true; transcript: string; durationMs: number }
  | { ok: false; errorCode: "missing_executable" | "missing_model" | "empty_audio" | "empty_transcript" | "process_failed" | "timeout"; message: string };
```

Regras:

- Normalizar whitespace do transcript.
- Tratar transcript vazio como erro recuperavel.
- Impor timeout para evitar processo travado.
- Logar stderr/stdout de forma sanitizada, sem paths sensiveis desnecessarios.
- Nao chamar LLM para corrigir transcricao nesta fase.

## Roteamento de comandos

`VoiceCommandRouter` recebe texto transcrito e retorna resultado estruturado.

Ordem:

1. Comandos simples do app.
2. Memoria tatica via `Engine.handleTacticalCommand`.

Comandos simples iniciais:

- `resetar memoria`, `limpar memoria`: chama reset da memoria tatica.
- `silenciar voz`, `mutar voz`: desativa TTS ou altera estado equivalente ja existente.
- `ativar voz`: reativa TTS se possivel.
- `status`: responde com estado resumido de voz/STT/memoria.

Se nao reconhecer comando de app, o texto vai para memoria tatica. Isso permite frases como:

- `Ashe flashou`
- `Zed sem ult`
- `Quem esta sem flash?`

Comandos de app devem ser deterministas. Nao usar LLM para decidir o comando nesta fase.

## UI e feedback

Adicionar area de voz nas configuracoes e um indicador compacto no dashboard.

Configuracoes:

- Toggle para habilitar voz.
- Botao instalar whisper/modelo.
- Campos de path para executavel e modelo.
- Seletores de modo, hotkeys, idioma e threads.
- Botao de teste de microfone/transcricao curta.
- Status de instalacao e ultima falha.

Dashboard:

- Indicador: `Voz: pronta`, `gravando`, `transcrevendo`, `erro`.
- Ultima transcricao.
- Ultimo resultado roteado, por exemplo `Anotado: Ashe flash volta...`.

Feedback deve ser visual primeiro. Feedback sonoro pode ser adicionado apenas se nao conflitar com TTS da partida.

## IPC e eventos

Novos canais sugeridos:

- `voice-input:status:get`
- `voice-input:settings:update`
- `voice-input:install`
- `voice-input:install-progress`
- `voice-input:test-transcribe`
- `voice-input:start-recording`
- `voice-input:stop-recording`
- `voice-input:cancel-recording`

Eventos para renderer:

- `voice_input_status`
- `voice_input_transcript`
- `voice_input_result`
- `voice_input_error`

## Erros e recuperacao

Erros devem ser especificos e acionaveis:

- Binario ausente: pedir instalar ou configurar path.
- Modelo ausente: pedir instalar ou configurar path.
- Hotkey conflitante: pedir escolher outra hotkey.
- Microfone indisponivel: pedir permissao ou dispositivo.
- Audio curto demais: pedir segurar por mais tempo.
- Transcript vazio: mostrar que nada foi entendido.
- Processo whisper falhou: mostrar mensagem resumida e logar detalhes sanitizados.

Nenhum erro de voz deve parar o engine principal da partida.

## Testes

Testes unitarios:

- `SttService` monta argumentos corretos para whisper.cpp.
- `SttService` trata binario/modelo ausentes, timeout, erro de processo e transcript vazio.
- `VoiceCommandRouter` prioriza comandos simples antes da memoria tatica.
- `VoiceCommandRouter` envia frases taticas para `Engine.handleTacticalCommand`.
- Config normaliza defaults e migra configs antigas.

Testes de integracao/mocks:

- Push-to-talk: start no key down, stop no key up, transcript roteado.
- Toggle: primeiro hotkey inicia, segundo para e transcreve.
- Hotkey conflitante deixa status em erro sem crash.
- Gravacao simultanea e recusada.
- Falha de STT gera evento de erro e nao chama memoria.

Build/typecheck devem continuar passando.

## Fora de escopo

- Perguntas gerais para a LLM por voz.
- VAD automatico continuo.
- Diarizacao ou separacao de Discord/jogo.
- Overlay sobre o jogo.
- Suporte completo a GPU/CUDA.
- Correcao de transcript por LLM.
- Aprendizado automatico do vocabulario do usuario.

## Riscos

- Captura de audio no Electron pode exigir dependencia nativa ou caminho alternativo via renderer/browser APIs.
- Atalhos globais podem conflitar com League, Discord ou Windows.
- whisper.cpp pode variar flags entre builds; wrapper deve ser testado contra o binario escolhido.
- Modelos maiores aumentam latencia e consumo de CPU.
- Ruido de teclado/Discord pode gerar comandos falsos; por isso push-to-talk e toggle explicitos sao preferidos a escuta continua.

## Criterios de aceite

- Usuario instala ou configura whisper.cpp e modelo pela UI.
- Usuario configura push-to-talk e toggle.
- Voz mostra status claro no dashboard.
- Falar `Ashe flashou` registra cooldown na memoria tatica.
- Falar `Quem esta sem flash?` retorna resposta da memoria tatica.
- Falar `resetar memoria` limpa memoria tatica.
- Erros comuns de STT/captura/hotkey aparecem como feedback acionavel.
- `npm test`, `npm run typecheck` e `npm run build` passam.
