const { creerRapport, ouvrirApp } = require('./harness.cjs');
const fs = require('node:fs');

module.exports = async function (browser) {
    const r = creerRapport('Annotations ajoutées au montage du replay');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 1000 } });
    fs.mkdirSync('test-artifacts', { recursive: true });
    try {
        await page.evaluate(async () => {
            initPages();
            freehands.length = 0; history.length = 0; historyIndex = -1; filmPas.length = 0;
            saveState();
            for (let i = 0; i < 7; i++) {
                freehands.push({ id: nextId++, type: 'freehand', color: '#224488', size: 3,
                    points: [{ x: 20, y: 30 + i * 20 }, { x: 180, y: 55 + i * 20 }] });
                saveState();
            }
            syncPage();
            window.__filmOriginal = JSON.stringify(stateForStorage().pages.map(p => FilmComplet.filmEntier(p)));
            await Publication.ouvrir('montage');
        });
        const pret = () => page.waitForFunction(() => !document.querySelector('#montage-annotation-ajouter').disabled);
        await pret();
        const frame = page.frames().find(f => f.url().includes('montage='));
        const ajouter = async (texte, debut, fin) => {
            await page.locator('#montage-annotation-debut').fill(String(debut));
            await page.locator('#montage-annotation-fin').fill(String(fin));
            await page.locator('#montage-annotation-texte').fill(texte);
            r.egal('saisir le texte conserve les étapes déjà choisies pour ' + texte,
                await page.evaluate(() => [document.querySelector('#montage-annotation-debut').value,
                    document.querySelector('#montage-annotation-fin').value]), [String(debut), String(fin)]);
            await page.locator('#montage-annotation-ajouter').click();
        };
        await page.getByRole('button', { name: 'Médiatrice et non bissectrice', exact: true }).click();
        r.egal('le modèle de correction prépare le texte et la présentation', await page.evaluate(() => [
            document.querySelector('#montage-annotation-texte').value, document.querySelector('#montage-annotation-style').value
        ]), ['Médiatrice et non bissectrice', 'correction']);
        await page.locator('#montage-annotation-debut').fill('2');
        await page.locator('#montage-annotation-fin').fill('6');
        await page.locator('#montage-annotation-ajouter').click();
        await page.getByRole('button', { name: 'Modifier le message : Médiatrice et non bissectrice', exact: true }).click();
        await pret();
        await page.locator('#montage-annotation-texte').fill('Médiatrice, et non bissectrice.');
        await page.locator('#montage-annotation-ajouter').click();
        r.egal('modifier remplace le message sans le dupliquer', await page.locator('.montage-annotation-contenu b').allTextContents(),
            ['Médiatrice, et non bissectrice.']);

        await ajouter('Rappel temporaire', 1, 1);
        await page.getByRole('button', { name: 'Supprimer le message : Rappel temporaire', exact: true }).click();
        r.egal('un message peut être supprimé', await page.locator('.montage-annotation').count(), 1);
        await ajouter('À terminer', 3, 3);
        await ajouter('À recopier', 4, 6);
        const litteral = '<img src=x onerror=alert(1)> & rappel';
        await ajouter(litteral, 7, 7);
        await page.locator('#montage-debut').fill('3');
        await page.locator('#montage-fin').fill('4');
        await page.locator('#montage-retirer').click();
        r.verifie('un message entièrement coupé est signalé avant publication',
            /À terminer.*Passage entièrement retiré/s.test(await page.locator('.hors-montage').textContent()));
        await page.locator('#montage-apercu').click();
        await page.waitForFunction(() => /Montage · page 1 · étape 1 sur 6/.test(document.querySelector('#montage-position').textContent));
        r.verifie('aucun bandeau avant l’apparition choisie', !(await frame.locator('#lecteur-annotations').isVisible()));
        await frame.locator('#lecteur-suiv').click();
        r.egal('la correction apparaît au bon moment après les coupes', await frame.locator('.lecteur-annotation span').allTextContents(),
            ['Médiatrice, et non bissectrice.']);
        await frame.locator('#lecteur-suiv').click();
        r.egal('deux messages peuvent être visibles ensemble', await frame.locator('.lecteur-annotation span').allTextContents(),
            ['Médiatrice, et non bissectrice.', 'À recopier']);
        await frame.evaluate(() => { window.__noteVisible = document.querySelector('.lecteur-annotation'); });
        await frame.locator('#lecteur-suiv').click();
        r.verifie('le bandeau reste stable entre deux étapes', await frame.evaluate(() =>
            window.__noteVisible === document.querySelector('.lecteur-annotation')));
        await frame.locator('#lecteur-vitesse').selectOption('120');
        r.egal('changer la vitesse ne décale pas les annotations', await frame.locator('.lecteur-annotation span').count(), 2);
        await page.locator('#montage-apercu').scrollIntoViewIfNeeded();
        await page.screenshot({ path: 'test-artifacts/montage-annotations-apercu.png' });
        await frame.locator('#lecteur-suiv').click();
        r.egal('le contenu saisi reste du texte, sans interprétation HTML',
            { texte: await frame.locator('.lecteur-annotation span').textContent(), images: await frame.locator('#lecteur-annotations img').count() },
            { texte: litteral, images: 0 });
        await frame.locator('#lecteur-suiv').click();
        r.verifie('le bandeau disparaît à la fin choisie', !(await frame.locator('#lecteur-annotations').isVisible()));
        await frame.locator('#lecteur-prec').click();
        r.egal('revenir en arrière réaffiche le message attendu', await frame.locator('.lecteur-annotation span').textContent(), litteral);

        await page.getByRole('button', { name: 'Continuer vers la publication', exact: true }).click();
        await page.evaluate(() => {
            Publication.poserLesReglages({ cle: 'CLE_TEST', clientId: 'CLIENT_TEST', adresse: 'https://exemple.fr/Autableau' });
            DrivePublication.connecte = () => true;
            DrivePublication.publier = async (nom, contenu) => { window.__replayAnnote = JSON.parse(JSON.stringify(contenu)); return { id: 'ANNOTATIONS_TEST' }; };
            localStorage.setItem('AuTableau_publication_prevenu', 'oui');
            Publication.rendre();
        });
        await page.locator('#pub-titre').fill('Construction de la médiatrice');
        await page.locator('#pub-docs').uncheck();
        await page.getByRole('button', { name: 'Publier la séance', exact: true }).click();
        await page.waitForFunction(() => !!window.__replayAnnote);
        const publie = await page.evaluate(() => window.__replayAnnote);
        r.egal('la copie publiée conserve les annotations aux étapes montées', publie.data.pages[0].annotationsReplay, [
            { debut: 1, fin: 3, texte: 'Médiatrice, et non bissectrice.', style: 'correction' },
            { debut: 2, fin: 3, texte: 'À recopier', style: 'consigne' },
            { debut: 4, fin: 4, texte: litteral, style: 'consigne' }
        ]);
        r.verifie('le film du professeur reste intact', await page.evaluate(() =>
            window.__filmOriginal === JSON.stringify(stateForStorage().pages.map(p => FilmComplet.filmEntier(p)))));
        await page.evaluate(async () => { Publication.fermer(); await Publication.ouvrir('montage'); });
        r.egal('fermer et rouvrir le montage conserve les messages préparés', await page.locator('.montage-annotation').count(), 4);

        const mobile = await context.newPage();
        await mobile.setViewportSize({ width: 390, height: 844 });
        const url = new URL(page.url()); url.search = 'lecteur=1';
        await mobile.goto(url.href);
        await mobile.waitForFunction(() => !!window.Lecteur && !!document.querySelector('#lecteur-bas'));
        await mobile.evaluate(async contenu => {
            await Lecteur.charger(contenu);
            document.querySelector('#lecteur-demarrer').click();
            Lecteur.pause(); Lecteur.poser(2);
        }, publie);
        r.egal('un lecteur indépendant retrouve les messages de la copie publiée',
            await mobile.locator('.lecteur-annotation span').allTextContents(), ['Médiatrice, et non bissectrice.', 'À recopier']);
        r.verifie('les annotations et les commandes tiennent sur téléphone sans se recouvrir', await mobile.evaluate(() => {
            const zone = document.querySelector('#lecteur-annotations').getBoundingClientRect();
            const curseur = document.querySelector('#lecteur-curseur').getBoundingClientRect();
            return zone.left >= 0 && zone.right <= innerWidth && zone.top > 0 && zone.bottom <= curseur.top
                && document.querySelector('#lecteur-bas').getBoundingClientRect().bottom <= innerHeight + 1;
        }));
        await mobile.screenshot({ path: 'test-artifacts/montage-annotations-mobile.png' });
        await mobile.evaluate(async contenu => {
            contenu.data.pages.push({ film: [], freehands: [] });
            await Lecteur.charger(contenu); Lecteur.changerDePage(1);
        }, publie);
        r.verifie('les messages d’une page ne débordent pas sur la suivante', !(await mobile.locator('#lecteur-annotations').isVisible()));
        await mobile.evaluate(async () => { await Lecteur.charger({ pages: [{ film: [], freehands: [] }] }); });
        r.verifie('une ancienne séance sans annotations se charge toujours', await mobile.evaluate(() => Lecteur.etat().chargee));
        r.verifie('aucune erreur JavaScript dans le montage', erreurs.length === 0, erreurs.join(' | '));
    } finally {
        await context.close();
    }
    return r.bilan();
};
