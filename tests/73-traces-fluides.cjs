const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Écrire sur un tableau chargé');
    const { context, page, erreurs } = await ouvrirApp(browser);
    try {
        const mesures = await page.evaluate(() => {
            const vide = () => Object.fromEntries(FILM_FAMILLES.map(f => [f, []]));
            const trait = id => ({ id, z: id, color: '#596675', width: 2,
                points: Array.from({ length: 100 }, (_, j) => ({
                    x: 30 + (id % 35) * 31 + j * .2,
                    y: 90 + Math.floor(id / 35) * 13 + Math.sin(j * .3) * 4,
                    p: .2 + (j % 17) * .03 })) });
            const tableau = vide();
            tableau.freehands = Array.from({ length: 1000 }, (_, i) => trait(i + 1));
            const avant = encoderEtatPourHistorique(tableau, null);
            tableau.freehands.push(trait(1001));
            const classique = () => {
                const state = JSON.stringify(tableau), etat = JSON.parse(state);
                return { state, pas: etapeDuFilm(avant.etat, etat) };
            };
            const rapide = () => encoderEtatPourHistorique(tableau, avant);
            classique(); rapide();
            const temps = { avant: [], apres: [] };
            for (let k = 0; k < 7; k++) {
                let t = performance.now(); classique(); temps.avant.push(performance.now() - t);
                t = performance.now(); rapide(); temps.apres.push(performance.now() - t);
            }
            const mediane = a => +a.sort((x, y) => x - y)[3].toFixed(2);
            const a = classique(), b = rapide();
            // La scène qui suit ne contient aucune donnée de cours réelle.
            freehands = tableau.freehands.slice(0, 1000);
            points = []; images = []; texts = []; selectedItems = []; hoveredObj = null;
            panX = 0; panY = 0; zoom = 1; nextId = 2000; globalZ = 2000;
            history = []; historyIndex = -1; filmPas = []; filmDernierEtat = null; dernierEtatEncode = null;
            saveState();
            setMode('freehand'); activeStyle.strokeColor = '#0984e3'; activeStyle.lineWidth = 6;
            activeStyle.arrowStart = 0; activeStyle.arrowEnd = 0;
            magnetMode = false; draw();
            return { traits: 1000, points: 100000, avantMs: mediane(temps.avant), apresMs: mediane(temps.apres),
                memeEtat: a.state === b.state, memeFilm: JSON.stringify(a.pas) === JSON.stringify(b.pas) };
        });
        console.log('   Mesure Chromium (1000 traits, 100000 points) : ' + JSON.stringify(mesures));
        r.verifie('l’encodage allégé conserve exactement l’état et le film', mesures.memeEtat && mesures.memeFilm);

        const survol = await page.evaluate(async () => {
            await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
            const chercher = window.findObjectAt, construire = window.buildRenderQuadtree;
            let recherches = 0, dessins = 0;
            window.findObjectAt = function () { recherches++; return chercher.apply(this, arguments); };
            window.buildRenderQuadtree = function () { dessins++; return construire.apply(this, arguments); };
            try {
                for (let k = 0; k < 40; k++) {
                    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'pen',
                        clientX: 250 + k, clientY: 610, pressure: 0, buttons: 0, bubbles: true, isPrimary: true }));
                }
                await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
                return { recherches, dessins };
            } finally { window.findObjectAt = chercher; window.buildRenderQuadtree = construire; }
        });
        r.egal('quarante survols au crayon ne parcourent ni ne redessinent le tableau', survol, { recherches: 0, dessins: 0 });

        const ecriture = await page.evaluate(async () => {
            const ev = (t, x, options = {}) => canvas.dispatchEvent(new PointerEvent(t, {
                pointerId: 7, pointerType: 'pen', clientX: x, clientY: 620,
                pressure: .6, buttons: 1, bubbles: true, isPrimary: true, ...options }));
            const chercher = window.findObjectAt;
            let recherches = 0;
            window.findObjectAt = function () { recherches++; return chercher.apply(this, arguments); };
            const historiques = history.length;
            try {
                ev('pointerdown', 300);
                const auContact = recherches;
                for (let k = 1; k <= 8; k++) {
                    ev('pointermove', 300 + k * 12);
                    await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
                }
                const pixel = Array.from(ctx.getImageData(348, 620, 1, 1).data);
                const calqueActif = calqueUtilisable();
                ev('pointerup', 396, { buttons: 0, pressure: 0 });
                const dernier = freehands[freehands.length - 1];
                const filmConforme = deroulerLeFilm(filmPas).every((s, i) => s === history[i]);
                const apres = freehands.length;
                undo(); const annule = freehands.length;
                redo(); const refait = freehands.length;
                return { auContact, calqueActif, bleuVisible: pixel[2] > 150 && pixel[0] < 100,
                    points: dernier.points.length, depart: dernier.points[0].x,
                    fin: dernier.points[dernier.points.length - 1].x,
                    etapes: history.length - historiques, filmConforme, apres, annule, refait };
            } finally { window.findObjectAt = chercher; }
        });
        r.egal('poser le crayon ne recherche pas un objet parmi les mille traits', ecriture.auContact, 0);
        r.verifie('le trait se voit pendant l’écriture avec le fond conservé', ecriture.calqueActif && ecriture.bleuVisible, JSON.stringify(ecriture));
        r.verifie('le trait garde tous ses points, du contact au relâchement', ecriture.points === 9 && ecriture.depart === 300 && ecriture.fin === 396, JSON.stringify(ecriture));
        r.verifie('une lettre ajoute une étape et son replay reste fidèle', ecriture.etapes === 1 && ecriture.filmConforme, JSON.stringify(ecriture));
        r.egal('annuler puis refaire retrouve le même nombre de traits',
            [ecriture.apres, ecriture.annule, ecriture.refait], [1001, 1000, 1001]);

        const selection = await page.evaluate(() => {
            setMode('pointer');
            return findObjectAt(348, 620);
        });
        r.verifie('la flèche peut toujours sélectionner le trait ajouté', selection && selection.type === 'freehand', JSON.stringify(selection));
        r.verifie('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
        return r.bilan();
    } finally { await context.close(); }
};
