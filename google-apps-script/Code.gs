/**
 * ============================================================================
 * Google Apps Script — Pont de synchronisation pour la PWA "Vaya — Soins"
 * ============================================================================
 * Installation (1 minute) :
 * 1. Ouvre ton Google Sheet de Vaya.
 * 2. Menu : Extensions > Apps Script.
 * 3. Supprime le contenu par défaut et colle tout ce fichier.
 * 4. Clique sur "Déployer" (en haut à droite) > "Nouveau déploiement".
 * 5. Type : "Application Web".
 *    - Exécuter en tant que : "Moi"
 *    - Qui a accès : "Tout le monde"
 * 6. Clique sur "Déployer", autorise l'accès à ton Google Sheet,
 *    puis copie l'URL "Application Web" (se termine par /exec).
 * 7. Colle cette URL dans les paramètres (⚙️) de la PWA Vaya !
 * ============================================================================
 */

// Colonnes de cases à cocher autorisées en écriture (sécurité)
const ALLOWED_COLS = {
  F: 6,  // Omép. Pris
  H: 8,  // R1 Fait
  J: 10, // Kéal 1 Pris
  L: 12, // R2 Fait
  N: 14, // Kéal 2 Pris
  P: 16, // R3 Fait
  R: 18, // Kéal 3 Pris
  T: 20, // R4 Fait
};

const DOSE_MAP = [
  { key: 'omep',  valCol: 6,  descCol: 5  },
  { key: 'r1',    valCol: 8,  descCol: 7  },
  { key: 'keal1', valCol: 10, descCol: 9  },
  { key: 'r2',    valCol: 12, descCol: 11 },
  { key: 'keal2', valCol: 14, descCol: 13 },
  { key: 'r3',    valCol: 16, descCol: 15 },
  { key: 'keal3', valCol: 18, descCol: 17 },
  { key: 'r4',    valCol: 20, descCol: 19 },
];

function getTargetSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const sheet = getTargetSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), 24);
    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const displayValues = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();

    const days = [];
    for (let r = 0; r < values.length; r++) {
      const jour = String(displayValues[r][1] || '').trim();
      if (!/^J\d+$/i.test(jour)) continue;

      const sheetRow = r + 1;
      const doses = {};

      for (let i = 0; i < DOSE_MAP.length; i++) {
        const d = DOSE_MAP[i];
        const raw = values[r][d.valCol - 1];
        const disp = String(displayValues[r][d.valCol - 1] || '').trim().toUpperCase();
        const isBool = typeof raw === 'boolean' || disp === 'TRUE' || disp === 'FALSE';

        doses[d.key] = {
          active: isBool,
          checked: raw === true || disp === 'TRUE',
          detail: String(displayValues[r][d.descCol - 1] || '').trim(),
        };
      }

      days.push({
        jour: jour,
        sheetRow: sheetRow,
        date: String(displayValues[r][2] || '').trim(),
        phase: String(displayValues[r][3] || '').trim(),
        doses: doses,
        ration: String(displayValues[r][21] || '').trim(),
        transit: String(displayValues[r][22] || '').trim(),
        consignes: String(displayValues[r][23] || '').trim(),
      });
    }

    return jsonResponse_({ ok: true, days: days });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action !== 'toggle') {
      return jsonResponse_({ ok: false, error: 'Action inconnue' });
    }

    const row = Number(body.row);
    const colLetter = String(body.col || '').toUpperCase();
    const colIndex = ALLOWED_COLS[colLetter];

    if (!colIndex || !Number.isInteger(row) || row < 14 || row > 45) {
      return jsonResponse_({ ok: false, error: 'Cellule non autorisée' });
    }

    const sheet = getTargetSheet_();
    const cell = sheet.getRange(row, colIndex);
    const currentVal = cell.getValue();

    // Ne jamais écraser une cellule "—" (ex: Kéal après J10)
    if (typeof currentVal !== 'boolean') {
      return jsonResponse_({ ok: false, error: 'Cette cellule n’est pas une case à cocher' });
    }

    const nextVal = Boolean(body.value);
    cell.setValue(nextVal);
    SpreadsheetApp.flush();

    return jsonResponse_({
      ok: true,
      row: row,
      col: colLetter,
      value: nextVal,
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
