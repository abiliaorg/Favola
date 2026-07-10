# Insights — Studio Favola

> Lista viva di tutto ciò che è emerso dalle analisi, **inclusi i risultati non
> significativi** (sono risultati anche loro). Ogni insight ha un id stabile
> (I-nn) per poterlo citare, i numeri a supporto e un'etichetta di solidità:
> **[SIG]** significativo (|t|≥2) · **[NS]** non significativo · **[ESP]**
> esplorativo, da confermare · **[DES]** descrittivo, nessun test ·
> **[MET]** metodologico/qualità dati.
>
> Coorte di riferimento: 48 soggetti validi (27 TI, 21 IT), 96 test, 48 coppie
> text/images appaiate. Scoring MT con `chiave_derivata.json`. Analisi del
> 9 luglio 2026 con `scripts/score_tests.py` e `scripts/analyze_balance.py`.

## A. Effetti sperimentali

- **I-01 [NS] La modalità delle caption (text vs images) non ha effetto sulla
  comprensione.** Confronto appaiato entro bambino (n=48): images−text =
  **+1.0 pt** (sd 24.2, t(47)=0.28). 21 bambini meglio con images, 19 con text,
  8 pari. Decomposizione del disegno incrociato: effetto modalità puro
  **m = +0.4 pt (t≈0.12)**. Robusto all'esclusione di B5/TI05 (+1.0 pt). È il
  risultato principale dello studio allo stato attuale.

- **I-02 [ESP] Interazione modalità × sesso: i maschi rendono meglio col testo,
  le femmine con le immagini.** Diff appaiata images−text: maschi **−7.0 pt**
  (n=25, t=−1.42), femmine **+9.6 pt** (n=23, t=2.22); interazione ≈ 16.6 pt
  (t≈2.5). Spiegherebbe perché l'effetto medio (I-01) è nullo. Cautela: analisi
  esplorativa, n piccoli, nessuna correzione per confronti multipli, e il
  gruppo F femmine è leggermente sbilanciato verso TI (14 TI vs 9 IT).
  **Ipotesi da verificare con l'analisi AOI del gaze** (guardano cose diverse?).

- **I-03 [NS] L'ordine di somministrazione (TI vs IT) non ha effetto
  dimostrabile.** Media per bambino: IT 73.3% vs TI 66.8% → **+6.5 pt**
  (t Welch=1.12). La differenza è concentrata nel pomeriggio/classe 1ª
  (B 59.4% vs F 74.4%), quindi è più compatibile con una differenza tra i
  gruppi di bambini che con un effetto dell'ordine. NB: l'ordine coincide col
  percorso/postazione prevalente, non è separabile da esso.

- **I-04 [NS] Effetto posizione/storia (seconda vs prima storia): +4.2 pt
  (t≈1.16).** Dalla decomposizione del disegno incrociato. Posizione e identità
  della storia non sono separabili (ogni storia è sempre nella stessa
  posizione).

- **I-05 [SIG] Le due storie della stessa classe non sono equivalenti in
  difficoltà.** Sulla coorte valida (48): in classe 1ª il tappeto è più facile
  della volpe di **+15.0 pt** (n=22, t=2.97, p<.01); stesso segno in 2ª
  (+5.0, t=0.89 [NS]). In classe 5ª l'orso è più difficile delle anguille di
  **−28.2 pt** (n=4, t=−5.15, significativo pur col n minimo). Classe 3ª:
  sbadiglio−gatta −6.7 (n=5, t=−0.62 [NS]); classe 4ª: panda−delfino −4.1
  (n=7, t=−0.68 [NS]). Conseguenza: ogni confronto di modalità DEVE essere
  appaiato entro bambino (com'è, per costruzione del disegno).

- **I-06 [NS] Sesso (effetto principale): maschi 74.1% vs femmine 64.8%
  (+9.2 pt, t Welch=1.58).** Media dei due test per bambino (25 M, 23 F).

- **I-07 [NS] Età: nessuna relazione lineare col punteggio** (r=−0.13, n=48).
  L'età coincide quasi perfettamente con la classe, quindi è confusa con la
  prova. Curiosità non monotona: i 7-enni sono il gruppo migliore (80.0%,
  n=18), i 6-enni il peggiore (60.0%, n=9) — riflette in gran parte la coppia
  classe/prova (i 7-enni di classe 2ª fanno le prove più facili).

- **I-08 [NS] Sessione (mattina vs pomeriggio): −1.7 pt (t=−0.34).**
  Completamente confusa con la composizione delle classi (pomeriggio ≈ solo
  classe 1ª).

## B. Osservazioni descrittive

- **I-09 [DES] Gradiente di difficoltà tra le prove** (media %, entrambe le
  modalità, coorte valida n=48): tappeto 80.0 (n=32) ≈ anguille 80.0 (n=4) >
  volpe 68.1 (n=32) > gatta 66.7 (n=5) > sbadiglio 60.0 (n=5) > delfino 58.2
  (n=7) > panda 54.1 (n=7) > orso 51.8 (n=4). Le prove "indagine approfondita"
  MT (14 domande: delfino, panda, orso) sono sistematicamente più dure delle
  prove d'ingresso.

- **I-10 [DES] Fasce MT per modalità** (prove applicate all'uscita → riferimento
  descrittivo, non normativo): text 19% CCRD / 35% PSD / 27% RAD / 19% RIDI;
  images 10% / 56% / 19% / 15%. Con images le code (eccellenti e in difficoltà)
  si assottigliano e la massa si concentra su PSD; distribuzioni comunque
  compatibili.

- **I-11 [DES] Rendimento per classe**: 2ª la migliore (82.5%), 1ª 70.2%,
  5ª 65.9%, 3ª 63.3%, 4ª la più in difficoltà (56.2%). Non confrontabili
  direttamente: prove diverse per classe.

- **I-12 [DES] Postazione/PC (bene 67.9% vs fra 72.0%)**: rispecchia in larga
  parte la differenza TI/IT (I-03); nessun segnale attribuibile all'hardware.

- **I-13 [DES] Demografia bilanciata tra i gruppi**: TI 13M/14F, età media 7.8;
  IT 12M/9F, età media 7.7 (range 6–11 entrambi). Il disegno non ha introdotto
  distorsioni demografiche rilevanti.

## C. Metodologia e qualità dati

- **I-14 [MET] Il foglio "Risposte" di test.xlsx è la chiave MT ufficiale, ma
  NON vale per i fogli adattati somministrati.** Verificato sulle guide MT
  originali (8/8 storie identiche). I fogli adattati hanno: opzioni ruotate
  (Volpe Q4; Tappeto Q2/Q4/Q5/Q7/Q9), domande rinumerate (Sbadiglio Q2↔Q3).
  Per lo scoring vale `chiave_derivata.json`. Un'ambiguità (Sbadiglio Q6) è
  stata risolta a favore della chiave MT ("mette la testa fuori dal
  finestrino" = c).

- **I-15 [MET] L'ordine reale di somministrazione va letto dai timestamp gaze,
  non dal prefisso dell'id né dalla postazione.** Un bambino su 48 (F12→TI27)
  ha l'ordine invertito rispetto al prefisso; 12 bambini hanno cambiato
  postazione tra le due storie; la narratrice è unica, quindi nessun
  confondimento narratore.

- **I-16 [MET] Bilanciamento classe × ordine imperfetto**: 1ª 11/11, 4ª 3/4,
  5ª 2/2 ok; **2ª sbilanciata (7 TI / 3 IT)** e **3ª (4 TI / 1 IT)**. Da tenere
  presente in ogni analisi che aggreghi per classe.

- **I-17 [MET] Esclusioni (9 soggetti)**: F1, F6 (nessun gaze), F2, F3, F10,
  F25 (gaze parziale) → ordine non verificabile; F4 (images+images), F35
  (text+text) → somministrazione anomala; B19 assente. Coorte finale 48.

- **I-18 [MET] Incidenti di raccolta dati risolti**: la stessa registrazione
  attribuita a due bambini in due casi (eels 10:17 → F7, carpet 10:18 → b6;
  originali in `_scartati/`), refuso `` `F4 `` nel participantId, excel
  registrazioni rigenerato (104 registrazioni valide).

- **I-19 [MET] Qualità gaze da considerare nell'analisi AOI**: B5/TI05 con
  entrambe le registrazioni degradate (61s/130 campioni; abort a 50.8s),
  F10 con tracking ~1 Hz (escluso comunque), F3 con video probabilmente
  riavviato (167s). Frequenza attesa ~10 Hz.

- **I-20 [MET] Il paper trail non è completo**: F4 ha il gaze ma non compare né
  in test.xlsx né in demo.csv (fogli non trascritti?); F1/F6 viceversa hanno i
  test ma nessun gaze. demo.csv ha una riga duplicata (F35, valori identici).

## E. Gaze / AOI (analisi aggregata, metodo web/analysis con parametri concordati in `aoi_params.json`)

- **I-25 [SIG] La modalità images sposta massicciamente l'attenzione visiva.**
  Confronto appaiato entro bambino (n=48): con le images la quota di tempo sulle
  caption sale di **+15.9 pt** (t=3.43) e quella sul volto scende di **−12.1 pt**
  (t=−4.51); cala il tempo sulle parole-testo (−11.4, t=−3.33), sulla bocca
  (−3.5, t=−2.52) e sugli occhi (−3.6, t=−2.96); invariato il fuori-AOI (ns).
  Medie: text → caption 51.4% / face 28.0% / none 20.7%; images → caption 67.2%
  (di cui 22.5% sulle parole-immagine) / face 15.9% / none 16.9%. Lo shift è
  simile nei due sessi (caption: M +13 pt, F +21 pt). **Insieme a I-01: la
  modalità cambia moltissimo dove si guarda, ma non quanto si capisce.**

- **I-26 [NS] Le AOI aggregate non predicono il punteggio.** Correlazioni
  AOI→punteggio tutte ≈ 0 (|r|≤0.12, n=87 registrazioni di buona qualità;
  identico su tutte le 96). Quanto tempo si passa su caption/volto/parole non
  correla con la comprensione.

- **I-27 [ESP] In modalità images, più tempo sul volto → punteggio leggermente
  peggiore** (r=−0.24, n=43, t=−1.59, n.s.). Unico segnale sopra il rumore
  nelle correlazioni aggregate; da riverificare nel lavoro puntuale.

- **I-28 [ESP] Nelle femmine, più tempo sulle parole-immagine → punteggio
  leggermente migliore** (r=+0.18, n=42, n.s.). Direzione coerente con I-02,
  ma debole.

- **I-29 [MET] 9 registrazioni gaze di bassa qualità** (freq <5 Hz o durata
  <40s): TI05 ×2 (2.1/3.8 Hz), TI07 (3.9 Hz), IT18 (3.8 Hz), IT14 (2.4 Hz),
  IT19 (troncata a 23s), TI16 sbadiglio/images e IT04 tappeto/text (troncate a
  ~9s), e **TI22 tappeto/images con 1 solo campione (inutilizzabile)**.
  I risultati I-25/I-26 non cambiano includendole o escludendole.

## F. Analisi puntuale (sguardo nel momento dell'informazione — `question_gaze.csv`)

- **I-30 [MET] Dataset puntuale costruito.** 90 domande puntuali con finestra
  temporale dell'informazione per variante (`question_windows.json`, 218
  finestre, match ≥0.94; orso Q12 recuperata: "pinnipede" riconosciuto come
  "pesce" ma frase presente e ancorata). 989 osservazioni soggetto×domanda,
  920 incluse (soglia ≥5 campioni in finestra); bianche = errate (tempo
  illimitato); padding primario −1.0/+1.5 s con sensitivity −0.5/+1.0 e
  −2.0/+3.0 (risultati identici su tutti e tre).

- **I-31 [NS] Guardare le parole-ancora nel momento dell'informazione NON
  predice la correttezza della risposta.** Quota-ancora nelle risposte
  corrette 28.6% vs errate 31.4% (diff −2.8 pt, t=−1.59); aggregato per
  soggetto −1.6 pt (t=−0.88, n=46); "ancora guardata almeno una volta"
  OR=0.95. Robusto al padding. Il canale uditivo sembra sufficiente: chi non
  guarda la caption nel momento chiave non risponde peggio.

- **I-32 [ESP] (attenzione all'interpretazione) In modalità text l'associazione
  negativa osservata a livello di domanda (corrette 26.4% vs errate 32.3% di
  quota-ancora, t=−2.43; OR=0.65) NON regge al controllo entro-soggetto
  (−0.3 pt, t=−0.19, n=37).** È quindi un effetto tra-soggetti: i bambini che
  in text fissano di più le parole-caption nei momenti chiave tendono a
  sbagliare di più in generale (possibile marcatore di lettori/ascoltatori più
  deboli che si aggrappano al testo), non un danno momento-per-momento.

- **I-33 [ESP] In modalità images, tendenze deboli ma coerenti con I-27:**
  guardare l'ancora non danneggia (OR=1.35, n.s.; entro-soggetto +1.2 pt,
  t=+0.55) e guardare il **volto** nel momento dell'informazione si associa a
  più errori (9.9% nelle corrette vs 13.4% nelle errate, t=−1.76, n.s.).

## D. Ipotesi aperte per le prossime analisi

- **I-21** L'interazione modalità × sesso (I-02) si riflette in pattern di
  sguardo diversi? (AOI: faccia/bocca vs testo vs immagini).
- **I-22** Le domande inferenziali (classificazione MT) beneficiano o soffrono
  della modalità images più delle esplicite? (analisi per singola domanda).
- **I-23** Il tempo passato sulle caption predice il punteggio, a parità di
  modalità? (AOI + regressione).
- **I-24** La differenza di difficoltà tra storie (I-05) è spiegabile con la
  densità/posizione delle parole-immagine nelle varianti images?

---
*Aggiornare questa lista a ogni nuova analisi; non rimuovere gli insight
superati ma marcarli come [SUPERATO da I-nn].*
