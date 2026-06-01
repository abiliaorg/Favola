# Favola - Sottotitoli live + Eye tracking

Strumento web per la generazione di sottotitoli live di favole con tracking di parole e volto del lettore, e successiva analisi di gaze in fase di replay.

## Struttura cartelle

```text
Favola/
├─ index.html                    (home: seleziona il modulo)
├─ originals/
│  ├─ images.html                (template originale, NON modificare)
│  └─ words.html                 (template originale, NON modificare)
├─ record/                       (modulo registrazione)
│  ├─ index.html
│  └─ assets/
│     ├─ index.css
│     ├─ index.js
│     ├─ word-images.json        (mappa parola -> file immagine)
│     └─ images/                 (immagini referenziate dalla mappa)
├─ session/                      (modulo replay + analisi gaze)
│  ├─ index.html
│  └─ assets/
│     ├─ index.css
│     └─ index.js
└─ README.md
```

## Regola principale

I file in `originals/` sono **template sorgente**:

- non vanno modificati
- non vanno rinominati
- non vanno spostati

## Modulo Record (`record/`)

Cattura in tempo reale parlato, video, posizione delle parole sullo schermo e landmark del volto.

Funzioni principali:

- Trascrizione live con `Web Speech API` (`it-IT`), con correzioni custom per errori ricorrenti
- Toolbar: avvio/stop mic, cancella, dimensione testo, tema, modalità (`Solo parole` / `Parole + immagini`), numero massimo righe, fullscreen
- Caricamento opzionale di un video story: l'audio del video diventa la sorgente di riconoscimento al posto del microfono
- Face tracking con `MediaPipe FaceMesh` campionato a 100ms (face, mouth, nose, eye-left, eye-right)
- Word location tracking: bbox DOM di ogni token salvata ad ogni update
- Screen recording opzionale via `getDisplayMedia`, scaricabile come `webm`
- Pannello `Immagini` per aggiunta manuale di coppie parola/immagine (persistito in `localStorage`)
- Pannello `Log` con copia testo
- Export JSON dei dati di tracking (parole, locations, face snapshots)

Modalità parole/immagini:

- In `Solo parole`, il testo viene mostrato come sottotitolo puro.
- In `Parole + immagini`, se una parola trascritta esiste in `assets/word-images.json`, viene resa come card immagine + etichetta.

## Modulo Session (`session/`)

Replay del video registrato sovrapponendo un gaze simulato e calcolando le intersezioni con le bbox di parole e volto contenute nel JSON esportato da Record.

Funzioni principali:

- Caricamento separato di video e JSON di tracking
- Overlay con dot di gaze (random walk con `step` configurabile)
- Outline opzionale di parole e parti del volto per il frame corrente
- Calcolo intersezioni gaze ↔ bbox (con priorità word/image > face)
- Tipologie sessione: `solo testo` o `testo + immagini`
- Export del file di intersezioni con nome `YYYYMMDD_{participantId}_{story}_{typology}.json`

## Avvio

Aprire `index.html` in un browser compatibile (`Chrome` o `Edge`) con accesso al microfono abilitato, quindi selezionare il modulo desiderato.
