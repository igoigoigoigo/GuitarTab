# GuitarTab

Leitor de tablaturas para a web, com vários canais e sincronia com vídeos do YouTube.
É um site estático: não tem build nem backend, e tudo roda no navegador.

## Como rodar

```bash
node server.mjs
```

Depois abra http://localhost:5173. Qualquer servidor estático serve. Para publicar, suba a pasta
inteira em GitHub Pages, Netlify, Vercel ou similar. O YouTube não funciona abrindo o `index.html`
direto do disco (`file://`).

## O que faz

- **Abre** Guitar Pro (.gp3, .gp4, .gp5, .gpx, .gp), MusicXML e Capella: pelo botão ou arrastando o arquivo.
- **Canais**: cada faixa tem sua tablatura. Clique no nome para ver só aquele canal; use 👁 para ver
  vários juntos. Cada canal tem mudo (M), solo (S) e volume. "Só guitarra/baixo" esconde e silencia o resto.
- **Player**: sintetizador embutido, velocidade de 25% a 150%, loop (arraste na tab para escolher o trecho),
  metrônomo e contagem antes de começar. Notação em tab, tab + partitura ou só partitura; layout em página
  ou horizontal; zoom.
- **YouTube**: cole o link e o cursor da tab acompanha o vídeo, inclusive em repetições e mudanças de
  andamento. Clicar numa nota da tab leva o vídeo para aquele ponto.
- **Recentes**: os arquivos abertos ficam guardados no navegador (IndexedDB).

## Sincronizando com um vídeo

1. Abra a música e carregue o vídeo.
2. Jeito rápido: pause o vídeo exatamente no início do 1º compasso e clique em **Compasso 1 começa aqui**.
   Isso basta quando o andamento do vídeo é igual ao da tab.
3. Jeito preciso: clique em **Gravar** e, com o vídeo tocando, aperte **S** no início de cada compasso.
   Esc para. A gravação continua de onde parou, então dá para fazer a música em partes.
4. Use o **ajuste fino** (±20 ms / ±100 ms) se tudo estiver um pouco adiantado ou atrasado.

A sincronia fica salva no navegador para cada combinação de música e vídeo. Com **Exportar** e
**Importar** dá para levar para outro navegador ou compartilhar (é um JSON pequeno, só com tempos).

## Estrutura

| Arquivo | Função |
| --- | --- |
| `index.html` / `style.css` | Interface |
| `app.js` | Canais, player, ponte com o YouTube, sincronia, recentes |
| `demo.js` | Música de demonstração original, em alphaTex |
| `vendor/alphatab/` | [alphaTab](https://alphatab.net) 1.8.4 (MPL-2.0): renderização, sintetizador, fontes e soundfont |
| `server.mjs` | Servidor estático para desenvolvimento, sem dependências |

A sincronia usa o modo de mídia externa do alphaTab (`PlayerMode.EnabledExternalMedia`) com
*sync points* por compasso. O app só repassa o tempo do vídeo e o alphaTab faz a interpolação.

## Sobre o Songsterr

As tablaturas do Songsterr são conteúdo licenciado, e a API deles recusa acesso automatizado.
Por isso este app não baixa nada de lá: ele lê arquivos que você mesmo tem.
