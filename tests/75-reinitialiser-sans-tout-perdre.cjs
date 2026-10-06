// RÉINITIALISER L'INTERFACE NE DOIT PAS COÛTER SA CONFIGURATION.
//
// « J'ai cliqué sur la réinitialisation et cela a même enlevé ma clé API : je
// dois tout reconfigurer. »
//
// Le bouton appelait « localStorage.clear() » : il emportait l'apparence —
// ce qu'on lui demandait — mais aussi la clé de lecture des séances,
// l'adresse du lecteur, le dossier du Drive qu'on regarde et les classes.
// Les premières se refont en trois clics ; les secondes se retrouvent dans
// une console Google, un quart d'heure plus tard.
//
// CE QU'ON TIENT ICI :
//   — l'apparence s'en va vraiment (barres, favoris, tiroirs, rubrique) ;
//   — les comptes et le rangement restent (publication, Drive, classes) ;
//   — les trois boutons qui réinitialisent passent par le même chemin ;
//   — ce qui est à part (les tableaux, dans IndexedDB) n'est pas touché.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Réinitialiser sans tout perdre');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // Un poste déjà configuré : des réglages de comptes, et de l'apparence.
    const avant = await page.evaluate(() => {
        localStorage.setItem('AuTableau_publication', JSON.stringify({ cle: 'CLE_DU_PROF', adresse: 'https://exemple.fr' }));
        localStorage.setItem('AuTableau_publication_liens', JSON.stringify({ 'drive:2nde/cours.prof': { id: 'SEANCE_1' } }));
        localStorage.setItem('AuTableau_dossier_actif', 'emplacement_3');
        localStorage.setItem('AuTableau_source_tableaux', 'dossier');
        localStorage.setItem('board_dropbox', '{"appKey":"abc"}');
        localStorage.setItem('auTableau_classes', '[{"id":"c1","nom":"2nde 3"}]');
        // L'apparence, elle, doit repartir à zéro.
        localStorage.setItem('board_favorites', '["freehand","laser"]');
        localStorage.setItem('board_floating_toolbars', '{"bar-tools":{"x":10}}');
        localStorage.setItem('drawer_active_category', 'Jeux');
        localStorage.setItem('bar_style_x', '420');
        return Object.keys(localStorage).length;
    });
    r.verifie('le poste d\'essai porte bien ses réglages', avant >= 10, 'clés : ' + avant);

    // ------------------------------------------------------------------
    // 1. CE QUI RESTE, ET CE QUI PART
    // ------------------------------------------------------------------
    const apres = await page.evaluate(() => {
        const gardes = reinitialiserLInterface();
        const lire = (k) => localStorage.getItem(k);
        return {
            gardes,
            publication: lire('AuTableau_publication'),
            liens: lire('AuTableau_publication_liens'),
            dossierActif: lire('AuTableau_dossier_actif'),
            source: lire('AuTableau_source_tableaux'),
            dropbox: lire('board_dropbox'),
            classes: lire('auTableau_classes'),
            favoris: lire('board_favorites'),
            barres: lire('board_floating_toolbars'),
            rubrique: lire('drawer_active_category'),
            position: lire('bar_style_x')
        };
    });

    r.egal('la clé de publication et l\'adresse du lecteur restent',
        JSON.parse(apres.publication || 'null'), { cle: 'CLE_DU_PROF', adresse: 'https://exemple.fr' }, JSON.stringify(apres));
    r.egal('les liens déjà donnés aux élèves restent, donc on continue de mettre à jour les mêmes séances',
        JSON.parse(apres.liens || 'null'), { 'drive:2nde/cours.prof': { id: 'SEANCE_1' } }, JSON.stringify(apres));
    r.egal('le dossier du Drive qu\'on regarde et la source restent',
        { dossier: apres.dossierActif, source: apres.source }, { dossier: 'emplacement_3', source: 'dossier' }, JSON.stringify(apres));
    r.egal('les comptes en ligne et les classes restent',
        { dropbox: apres.dropbox, classes: apres.classes },
        { dropbox: '{"appKey":"abc"}', classes: '[{"id":"c1","nom":"2nde 3"}]' }, JSON.stringify(apres));

    r.egal('l\'apparence, elle, repart à zéro',
        { favoris: apres.favoris, barres: apres.barres, rubrique: apres.rubrique, position: apres.position },
        { favoris: null, barres: null, rubrique: null, position: null }, JSON.stringify(apres));

    // ------------------------------------------------------------------
    // 2. LES TROIS BOUTONS PASSENT PAR LE MÊME CHEMIN
    // ------------------------------------------------------------------
    // On lit le code source depuis le disque : la page, ouverte en « file:// »,
    // n'a pas le droit d'aller se chercher elle-même.
    const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'script.js'), 'utf8');
    const lignes = source.split(/\r?\n/).filter(l => !l.trim().startsWith('//'));
    const code = lignes.join(' ');
    const compter = (motif) => (code.match(new RegExp(motif, 'g')) || []).length;
    const chemins = { vidages: compter('localStorage\\.clear\\(\\)'),
                      passages: compter('reinitialiserLInterface\\(\\)') };
    r.egal('un seul endroit vide le stockage, et trois boutons y mènent',
        { vidages: chemins.vidages, boutons: chemins.passages >= 4 }, { vidages: 1, boutons: true }, JSON.stringify(chemins));

    // ------------------------------------------------------------------
    // 3. CE QUI VIT AILLEURS N'EST PAS TOUCHÉ
    // ------------------------------------------------------------------
    const aPart = await page.evaluate(async () => {
        await localforage.setItem('essai_tableau', { pages: [{ freehands: [1, 2, 3] }] });
        reinitialiserLInterface();
        const garde = await localforage.getItem('essai_tableau');
        await localforage.removeItem('essai_tableau');
        return !!(garde && garde.pages);
    });
    r.verifie('les tableaux, rangés ailleurs, traversent la réinitialisation', aPart);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
