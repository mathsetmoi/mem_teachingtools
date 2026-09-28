const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../lib/lecteur/montage.js'), 'utf8'), ctx);
const M = ctx.window.MontageReplay;
const simple = x => JSON.parse(JSON.stringify(x));
const trait = (id, color = 'bleu') => ({ id, color });
function source() {
    const a = trait(1), erreur = trait(2, 'rouge'), b = trait(3), c = trait(4);
    return { nomDuTableau: 'Cours', assets: { inutile: 'image', garde: 'image conservée', pdf: 'document' }, pages: [{
        freehands: [a, b, c], images: [], history: ['ancienne erreur'], historyIndex: 4, preview: 'ancienne miniature',
        filmArchive: [{ freehands: [], images: [] }, { freehands: { '+': [a] } }],
        film: [{ freehands: { '+': [erreur] }, images: [{ id: 5, srcRef: 'inutile' }] },
            { freehands: [a, b], images: [] }, { freehands: { '+': [c] } }]
    }] };
}
// Décodage indépendant, avec les deux familles utilisées dans ces exemples.
function etats(p) {
    let traits = [], images = [];
    return (p.filmArchive || []).concat(p.film || []).map(f => {
        for (const famille of ['freehands', 'images']) {
            const v = f[famille];
            let precedent = famille === 'freehands' ? traits : images;
            if (v) precedent = Array.isArray(v) ? v : precedent.concat(v['+'] || []);
            if (famille === 'freehands') traits = precedent; else images = precedent;
        }
        return simple({ traits, images });
    });
}

test('une erreur de couleur retirée ne revient pas au raccord ; le tableau original reste intact', () => {
    const s = source(), avant = JSON.stringify(s);
    const m = M.monter(s, [{ page: 0, debut: 2, fin: 2 }]);
    assert.deepEqual(etats(m.pages[0]), etats(s.pages[0]).filter((_, i) => i !== 2));
    assert.equal(JSON.stringify(s), avant);
    assert.equal(JSON.stringify(m).includes('rouge'), false);
    assert.equal(JSON.stringify(m).includes('ancienne'), false);
    assert.equal(m.assets.inutile, undefined);
});

test('couper le début et la fin reconstruit aussi le tableau final affiché à l’ouverture', () => {
    const s = source();
    const m = M.monter(s, [{ page: 0, debut: 0, fin: 1 }, { page: 0, debut: 4, fin: 4 }]);
    assert.deepEqual(etats(m.pages[0]), etats(s.pages[0]).slice(2, 4));
    assert.deepEqual(simple(m.pages[0].freehands), [trait(1), trait(3)]);
    assert.equal(m.pages[0].filmArchive, undefined);
});

test('une coupe saute les étapes mais conserve les objets encore présents après le passage', () => {
    const s = source();
    const m = M.monter(s, [{ page: 0, debut: 1, fin: 2 }]);
    assert.deepEqual(etats(m.pages[0]), etats(s.pages[0]).filter((_, i) => i !== 1 && i !== 2));
    assert.equal(etats(m.pages[0])[1].traits[0].id, 1);
});

test('plusieurs coupes qui se recouvrent ne sont comptées qu’une fois', () => {
    const stats = M.bilan(source(), [{ page: 0, debut: 1, fin: 2 }, { page: 0, debut: 2, fin: 3 }]);
    assert.equal(stats.retirees, 3);
    assert.equal(stats.gardees, 2);
    assert.deepEqual(simple(stats.passages), [{ page: 0, debut: 1, fin: 3 }]);
});

test('une page entière peut être retirée, mais jamais toutes les pages', () => {
    const s = source(); s.pages.push({ freehands: [trait(99)], images: [], film: [] });
    const coupe = [{ page: 0, debut: 0, fin: 4 }];
    const m = M.monter(s, coupe);
    assert.equal(m.pages.length, 1);
    assert.deepEqual(simple(m.pages[0].freehands), [trait(99)]);
    assert.throws(() => M.monter(s, coupe.concat({ page: 1, debut: 0, fin: 0 })), /au moins une étape/);
});

test('sans documents : aucune image ni source dans les étapes conservées, même archivées', () => {
    const s = source();
    s.pages[0].filmArchive[0].images = [{ id: 6, srcRef: 'garde', pluginData: { pdfRef: 'pdf' } }];
    const avec = M.monter(s, []);
    assert.equal(avec.assets.pdf, 'document');
    const sans = M.monter(s, [], false);
    assert.deepEqual(simple(sans.assets), {});
    assert.equal(etats(sans.pages[0]).every(e => !e.images.length), true);
    assert.equal(sans.pages[0].images.length, 0);
    assert.equal(s.pages[0].filmArchive[0].images.length, 1);
});

test('une longue séance reste encodée en différences après plusieurs coupes', () => {
    const s = { pages: [{ film: [{ freehands: [] }] }] };
    for (let i = 1; i <= 1200; i++) s.pages[0].film.push({ t: i, freehands: { '+': [trait(i)] } });
    const coupes = [{ page: 0, debut: 190, fin: 230 }, { page: 0, debut: 700, fin: 850 }];
    const m = M.monter(s, coupes);
    const attendus = etats(s.pages[0]).filter((_, i) => !coupes.some(c => i >= c.debut && i <= c.fin));
    assert.deepEqual(etats(m.pages[0]), attendus);
    assert.ok(JSON.stringify(m).length < JSON.stringify(s).length * 3);
});

test('des bornes impossibles sont refusées sans produire de copie', () => {
    for (const c of [ { page: 0, debut: 2, fin: 1 }, { page: 0, debut: -1, fin: 1 },
        { page: 0, debut: 0, fin: 5 }, { page: 2, debut: 0, fin: 0 }, { page: 0, debut: 1.2, fin: 2 } ]) {
        assert.throws(() => M.monter(source(), [c]));
    }
});

test('les annotations suivent les étapes conservées, même après le retrait d’une page', () => {
    const s = source();
    s.pages.unshift({ film: [{ freehands: [] }] });
    const avant = JSON.stringify(s);
    const m = M.monter(s, [{ page: 0, debut: 0, fin: 0 }, { page: 1, debut: 1, fin: 2 }], true, [
        { page: 1, debut: 1, fin: 4, texte: '  Médiatrice et non bissectrice  ', style: 'correction' },
        { page: 1, debut: 1, fin: 2, texte: 'Passage retiré' },
        { page: 0, debut: 0, fin: 0, texte: 'Page retirée' }
    ]);
    assert.deepEqual(simple(m.pages[0].annotationsReplay), [
        { debut: 1, fin: 2, texte: 'Médiatrice et non bissectrice', style: 'correction' }
    ]);
    assert.equal(JSON.stringify(s), avant);
    assert.equal(JSON.stringify(m).includes('retiré'), false);
});

test('les messages peuvent se chevaucher, commencer ou finir dans une coupe', () => {
    const annotations = [
        { page: 0, debut: 0, fin: 2, texte: 'À recopier', style: 'consigne' },
        { page: 0, debut: 2, fin: 4, texte: 'Rappel', style: 'rappel' }
    ];
    const m = M.monter(source(), [{ page: 0, debut: 2, fin: 2 }], false, annotations);
    assert.deepEqual(simple(m.pages[0].annotationsReplay), [
        { debut: 0, fin: 1, texte: 'À recopier', style: 'consigne' },
        { debut: 2, fin: 3, texte: 'Rappel', style: 'rappel' }
    ]);
    const repub = M.monter(m, []);
    assert.deepEqual(simple(repub.pages[0].annotationsReplay), simple(m.pages[0].annotationsReplay));
    assert.equal(M.monter(m, [], true, []).pages[0].annotationsReplay, undefined);
});

test('un tableau sans film accepte une annotation sur son unique étape', () => {
    const s = { pages: [{ freehands: [], film: [] }] };
    const m = M.monter(s, [], true, [{ page: 0, debut: 0, fin: 0, texte: 'À terminer', style: 'inconnu' }]);
    assert.deepEqual(simple(m.pages[0].annotationsReplay), [{ debut: 0, fin: 0, texte: 'À terminer', style: 'consigne' }]);
    assert.notEqual(M.empreinte(s), M.empreinte(m));
});

test('un message vide, trop long ou hors du film est refusé avant publication', () => {
    const valide = { page: 0, debut: 0, fin: 2, texte: 'Voir Classroom' };
    for (const mauvais of [{ texte: ' ' }, { texte: 'a'.repeat(281) }, { texte: 42 },
        { page: 8 }, { debut: -1 }, { debut: 3 }, { fin: 5 }, { fin: 2.1 }]) {
        assert.throws(() => M.monter(source(), [], true, [{ ...valide, ...mauvais }]));
    }
    const texte = '<img src=x onerror=alert(1)> & rappel';
    assert.equal(M.monter(source(), [], true, [{ ...valide, texte }]).pages[0].annotationsReplay[0].texte, texte);
});
