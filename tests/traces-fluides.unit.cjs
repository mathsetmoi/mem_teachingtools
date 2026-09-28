const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const section = (debut, fin) => source.slice(source.indexOf(debut), source.indexOf(fin, source.indexOf(debut)));
const familles = ['points', 'segments', 'circles', 'rectangles', 'texts', 'freehands', 'curves', 'polygons', 'images', 'arcs', 'htmlPostits'];
const vide = () => Object.fromEntries(familles.map(f => [f, []]));
const copie = x => JSON.parse(JSON.stringify(x));
const trait = id => ({ id, color: '#123456', points: [{ x: id, y: 10, p: .2 }, { x: id + 20, y: 30, p: .7 }] });

function socle() {
    const c = { ...vide(), FILM_FAMILLES: familles, history: [], historyIndex: -1,
        filmPas: [], filmDernierEtat: null, dernierEtatEncode: null, lectureOuverte: false,
        packImages: x => x, saveAppLocal: () => {}, HISTORY_MAX_ENTRIES: 200,
        HISTORY_MAX_BYTES: 24 * 1024 * 1024, pages: [{}], currentPageIndex: 0 };
    c.window = c;
    vm.createContext(c);
    vm.runInContext(section('function etapeDuFilm(', 'function imagesDuFilm('), c);
    vm.runInContext(section('function trimHistory(', 'function restoreState('), c);
    return c;
}

test('l’état JSON et les différences restent identiques au format existant', () => {
    const c = socle(), brut = vide();
    brut.texts.push({ id: 1, text: 'À recopier : « a,b »\n\\fin', absent: undefined, valeur: NaN });
    brut.freehands.push(trait(2));
    const a = c.encoderEtatPourHistorique(brut, null);
    assert.equal(a.state, JSON.stringify(brut));
    assert.deepEqual(copie(a.etat), copie(brut));
    brut.freehands.push(trait(3));
    const b = c.encoderEtatPourHistorique(brut, a);
    assert.equal(b.state, JSON.stringify(brut));
    assert.deepEqual(copie(b.pas), copie(c.etapeDuFilm(a.etat, b.etat)));
});

test('ajouter un trait ne relit que son ajout, même avec mille traits précédents', () => {
    const c = socle(), brut = vide();
    brut.freehands = Array.from({ length: 1000 }, (_, i) => trait(i));
    const a = c.encoderEtatPourHistorique(brut, null);
    const lus = [];
    c.JSON = { stringify: JSON.stringify, parse: s => { lus.push(s); return JSON.parse(s); } };
    brut.freehands.push(trait(1001));
    const b = c.encoderEtatPourHistorique(brut, a);
    assert.equal(lus.length, 1);
    assert.equal(lus[0], JSON.stringify([trait(1001)]));
    assert.equal(b.etat.freehands[0], a.etat.freehands[0]);
    brut.freehands[0].points[0].x = -500;
    brut.freehands[1000].points[0].x = -900;
    assert.equal(a.etat.freehands[0].points[0].x, 0);
    assert.equal(b.etat.freehands[1000].points[0].x, 1001);
});

test('les modifications en place, suppressions et changements d’ordre sont conservés', () => {
    const c = socle(), brut = vide();
    brut.freehands = [trait(1), trait(2), trait(3)];
    let dernier = c.encoderEtatPourHistorique(brut, null);
    for (const modifier of [
        () => { brut.freehands[0].points[1].x += 40; },
        () => { brut.freehands.splice(1, 1); },
        () => { brut.freehands.reverse(); },
        () => { brut.freehands.length = 0; },
        () => { brut.freehands.push(trait(9)); }
    ]) {
        modifier();
        const suivant = c.encoderEtatPourHistorique(brut, dernier);
        assert.equal(suivant.state, JSON.stringify(brut));
        assert.deepEqual(copie(suivant.pas), copie(c.etapeDuFilm(dernier.etat, suivant.etat)));
        dernier = suivant;
    }
});

test('le film correspond à chaque état, après annulation puis nouvelle écriture', () => {
    const c = socle();
    c.saveState();
    for (let i = 1; i <= 15; i++) { c.freehands.push(trait(i)); c.saveState(); }
    assert.deepEqual(copie(c.deroulerLeFilm(c.filmPas)), c.history);
    c.historyIndex -= 4;
    Object.assign(c, JSON.parse(c.history[c.historyIndex]));
    c.freehands.push(trait(100));
    c.saveState();
    assert.equal(c.historyIndex, c.history.length - 1);
    assert.equal(c.history.length, 13);
    assert.deepEqual(copie(c.deroulerLeFilm(c.filmPas)), c.history);
    const longueur = c.history.length;
    c.saveState();
    assert.equal(c.history.length, longueur, 'pas de nouvelle étape sans modification');
});

test('les archives conservent tout le film lorsque l’historique est plafonné', () => {
    const c = socle();
    c.HISTORY_MAX_ENTRIES = 6;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/tableau/film-complet.js'), 'utf8'), c);
    const attendus = [];
    for (let i = 0; i < 25; i++) {
        c.freehands.push(trait(i)); c.saveState();
        attendus.push(c.history[c.historyIndex]);
    }
    assert.equal(c.history.length, 6);
    assert.deepEqual(copie(c.deroulerLeFilm(c.filmPas)), c.history);
    const entier = c.pages[0].filmArchive.concat(c.filmPas);
    assert.deepEqual(copie(c.deroulerLeFilm(entier)), attendus);
    assert.ok(entier.every(p => p.t), 'les heures des étapes restent présentes');
});

test('une longue séance conserve un film compact et fidèle après réouverture', () => {
    const c = socle();
    c.HISTORY_MAX_BYTES = 14000;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/tableau/film-complet.js'), 'utf8'), c);
    const attendus = [];
    for (let i = 0; i < 300; i++) {
        c.freehands.push(trait(i)); c.saveState();
        attendus.push(c.history[c.historyIndex]);
    }
    const archive = c.pages[0].filmArchive;
    assert.ok(archive.length > 200);
    assert.ok(JSON.stringify(archive).length < c.history.at(-1).length * 1.5,
        'l’archive de simples ajouts reste de la taille des traits, sans copies complètes répétées');
    c.pages[0].film = c.filmPas;
    assert.deepEqual(copie(c.deroulerLeFilm(c.FilmComplet.filmEntier(c.pages[0]))), attendus);

    // Relecture depuis le disque : nouveaux objets, donc aucun cache en mémoire.
    c.pages[0] = copie(c.pages[0]);
    c.filmPas = c.pages[0].film;
    c.history = c.deroulerLeFilm(c.filmPas);
    c.historyIndex = c.history.length - 1;
    c.filmDernierEtat = null;
    for (let i = 300; i < 315; i++) {
        c.freehands.push(trait(i)); c.saveState();
        attendus.push(c.history[c.historyIndex]);
        // syncPage remplace lui aussi l'objet page sans changer l'archive.
        c.pages[0] = { ...c.pages[0], film: c.filmPas };
    }
    assert.deepEqual(copie(c.deroulerLeFilm(c.FilmComplet.filmEntier(c.pages[0]))), attendus);
    assert.ok(JSON.stringify(c.pages[0].filmArchive).length < c.history.at(-1).length * 1.5);
});

test('les archives anciennes sont allégées sans changer les étapes ni leurs heures', () => {
    const c = socle();
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/tableau/film-complet.js'), 'utf8'), c);
    const brut = vide();
    const ancienne = [];
    for (let i = 0; i < 45; i++) {
        brut.freehands.push(trait(i));
        if (i === 12) brut.freehands[2].points[0].x = 900;
        if (i === 25) brut.freehands.splice(4, 1);
        ancienne.push({ ...copie(brut), t: 1000 + i, repere: 'étape ' + i });
    }
    const p = { filmArchive: ancienne, film: [] };
    const attendus = copie(c.deroulerLeFilm(ancienne));
    c.FilmComplet.preparerArchive(p);
    assert.deepEqual(copie(c.deroulerLeFilm(p.filmArchive)), attendus);
    assert.deepEqual(p.filmArchive.map(pas => [pas.t, pas.repere]), ancienne.map(pas => [pas.t, pas.repere]));
    assert.ok(JSON.stringify(p.filmArchive).length < JSON.stringify(ancienne).length / 5);
    const dejaCompacte = p.filmArchive;
    c.FilmComplet.preparerArchive({ ...p });
    assert.equal(p.filmArchive, dejaCompacte);
});

test('la limite d’archive garde la bonne première image et la suite du film', () => {
    const c = socle();
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/tableau/film-complet.js'), 'utf8'), c);
    const film = [{ texts: [{ id: 1, text: 'Début' }], t: 100 }];
    for (let i = 1; i <= 4000; i++) film.push({ texts: [{ id: 1, text: String(i) }], t: 100 + i });
    const reduit = c.FilmComplet.contenirLArchive(film);
    assert.equal(reduit.length, 3001);
    assert.equal(reduit[0].t, 1100);
    assert.deepEqual(copie(c.deroulerLeFilm(reduit)), copie(c.deroulerLeFilm(film)).slice(1000));
});

test('un autre tableau ne réutilise pas le cache du précédent', () => {
    const c = socle();
    c.freehands.push(trait(1)); c.saveState();
    Object.assign(c, vide(), { history: [], historyIndex: -1, filmPas: [], filmDernierEtat: null });
    c.texts.push({ id: 7, text: 'Autre chapitre' }); c.saveState();
    assert.equal(c.filmPas.length, 1);
    assert.deepEqual(copie(c.deroulerLeFilm(c.filmPas)), c.history);
    assert.equal(JSON.parse(c.history[0]).freehands.length, 0);
});

test('la sauvegarde automatique attend le lever du stylet et la sauvegarde immédiate passe', () => {
    const timers = new Map(); let sequence = 0, ecritures = 0;
    const c = { autoSaveTimer: null, isDrawingFreehand: true, currentFreehand: trait(1),
        writeAppLocal: () => { ecritures++; },
        setTimeout: f => { timers.set(++sequence, f); return sequence; },
        clearTimeout: id => timers.delete(id) };
    vm.createContext(c);
    vm.runInContext(section('function saveAppLocal(', "// On n'attend pas"), c);
    const tic = () => { const [id, f] = timers.entries().next().value; timers.delete(id); f(); };
    c.saveAppLocal(); tic();
    assert.equal(ecritures, 0);
    assert.equal(timers.size, 1);
    c.isDrawingFreehand = false; c.currentFreehand = null; tic();
    assert.equal(ecritures, 1);
    assert.equal(timers.size, 0);
    c.isDrawingFreehand = true; c.currentFreehand = trait(2);
    c.saveAppLocal(); tic(); c.saveAppLocal(true);
    assert.equal(ecritures, 2);
    assert.equal(timers.size, 0);
});
