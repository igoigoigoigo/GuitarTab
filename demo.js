// Música de demonstração original (escrita para este projeto) em alphaTex.
// Serve para testar canais, repetições e sincronia sem precisar de um arquivo.
export const DEMO_TEX = String.raw`
\title "Riff de Demonstração"
\artist "GuitarTab"
\tempo 112
\track "Guitarra Solo"
\staff {tabs}
\instrument 30
\tuning (E4 B3 G3 D3 A2 E2)
\section "Intro" \ro :8 0.6 0.6 3.6 0.6 5.6 0.6 3.6 2.6 |
\rc 2 0.6 0.6 3.6 0.6 5.6 3.6 :4 2.6 |
\section "Verso" (0.6 2.5 2.4) (0.6 2.5 2.4).8 (0.6 2.5 2.4).8 (3.6 5.5 5.4) (3.6 5.5 5.4) |
:2 (5.6 7.5 7.4) (3.6 5.5 5.4) |
:4 (0.6 2.5 2.4) (0.6 2.5 2.4).8 (0.6 2.5 2.4).8 (3.6 5.5 5.4) (3.6 5.5 5.4) |
:8 7.5 5.5 7.4 5.4 7.3 5.3 :4 7.2 |
\section "Final" :2 (0.6 2.5 2.4 1.3 0.2 0.1) r |

\track "Guitarra Base"
\staff {tabs}
\instrument 29
\tuning (E4 B3 G3 D3 A2 E2)
:8 (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (3.6 5.5) (3.6 5.5) (5.6 7.5) (5.6 7.5) |
(0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (3.6 5.5) (3.6 5.5) (5.6 7.5) (5.6 7.5) |
(0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) |
:2 (5.6 7.5) (3.6 5.5) |
:8 (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) (0.6 2.5) |
:4 (3.6 5.5) (5.6 7.5) (7.6 9.5) (5.6 7.5) |
:2 (0.6 2.5 2.4) r |

\track "Baixo"
\staff {tabs}
\instrument 33
\tuning (G2 D2 A1 E1)
:8 0.4 0.4 3.4 0.4 5.4 0.4 3.4 2.4 |
0.4 0.4 3.4 0.4 5.4 3.4 :4 2.4 |
:8 0.4 0.4 0.4 0.4 0.4 0.4 0.4 0.4 |
:2 5.4 3.4 |
:8 0.4 0.4 0.4 0.4 0.4 0.4 0.4 0.4 |
:4 3.4 5.4 7.4 5.4 |
:2 0.4 r |

\track "Teclado"
\staff {score}
\instrument 0
\tuning (piano)
r.1 |
r.1 |
(E3 G3 B3).1 |
(G3 B3 D4).2 (A3 C4 E4).2 |
(E3 G3 B3).1 |
(C3 E3 G3).2 (D3 G3 B3).2 |
(E3 G3 B3).2 r.2 |
`;
