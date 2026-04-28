# Progetto Eyetracker - Base Templates

Repository per costruire uno strumento di sottotitoli live a partire da 2 template di riferimento.

## Struttura cartelle

```text
Progetto Eyetracker/
├─ originals/
│  ├─ images.html                (template originale, NON modificare)
│  └─ words.html                 (template originale, NON modificare)
├─ assets/
│  ├─ images/                    (immagini estratte dai template)
│  └─ word-images.json           (mappa parola -> file immagine)
├─ index.html                    (strumento nuovo in root)
└─ README.md
```

## Regola principale

I file in `originals/` sono **template sorgente**:
- non vanno modificati
- non vanno rinominati
- non vanno spostati

## Cosa fa `index.html`

`index.html` unisce i due template originali in una sola app e aggiunge il toggle richiesto:
- `Solo parole`
- `Parole + immagini`

Funzioni principali:
- Trascrizione live con `Web Speech API` (`it-IT`)
- Toolbar (avvio/stop mic, cancella, dimensione testo, tema, fullscreen)
- Pannello `Immagini` con lista parole/immagini e aggiunta manuale
- Pannello `Log` con copia testo
- Persistenza delle parole aggiunte utente in `localStorage`

## Modalita parole/immagini

- In `Solo parole`, il testo viene mostrato come sottotitolo puro.
- In `Parole + immagini`, se una parola trascritta esiste nella mappa, viene resa come card immagine+etichetta.

La mappa iniziale viene caricata da `assets/word-images.json`.

## Assets immagini

Le immagini non sono inline nel nuovo `index.html`.
Sono state estratte in file dentro `assets/images/` e referenziate via path relativo nel JSON.

## Avvio

Aprire `index.html` in browser compatibile (`Chrome` o `Edge`) con accesso microfono abilitato.
