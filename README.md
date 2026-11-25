# Onda Workstation 2.1 · Interface de estúdio

Produção musical no navegador. Sem conta, sem backend, sem dependências de execução. Abre com uma sessão de demonstração original para explorar o fluxo completo antes de começar do zero.

O visual 2.1 se inspira na [organização das janelas do FL Studio](https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/basics_workflow.htm), com design e ícones próprios. É um projeto independente, sem afiliação com a Image-Line. O formato de projeto continua sendo .onda, não .flp.

- **F5** Playlist, **F6** Channel Rack, **F7** Piano Roll, **F9** Mixer, **Alt+F8** Browser. Alguns navegadores ou sistemas interceptam teclas de função; todos os editores também estão na barra superior.
- No computador, use **Desencaixar Channel Rack**, no cabeçalho do rack, e arraste pela barra de título. Clique no mesmo botão para voltar à posição fixa.
- A Playlist tem zoom; o Piano Roll tem uma faixa de velocidade por nota. Clique numa barra para selecionar a nota e mudar o valor. No Mixer, clique num canal e depois num slot para abrir a cadeia de efeitos.

## Comece por aqui

1. Clique em **Reproduzir** para ouvir a demonstração, ou em **Arquivo → Projeto vazio**.
2. Use **+** na biblioteca para adicionar um instrumento. Monte a batida no sequenciador ou desenhe notas no **Piano Roll**. A faixa só toca na música se tiver um clipe no **Playlist**.
3. Para repetir um padrão, clique em outro compasso vazio na faixa. Arraste clipes pra mover e dê dois cliques para abrir o piano roll. **Padrão** abre a lista para criar, trocar, duplicar e nomear padrões.
4. Misture no **Mixer**, ajuste os efeitos e crie curvas de volume em **Automação**.
5. Exporte a música, o padrão atual ou uma faixa em **WAV**. Em **Arquivo → Backup .onda**, salve uma cópia que continua editável e contém os samples.

### Rodar localmente

Com Node instalado, rode `npm start` e abra o endereço exibido no terminal (`http://127.0.0.1:8000/`). Não é necessário rodar `npm install`. Alternativamente, em um ambiente com Python 3, rode `python -m http.server 8000` nesta pasta.

No ZIP há também **Onda-Abrir.html**, uma edição autônoma para abrir direto no navegador. O armazenamento do arquivo local pode variar por navegador: faça backup .onda. Para gerar essa edição novamente, use `node portable.mjs Onda-Abrir.html`.

### Publicar no GitHub Pages

Envie para a raiz do repositório os **arquivos de dentro desta pasta** (incluindo `.nojekyll` e `assets/`), não o ZIP fechado. Em **Settings → Pages**, escolha **Deploy from a branch → main → /(root)** e salve. Não é necessário hospedar o Node: ele só serve os arquivos na máquina durante o desenvolvimento.

[Documentação oficial do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Ferramentas incluídas

- Playlist multifaixa, padrões reutilizáveis, escolha do trecho de loop, BPM e swing.
- Sequenciador de 16 passos por compasso; piano roll com posições, duração, oitava, velocidade e três divisões de grade.
- Cinco sons de percussão e seis instrumentos sintetizados. A demo não usa áudio de bibliotecas externas.
- Importação local de áudio e gravação PCM de microfone ou interface que vira uma nova faixa. No Mixer, selecione a faixa e use **Editar faixa** para mudar nome, cor, recorte e fades (aplicados à faixa de sample, sem alterar o arquivo).
- Volume, panorama, mute/solo, filtro passa-baixas, saturação, reverb e delay por faixa. Compressor e medidor no master. Automação de volume com pontos por compasso no modo Música.
- Projetos editáveis .onda, autosave e desfazer/refazer. Importação MIDI SMF 0/1 com tempo inicial e notas; o sintetizador interno toca os canais importados. Exportação MIDI armazena notas, não áudio, efeitos ou plugins.
- WAV estéreo PCM em 16/24 bits, 44,1/48 kHz, com renderização local e cauda de efeitos.
- Até dez inserts ordenáveis por canal, inclusive no master. Os plugins ficam no .onda; nenhuma instalação externa.

## Gravando uma faixa vocal

1. Importe a base ou abra um arranjo. Clique no botão vermelho **Gravar áudio**.
2. Escolha o compasso inicial, mono ou estéreo, dispositivo, ganho e 16 ou 24 bits. Deixe **Tocar a base** ligado para gravar por cima. Escolha a contagem. Use **Parar após** para fixar uma janela, ou deixe 0 e pare manualmente.
3. A tomada entra como novo clipe no compasso escolhido. Se a voz chega atrasada, coloque um número positivo em **Compensar atraso** e grave um teste curto; isso desloca o áudio capturado para mais cedo. A resolução do relógio é por amostra, mas a latência real depende da interface e do driver.
4. Selecione a tomada, abra **Plugins** e use o seletor de canal ou **Mixer → Editar inserts**. **Presets → Voz próxima** é um ponto de partida. Para afinação, insira **Afinação Vocal** antes do compressor, escolha a tonalidade e comece com intensidade moderada. Ela é monofônica, não separa vozes sobrepostas e não preserva formantes como ferramentas dedicadas.
5. Exporte em **48 kHz / 24 bits**, ou use 44,1 kHz / 16 bits quando precisar do formato tradicional. O mute e o bypass são respeitados no WAV. Projeto salvo em .onda continua editável.

A monitoração direta fica desligada por padrão. Se ligar, use fones; ela não passa pelos inserts e pode ter atraso. O Onda grava uma entrada por tomada (mono ou estéreo, se a entrada fornecer dois canais), não várias interfaces ao mesmo tempo. Não há compensação automática de latência de hardware nem ajuste automático de fase entre plugins.

## Plugins do Onda

| Grupo | Plugins |
| --- | --- |
| Voz | Afinação Vocal (cromática, maior ou menor natural) |
| Tonal | EQ Paramétrico com corte de graves, shelves e 2 bandas |
| Dinâmica | Compressor, De-esser, Noise Gate |
| Cor e modulação | Saturação, Chorus Estéreo, Tremolo |
| Espaço | Delay Sincronizado e Reverb Sala |
| Master | Limiter de pico de amostra com antecipação; Imagem Estéreo mid/side |

Os parâmetros, presets e algoritmos fazem parte do código. Não é um host de VST/AU, não abre plugins do FL Studio, e o limiter não mede true peak. Se quiser alterar ou adicionar um plugin, veja o catálogo e o motor descritos abaixo.

## Dados e limites

A sessão de trabalho é salva no IndexedDB do **mesmo navegador e endereço**. Um backup .onda é a forma de levar o projeto a outro lugar. Limpar dados do site apaga o autosave; nada é enviado ou sincronizado. Não há conta, telemetria, serviços externos ou CDN.

O microfone precisa de permissão e de um contexto seguro. Para a sessão de gravação e todos os plugins, prefira Chrome ou Edge em GitHub Pages (HTTPS) ou localhost. A edição portátil pode encontrar limitações de permissão ou armazenamento do navegador. A qualidade depende do dispositivo e navegador. A importação de áudio usa os decodificadores do navegador (prefira WAV se o codec original não abrir).

Até 24 faixas, 128 compassos, 100 padrões, 16 compassos por padrão MIDI e até 128 por padrão de áudio. Cada arquivo de áudio pode ter até 24 MB; cada projeto tem cerca de 63 MB de áudio original. A duração de uma tomada depende também da profundidade, da taxa, do canal e do espaço restante. O som do sample pode ser cortado pela duração da nota ou do padrão. A primeira versão não carrega projetos FLP, plugins VST/AU, bibliotecas comerciais ou sessões colaborativas. Não é uma versão do FL Studio nem tem vínculo com a Image-Line.

## Código

- `project.mjs`: formato editável, validação, playlist, padrões e demo.
- `audio.mjs`: motor Web Audio, nós por faixa, agenda em tempo real e render offline.
- `fx-catalog.mjs`, `fx-engine.mjs`, `processor.mjs`: catálogo, cadeia e DSP dos efeitos.
- `recorder.mjs`: captura PCM cronometrada e contagem.
- `midi.mjs`, `storage.mjs`: intercâmbio e persistência local.
- `app.mjs`, `index.html`, `styles.css`: interface sem framework.
- `npm test`: testes de padrões, projeto, PCM/WAV, MIDI e plugins.
- Com o servidor local rodando, abra `/tests/studio.html` e clique em **Rodar áudio sintético**. Isso valida os 12 efeitos, o teto do limiter, a afinação, a renderização WAV e a captura PCM. Não aciona seu microfone.

Antes de licenciar o código para uso por terceiros, escolha a licença que você quer oferecer no repositório.
