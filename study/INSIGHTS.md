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
  difficoltà.** Il dato più solido dello studio: in classe 1ª il tappeto è più
  facile della volpe di **+12.0 pt** (n=25, t=2.48, p<.05); stesso segno in 2ª
  (+5.0, t=0.89 [NS]). In classe 5ª l'orso è più difficile delle anguille di
  **−19.1 pt** (n=5, t=−1.91, marginale). Classe 3ª: sbadiglio−gatta −6.7
  (t=−0.62 [NS]); classe 4ª: panda−delfino −4.1 (t=−0.68 [NS]). Conseguenza:
  ogni confronto di modalità DEVE essere appaiato entro bambino (com'è, per
  costruzione del disegno).

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
