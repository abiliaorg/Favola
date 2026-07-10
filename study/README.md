# Studio Favola — Riassunto completo del lavoro di analisi

> Documento di sintesi di tutto il lavoro svolto sui dati dello studio
> (raccolta 4–6 luglio 2026, analisi 9 luglio 2026).
> Ogni sezione rimanda ai file e agli script che la implementano.

## 1. Lo studio

**Domanda di ricerca**: la modalità di presentazione delle caption durante una storia
narrata in video — parole come **testo** (*text*) oppure parole chiave rese come
**immagini** (*images*) — influenza la comprensione della storia nei bambini di
scuola primaria?

**Stimoli**: 8 brani delle Prove MT (Cornoldi, Colpo, Carretti — Giunti EDU, kit
"Progetto MT scuola", copie in `study/tests/`), narrati in video da **un'unica
narratrice** per tutte le storie, registrati in due varianti (text / images).
I sorgenti video sono in `data/00_sources/`, le registrazioni con i metadati
parola-per-parola in `data/01_record/`.

| Classe | Storia 1 (S1) | Storia 2 (S2) | Prova MT di origine |
|---|---|---|---|
| 1ª e 2ª | La volpe e il boscaiolo (fox) | La fiaba del tappeto (carpet) | 2ª intermedia / 2ª ingresso |
| 3ª | La gatta zoppa (cats) | Storia di uno sbadiglio (yawn) | 3ª indagine appr. 2 / 3ª ingresso |
| 4ª | Voglia di giocare – delfino (dolphin) | Il panda (panda) | 4ª indagine appr. 1 / 4ª indagine appr. 2 |
| 5ª | Il viaggio delle anguille (eels) | L'orso bianco (bear) | 5ª ingresso / 5ª indagine appr. 2 |

**Disegno**: within-subject controbilanciato. Ogni bambino ascolta le 2 storie della
sua classe **sempre nello stesso ordine** (S1 poi S2), una in modalità text e una in
modalità images. Gruppo **TI** = text sulla prima storia, images sulla seconda;
gruppo **IT** = l'inverso. Dopo ogni storia il bambino compila il test cartaceo di
comprensione MT adattato (`study/testsheets/*.pdf`). Protocollo operativo completo in
`study/protocols/Protocollo da tenere sul banco.docx`.

**Postazioni**: due PC ("bene" = Benedetta, "fra" = Francesca) con eye-tracking
durante la visione. Le postazioni definiscono solo il luogo fisico: a volte una
postazione ha chiamato bambini dell'altro gruppo per bilanciare, e 12 bambini hanno
fatto le due storie su postazioni diverse. **L'ordine reale TI/IT va quindi ricavato
dai timestamp delle registrazioni gaze, non dal prefisso B/F dell'id né dalla
postazione.**

**Svolgimento**: 4–5 luglio prove tecniche; 6 luglio raccolta dati — mattina (tutte
le classi, cartelle `data_bene1`/`data_fra1`) e pomeriggio (prevalentemente classe 1ª,
cartelle `data_bene2`/`data_fra2`).

## 2. Pulizia dei dati gaze (`data/02_gaze/`)

Verifiche fatte con `study/scripts/check_gaze_dupes.py` e `make_gaze_list.py`:

- **Registrazioni duplicate con doppia attribuzione**: la stessa registrazione
  eels-images delle 10:17:02 esisteva sia come F5 sia come F7 (campioni identici
  bit per bit), e la carpet-images delle 10:18:52 sia come b5 sia come b6. Erano
  copie fatte a mano per correggere un'attribuzione errata, senza eliminare
  l'originale. Confermato che valgono **F7** e **b6**; gli originali mal attribuiti
  sono stati spostati (non cancellati) in `data/02_gaze/_scartati/`.
- **Refuso** nel participantId di `20260706_100520_F4_2_fox_images.json`:
  `` `F4 `` → `F4` (corretto nel JSON).
- **Excel registrazioni**: eliminato lo snapshot "registrazioni_gaze mattina.xlsx"
  e rigenerato un unico `data/02_gaze/registrazioni_gaze.xlsx` con **104
  registrazioni valide** (esclusi test/prove: test, testaudio, PROVA, tommy, giulia,
  vittorio), ognuna contata una volta sola. Script: `fix_f4_and_regen.py`.
- Nomi mai registrati (assenti): B19, F1*, F6*, F19, F27–F30, F34, F36–F39
  (*F1 e F6 hanno però compilato i test cartacei).

## 3. Transcript delle storie (`study/transcripts/`)

Estratti da `data/01_record/*.json` con `study/scripts/make_transcripts.py`:
20 file (10 registrazioni × 2 modalità), parole definitive del riconoscimento
vocale (esclusi i risultati *interim*); nei file `*_images.txt` le parole mostrate
come immagine sono tra [parentesi]. Nella variante images le parole-immagine sono
il 20–30% (es. volpe 34/154, tappeto 42/145).

Nota: per 4 storie le due varianti differiscono leggermente (refusi del
riconoscimento tra le due riprese: "poi/puoi", "apparecchi"/"a parecchi"; in
5_bear images manca un inciso di 8 parole presente nella text). È il contenuto
reale dei video, non è stato toccato.

## 4. Chiave di correzione (`study/chiave_derivata.md` / `.json`)

1. Letti gli 8 testsheet PDF somministrati (`study/testsheets/`, per i PDF grandi
   tramite render delle pagine) e **derivata una chiave indipendente** confrontando
   ogni domanda con il transcript della storia.
2. Confrontata con il foglio "Risposte" di `study/test.xlsx` e con le **chiavi MT
   ufficiali** (Guide rapide alla correzione: Prove 1-2 p.68 PDF; Prove 3-4-5
   p.96/98/100 PDF). Risultato:
   - Il foglio "Risposte" di test.xlsx è la **trascrizione fedele delle chiavi MT
     ufficiali** (8/8 storie identiche). Nessun errore di trascrizione.
   - Ma i fogli adattati differiscono dagli originali MT: **ordine delle opzioni
     ruotato** in Volpe Q4 e Tappeto Q2/Q4/Q5/Q7/Q9 (es. "mercato" è C nell'MT e B
     nell'adattato; "taglialegna con ascia" è A nell'MT e B nell'adattato);
     **numerazione scambiata** in Sbadiglio (Q2↔Q3 rispetto all'MT).
   - Un errore della prima derivazione corretto grazie all'MT: Sbadiglio Q6 = **c**
     ("Quando mette la testa fuori dal finestrino del camion", didascalia ufficiale).
3. **Per lo scoring vale `chiave_derivata.json`** (riflette i fogli realmente
   somministrati). Il foglio "Risposte" di test.xlsx è stato lasciato com'è
   (documenta le lettere MT originali) ma **non va usato per correggere i fogli
   adattati**.

Le **fasce MT** (CCRD / PSD / RAD / RIDI per numero di risposte corrette) sono
riportate in `chiave_derivata.md` e nel JSON (`_fasce_mt`).

**Scelta metodologica dello studio** (da riportare in ogni descrizione dei
risultati): le prove MT sono state applicate per tutti i bambini **all'uscita**
(fine anno) e non nel momento MT previsto (ingresso/intermedia/indagine), perché la
somministrazione è comunque non standard — avere un testo davanti da leggere è
diverso dall'ascoltare una storia narrata e leggere le caption. Le fasce MT vanno
quindi intese come riferimento descrittivo, non normativo.

## 5. Classificazione dei soggetti per ordine reale (TI/IT)

Script: `study/scripts/classify_order.py` → `study/ordine_soggetti.xlsx`.

L'ordine di ogni soggetto è stato ricavato da **timestamp + modalità effettiva**
delle sue registrazioni gaze:

- **TI (text→images): 27** — B1–B18, B20–B27 e **F12** (unico prefisso "F" con
  ordine invertito: gatta text 11:04 su bene, poi sbadiglio images 11:16 su fra).
- **IT (images→text): 21** — F7, F8, F9, F11, F13–F18, F20–F24, F26, F31, F32,
  F33, F40, F41.
- Tutti i bambini hanno rispettato l'ordine delle storie S1→S2 (verificato).
- 12 bambini hanno cambiato postazione tra le due storie (B5, B12, B17, B21, F12,
  F13, F17, F20, F22, F23, F31, F32).

**Mappatura ID** (`study/mappatura_soggetti.xlsx` / `.json`, script
`make_mapping.py`): i 48 soggetti validi sono rinominati **TI01–TI27 / IT01–IT21**
con numerazione progressiva nell'ordine degli id originali (B1→TI01 … B27→TI26,
F12→TI27; F7→IT01 … F41→IT21). I file grezzi (gaze JSON, test.xlsx) conservano gli
id originali: la mappatura fa da ponte.

**Esclusi dall'analisi (9)**: F1, F6 (nessun gaze), F2, F3, F10, F25 (gaze
parziale) → ordine non verificabile; **F4** (entrambe le storie in images) e
**F35** (entrambe in text) → somministrazione anomala; B19 (assente).

**Anomalie note da tenere presenti**:
- **F4 ha il gaze ma non compare né in test.xlsx né in demo.csv** (fogli non trascritti?).
- B5 (TI05): fox text incompleta (61s/75, 130 campioni) e carpet images abortita a
  50.8s/67 — dati gaze di bassa qualità (i risultati non cambiano escludendolo).
- F10: tracking quasi assente (78 campioni in 67s).
- F3: bear text durata 167s (probabile riavvio del video).
- Età e sesso in `study/demo.csv` (tab-separated; F35 compare due volte con valori
  identici — innocuo). Copertura completa dei 48 soggetti validi.

## 6. Scoring e risultati (`study/risultati_test.xlsx`)

Script: `study/scripts/score_tests.py`. Regole: punteggio grezzo MT = numero di
risposte corrette con `chiave_derivata.json`; risposte in bianco e doppie ("a e b")
= non corrette; fascia MT per ogni test. Coorte finale: **48 soggetti, 96 test,
48 coppie text/images perfette**.

### Bilanciamenti (script `analyze_balance.py` e `classify_order.py`)

| Classe | TI | IT |
|---|---|---|
| 1ª | 11 | 11 |
| 2ª | 7 | 3 |
| 3ª | 4 | 1 |
| 4ª | 3 | 4 |
| 5ª | 2 | 2 |

Bilanciamento buono in 1ª, 4ª, 5ª; sbilanciate 2ª e 3ª (in 3ª pesa F12 passato a TI).

### Risultati principali

- **Effetto modalità: nullo.** Confronto appaiato images−text: **+1.0 punti
  percentuali, t(47)=0.28, n.s.** (21 bambini meglio con images, 19 con text,
  8 pari). Decomposizione del disegno incrociato: effetto modalità puro
  **m = +0.4 pt (t≈0.12)**; effetto posizione/storia (S2−S1) p = +4.2 pt (t≈1.16, n.s.).
- **Ordine (IT vs TI): +6.5 pt per gli IT, t≈1.1, n.s.** — differenza concentrata
  nel pomeriggio (classe 1ª), compatibile con differenze tra i gruppi di bambini
  più che con un effetto dell'ordine.
- **Differenze tra storie della stessa classe** (unico effetto solido):
  classe 1ª tappeto più facile della volpe di **+12.0 pt (t=2.48, p<.05)**;
  classe 5ª orso più difficile delle anguille di −19.1 pt (t=−1.91, marginale, n=5).
  Conferma che il confronto di modalità va fatto appaiato (com'è per costruzione).
- **Difficoltà tra storie/classi** (solo descrittivo, prove diverse): tappeto 79.7% >
  anguille 72.0% > volpe 70.3% > gatta 66.7% > sbadiglio 60.0% > delfino 58.2% >
  panda 54.1% > orso 52.9%. Le prove "indagine approfondita" (14 domande) sono
  sistematicamente più dure.
- **Fasce MT × modalità**: text 19% CCRD / 35% PSD / 27% RAD / 19% RIDI;
  images 10% / 56% / 19% / 15% — distribuzioni compatibili.
- Sessione (mattina/pomeriggio) e PC di somministrazione: differenze piccole e
  confuse con la composizione delle classi; nessun segnale.

### Demografia (da `demo.csv`)

- Bilanciamento TI/IT buono anche su età e sesso: TI 13M/14F, età media 7.8;
  IT 12M/9F, età media 7.7 (range 6–11 in entrambi).
- Sesso: M 74.1% vs F 64.8% (+9.2 pt, t=1.58, n.s.).
- **Interazione modalità × sesso (esplorativa, il segnale più interessante)**:
  nei maschi images−text = **−7.0 pt** (t=−1.42), nelle femmine **+9.6 pt**
  (t=2.22) — i maschi rendono meglio col testo, le femmine con le immagini;
  interazione ≈17 pt (t≈2.5). Da trattare con cautela (analisi esplorativa,
  n piccoli, nessuna correzione per confronti multipli) ma da tenere d'occhio
  nell'analisi AOI.
- Età: nessuna relazione lineare col punteggio (r=−0.13; l'età coincide quasi
  con la classe, quindi è confusa con la prova).

**Conclusione allo stato attuale**: con 48 coppie appaiate non emerge alcuna
differenza di comprensione tra caption text e caption images; l'effetto più forte
nei dati è la diversa difficoltà delle storie all'interno della stessa classe.

## 7. Piano futuro: analisi AOI del gaze

Correlare *dove* il bambino ha guardato (faccia/bocca della narratrice, testo,
immagini) con i punteggi. Richiede: definizione precisa delle AOI riprendendo i
bound dall'analyzer (`gaze/`), mappatura di ogni campione gaze sulle AOI frame per
frame (le posizioni delle parole sono in `wordLocationsByIdAndTime` e i box del
volto in `faceTrackingSnapshots` dei JSON di `data/01_record/`), calcolo dei tempi
di permanenza per AOI, e solo dopo le correlazioni con i punteggi. Ulteriori
approfondimenti possibili: analisi per singola domanda (esplicite vs inferenziali
secondo la classificazione MT), qualità del tracking come covariata.

## 8. Inventario della cartella `study/`

| File/cartella | Contenuto |
|---|---|
| `README.md` | questo documento |
| `INSIGHTS.md` | lista viva di tutti gli insights (anche non significativi), con id citabili I-nn |
| `test.xlsx` | risposte dei bambini (foglio PROVE) + chiavi MT originali (foglio Risposte — non valide per i fogli adattati) |
| `demo.csv` | età e sesso dei soggetti (tab-separated, ID originali) |
| `chiave_derivata.md` / `.json` | chiave di correzione dei fogli somministrati, validata su MT, + fasce |
| `mappatura_soggetti.xlsx` / `.json` | mappatura ID originale → TI/IT + esclusi con motivo |
| `ordine_soggetti.xlsx` | sequenza oraria completa per soggetto (storia, modalità, postazione) |
| `risultati_test.xlsx` | punteggi e fasce MT per test (fogli Punteggi/Esclusi/Riepilogo) |
| `transcripts/` | transcript delle 20 registrazioni + README |
| `testsheets/` | gli 8 test PDF somministrati; `scoring/` = docx sorgente con rubrica MT |
| `tests/` | prove MT ufficiali (manuale, fascicoli, presentazione, mail con indicazioni fasce) |
| `protocols/` | protocollo di somministrazione |
| `scripts/` | tutti gli script Python (vedi sotto) |

**Script** (`study/scripts/`, Python 3 + openpyxl/PyMuPDF/Pillow):
`make_gaze_list.py` (excel registrazioni gaze) · `check_gaze_dupes.py` (duplicati
nei campioni) · `fix_f4_and_regen.py` (fix refuso + rigenera excel) ·
`make_transcripts.py` (transcript) · `_read_protocol.py` (dump protocollo/test.xlsx) ·
`classify_order.py` (ordine reale TI/IT) · `make_mapping.py` (mappatura ID) ·
`score_tests.py` (scoring MT + riepiloghi) · `analyze_balance.py` (bilanciamenti
ed effetti).

Pipeline per riprodurre tutto da zero:
`make_transcripts.py` → `classify_order.py` → `make_mapping.py` → `score_tests.py`
→ `analyze_balance.py`.
