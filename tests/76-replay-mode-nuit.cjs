// LE REPLAY SE REJOUE DANS LE MODE OÙ L'ON A ÉCRIT.
//
// « J'ai utilisé le mode nuit et écrit en blanc. Lorsque je joue le replay on
// ne voit pas l'écriture car le fond est blanc. »
//
// Le mode nuit n'était qu'un réglage de l'écran : il ne partait pas avec le
// tableau, et le lecteur, ouvert dans un navigateur neuf, rejouait la craie
// blanche sur un fond blanc. Il est maintenant enregistré avec la séance.
const { creerRapport, ouvrirApp, APP_URL } = require('./harness.cjs');

// La couleur du fond du tableau, prise dans un coin où rien n'est écrit.
const FOND = () => {
    const c = document.getElementById('board');
    const [r, g, b] = c.getContext('2d').getImageData(5, Math.floor(c.height / 2), 1, 1).data;
    return (r + g + b) / 3;
};

module.exports = async function (browser) {
    const r = creerRapport('Le replay garde le mode nuit');

    // 1. Le tableau enregistré porte le mode nuit.
    const { context, page, erreurs } = await ouvrirApp(browser);
    try {
        const avant = await page.evaluate(() => stateForStorage().modeNuit);
        r.egal('en mode jour, le tableau se dit en mode jour', avant, false);
        await page.evaluate(() => toggleDarkMode());
        const apres = await page.evaluate(() => stateForStorage().modeNuit);
        r.egal('en mode nuit, le tableau se dit en mode nuit', apres, true);
        r.verifie('aucune erreur JavaScript dans l\'application', erreurs.length === 0, erreurs.join(' | '));
    } finally { await context.close(); }

    // 2. Le lecteur, ouvert dans un navigateur neuf, reprend ce mode.
    const lecteur = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const p = await lecteur.newPage();
    const erreursLecteur = [];
    p.on('pageerror', e => {
        if (!/jsPDF|pdfjsLib|localforage is not defined|getUserMedia|mediaDevices|ResizeObserver loop/.test(e.message)) erreursLecteur.push(e.message);
    });
    try {
        await p.goto(APP_URL + '?lecteur=1');
        await p.waitForFunction(() => window.Lecteur && window.PluginManager);
        const seance = (modeNuit) => p.evaluate(async (modeNuit) => {
            const vide = () => Object.fromEntries(FILM_FAMILLES.map(f => [f, []]));
            const craie = { id: 1, color: '#ffffff', width: 6, points: [{ x: 300, y: 200 }, { x: 600, y: 200 }] };
            const data = { pages: [{ ...vide(), freehands: [craie],
                film: [vide(), { freehands: [craie] }] }], nextId: 5, globalZ: 5, currentBgIndex: 0 };
            if (modeNuit !== undefined) data.modeNuit = modeNuit;
            await Lecteur.charger({ name: 'Craie blanche', data });
            draw();
            return { nuit: isDarkMode, classe: document.body.classList.contains('dark-mode') };
        }, modeNuit);

        const nuit = await seance(true);
        r.verifie('une séance écrite de nuit se rejoue de nuit', nuit.nuit && nuit.classe, JSON.stringify(nuit));
        r.verifie('le fond du replay est sombre', await p.evaluate(FOND) < 80, String(await p.evaluate(FOND)));

        const jour = await seance(false);
        r.verifie('une séance écrite de jour se rejoue de jour', !jour.nuit && !jour.classe, JSON.stringify(jour));
        r.verifie('le fond du replay est clair', await p.evaluate(FOND) > 200, String(await p.evaluate(FOND)));

        // Un tableau publié avant ce correctif ne dit rien : on n'y touche pas.
        const ancien = await seance(undefined);
        r.verifie('une séance d\'avant garde le mode en place', !ancien.nuit, JSON.stringify(ancien));
        r.verifie('aucune erreur JavaScript dans le lecteur', erreursLecteur.length === 0, erreursLecteur.join(' | '));
    } finally { await lecteur.close(); }

    return r.bilan();
};
