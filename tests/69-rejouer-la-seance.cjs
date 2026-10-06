// REJOUER LA SÉANCE, POUR LES ÉLÈVES ET LES PARENTS.
//
// « Je voudrais pouvoir insérer un tableau dans le cahier de texte Pronote…
// que le fichier déposé soit relisable en appuyant sur play pour les élèves
// et les parents. Les élèves pourraient se refaire la séance. »
//
// Trois pièces, éprouvées ici :
//
//   — LE FILM ENTIER. L'historique d'annulation s'arrête à deux cents états ;
//     ce qu'il jette partait avec. Il est maintenant archivé sur la page, et
//     le film enregistré porte toute l'heure de cours.
//   — LE LECTEUR. Une page sans un outil, un bouton de lecture, le film
//     rejoué pas à pas — et les mains liées : rien ne s'écrit, ni sur le
//     tableau, ni dans le navigateur de l'élève.
//   — LA PUBLICATION. Seule la copie de la séance est partagée sur Drive, et le
//     lien qui la rejoue se copie pour Pronote.
const path = require('path');
const { creerRapport, ouvrirApp, APP_URL } = require('./harness.cjs');

// Le faux Drive du chapitre 65, repris tel quel : des poignées neuves à
// chaque appel, rangées dans le stockage de session.
const FAUX_DRIVE = `(() => {
    function drive(cle) {
        const lire = () => { try { return JSON.parse(sessionStorage.getItem(cle) || '{"dossiers":[],"fichiers":{}}'); } catch (e) { return { dossiers: [], fichiers: {} }; } };
        const garder = (fs) => sessionStorage.setItem(cle, JSON.stringify(fs));
        const joindre = (p, n) => p ? p + '/' + n : n;
        const absent = () => { const e = new Error('absent'); e.name = 'NotFoundError'; return e; };
        function fichier(chemin) {
            const nom = chemin.split('/').pop();
            return { kind: 'file', name: nom,
                isSameEntry: async (o) => !!o && o.kind === 'file' && o.__cle === cle && o.__chemin === chemin,
                __cle: cle, __chemin: chemin,
                getFile: async () => { const f = lire().fichiers[chemin]; if (!f) throw absent();
                    return { name: nom, lastModified: f.date, size: f.texte.length, text: async () => f.texte }; },
                createWritable: async () => { let tampon = ''; return {
                    write: async (c) => { tampon = typeof c === 'string' ? c : String(c); },
                    close: async () => { const fs = lire(); fs.fichiers[chemin] = { texte: tampon, date: Date.now() }; garder(fs); } }; } };
        }
        function dossier(chemin) {
            const nom = chemin ? chemin.split('/').pop() : 'Mon Drive';
            const direct = (p, prefixe) => p.startsWith(prefixe) && p.length > prefixe.length && !p.slice(prefixe.length).includes('/');
            return { kind: 'directory', name: nom,
                isSameEntry: async (o) => !!o && o.kind === 'directory' && o.__cle === cle && o.__chemin === chemin,
                __cle: cle, __chemin: chemin,
                queryPermission: async () => 'granted',
                requestPermission: async () => 'granted',
                entries: async function* () {
                    const fs = lire(); const prefixe = chemin ? chemin + '/' : '';
                    for (const d of fs.dossiers) if (direct(d, prefixe)) yield [d.split('/').pop(), dossier(d)];
                    for (const f of Object.keys(fs.fichiers)) if (direct(f, prefixe)) yield [f.split('/').pop(), fichier(f)];
                },
                getDirectoryHandle: async (n, o) => { const fs = lire(); const p = joindre(chemin, n);
                    if (fs.dossiers.includes(p)) return dossier(p);
                    if (!o || !o.create) throw absent();
                    fs.dossiers.push(p); garder(fs); return dossier(p); },
                getFileHandle: async (n, o) => { const fs = lire(); const p = joindre(chemin, n);
                    if (fs.fichiers[p]) return fichier(p);
                    if (!o || !o.create) throw absent();
                    fs.fichiers[p] = { texte: '', date: Date.now() }; garder(fs); return fichier(p); },
                removeEntry: async (n) => { const fs = lire(); const p = joindre(chemin, n);
                    if (fs.fichiers[p]) delete fs.fichiers[p]; else throw absent();
                    garder(fs); } };
        }
        return { racine: () => dossier(''), tout: lire,
                 tableau: (p) => { const f = lire().fichiers[p]; return f ? JSON.parse(f.texte) : null; } };
    }
    window.__driveA = drive('__faux_drive_pub');
})()`;

// Une séance fabriquée à la main : N traits posés l'un après l'autre, chacun
// une étape du film. C'est exactement ce que fait une heure de cours.
const ECRIRE = (n) => {
    freehands.length = 0; texts.length = 0; images.length = 0; points.length = 0;
    history.length = 0; historyIndex = -1; filmPas.length = 0;
    const page = pages[currentPageIndex];
    if (page) page.filmArchive = [];
    saveState();
    for (let i = 0; i < n; i++) {
        freehands.push({ id: nextId++, type: 'freehand', color: '#2d3436', size: 3,
            points: [{ x: 100 + i * 7, y: 200 + (i % 9) * 11 }, { x: 140 + i * 7, y: 240 + (i % 9) * 11 }] });
        saveState();
    }
    syncPage();
    return { pas: FilmComplet.filmEntier(pages[currentPageIndex]).length,
             archive: (pages[currentPageIndex].filmArchive || []).length,
             historique: history.length, traits: freehands.length };
};

module.exports = async function (browser) {
    const r = creerRapport('Rejouer la séance (lecteur et publication)');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await context.addInitScript(FAUX_DRIVE);
    await page.evaluate(FAUX_DRIVE);
    // L'avertissement « ce qui est publié est public » se lit une fois : ici
    // il a déjà été lu, sinon chaque publication ouvrirait sa modale et le
    // chapitre attendrait un clic qui ne vient pas.
    await page.evaluate(() => {
        try { localStorage.setItem('AuTableau_publication_prevenu', 'oui'); } catch (e) { /* refusé */ }
    });

    // ------------------------------------------------------------------
    // 1. LE FILM ENTIER : CE QUE L'HISTORIQUE JETTE EST ARCHIVÉ
    // ------------------------------------------------------------------
    const longue = await page.evaluate(ECRIRE, 260);
    r.egal('une séance de 260 gestes tient dans le film, même si l\'historique s\'arrête à 200',
        { pas: longue.pas, historiqueBorne: longue.historique <= 201, archiveRemplie: longue.archive > 0 },
        { pas: 261, historiqueBorne: true, archiveRemplie: true }, JSON.stringify(longue));

    // L'archive redonne les mêmes états que si rien n'avait été coupé : le
    // premier pas archivé est entier, et l'on retombe bien sur 260 traits.
    const deroule = await page.evaluate(() => {
        const film = FilmComplet.filmEntier(pages[currentPageIndex]);
        const etat = FilmComplet.etatAuBout(film);
        const mi = FilmComplet.etatAuBout(film.slice(0, 51));
        return { fin: etat.freehands.length, moitie: mi.freehands.length, heure: !!film[10].t };
    });
    r.egal('le film redonne la séance entière, dans l\'ordre',
        { fin: deroule.fin, moitie: deroule.moitie }, { fin: 260, moitie: 50 }, JSON.stringify(deroule));
    r.verifie('chaque étape porte son heure', deroule.heure);

    // La séance s'emporte telle qu'elle s'enregistre : c'est ce fichier-là
    // qu'on publie, et c'est lui que le lecteur rouvrira.
    const seance = await page.evaluate(() => {
        syncPage();
        return { name: 'Suites & limites', data: stateForStorage(),
                 seance: { titre: 'Suites & limites', classe: '1ère 3', date: '2026-09-22', publieLe: Date.now() } };
    });

    // ------------------------------------------------------------------
    // 2. LE NOM PUBLIC ET LE LIEN
    // ------------------------------------------------------------------
    const noms = await page.evaluate(() => {
        // Le site de l'essai ne connaît ni dossier ni clé : le lien doit donc
        // les porter, sinon il ne mènerait nulle part chez l'élève.
        window.AUTABLEAU_PUBLICATION = { dossier: '', cle: '', adresse: '' };
        Publication.poserLesReglages({ dossier: 'DOSSIER_TEST', cle: 'CLE_TEST', adresse: 'https://exemple.fr/Autableau' });
        const n = Publication.nomPublic('2026-09-22', '1ère 3', 'Suites & limites');
        const avecCleLocale = Publication.lienDe('SEANCE_TEST');
        // Le site qui porte la clé donne exactement le même lien.
        window.AUTABLEAU_PUBLICATION = { cle: 'CLE_TEST', adresse: '' };
        const avecCleDuSite = Publication.lienDe('SEANCE_TEST');
        window.AUTABLEAU_PUBLICATION = { cle: '', adresse: '' };
        return { nom: n, avecCleLocale, avecCleDuSite, sansRien: Publication.nomPublic('', '', '').slice(0, 7) };
    });
    r.egal('le nom du fichier public se lit, et ne porte ni accent ni espace',
        noms.nom, '2026-09-22-1ere-3-suites-limites', JSON.stringify(noms));
    r.egal('le lien ne porte que le fichier : ni la clé, ni le dossier',
        noms.avecCleLocale, 'https://exemple.fr/Autableau/lecteur.html?id=SEANCE_TEST', JSON.stringify(noms));
    r.egal('et il est le même, que la clé soit réglée ici ou portée par le site',
        noms.avecCleDuSite, noms.avecCleLocale, JSON.stringify(noms));
    r.egal('une séance sans titre ni classe garde un nom', noms.sansRien, 'seance-');

    // ------------------------------------------------------------------
    // 3. PUBLIER : SEULE LA SÉANCE OUVERTE EST ENVOYÉE À L'ADAPTATEUR DRIVE
    // ------------------------------------------------------------------
    const publiee = await page.evaluate(async () => {
        await MonDossier.adopterLeDossier(window.__driveA.racine(), false);
        // L'adaptateur HTTP est éprouvé séparément (publication-isolee.unit.cjs).
        const original = DrivePublication.publier;
        let dedans;
        DrivePublication.publier = async (nom, contenu) => { dedans = contenu; return { id: 'SEANCE_TEST' }; };
        // La recherche d'une séance du même nom passe aussi par l'adaptateur :
        // ici, aucune n'existe, et la publication en crée donc une.
        const existait = DrivePublication.existeEncore, cherchait = DrivePublication.publieeSousLeNom;
        DrivePublication.existeEncore = async () => null;
        DrivePublication.publieeSousLeNom = async () => null;
        const zone = document.createElement('div');
        const result = await Publication.publier({ titre: 'Suites & limites', classe: '1ère 3', date: '2026-09-22' }, true, zone);
        DrivePublication.publier = original;
        DrivePublication.existeEncore = existait; DrivePublication.publieeSousLeNom = cherchait;
        return { lien: result && result.lien,
                 titre: dedans && dedans.seance.titre, classe: dedans && dedans.seance.classe,
                 pas: dedans ? (dedans.data.pages[0].filmArchive || []).length + (dedans.data.pages[0].film || []).length : 0 };
    });
    r.egal('la copie publiée porte la séance ouverte et son film entier',
        { titre: publiee.titre, classe: publiee.classe, pas: publiee.pas },
        { titre: 'Suites & limites', classe: '1ère 3', pas: 261 }, JSON.stringify(publiee));
    r.egal('la publication rend le lien direct de ce fichier', publiee.lien,
        'https://exemple.fr/Autableau/lecteur.html?id=SEANCE_TEST');
    r.verifie('la publication est aussi disponible dans le menu Exporter',
        await page.locator('#export-popup-menu #pub-depuis-export').count() === 1);

    // ------------------------------------------------------------------
    // 3 bis. PAR LE RELAIS : AUCUNE CLÉ, ET LA SÉANCE RESTE PRIVÉE
    // ------------------------------------------------------------------
    // Deux comptes, deux relais : le lien doit nommer celui qui servira, et
    // la séance publiée de cette façon ne reçoit aucun partage public.
    const parRelais = await page.evaluate(async () => {
        Relais.poser('lfb', 'https://script.google.com/macros/s/ESSAI_LFB/exec');
        Publication.poserLesReglages({ profil: 'lfb', adresse: 'https://exemple.fr/Autableau' });
        const lien = Publication.lienDe({ id: 'SEANCE_TEST', resourceKey: 'rk1' });

        // Ce que l'adaptateur reçoit : on retient s'il lui a été demandé de
        // partager, et ce que la vérification est allée lire.
        const original = DrivePublication.publier;
        const existait = DrivePublication.existeEncore, cherchait = DrivePublication.publieeSousLeNom;
        DrivePublication.existeEncore = async () => null;
        DrivePublication.publieeSousLeNom = async () => null;
        let verifiePar = null, cleRecue = 'pas appelé';
        DrivePublication.publier = async (nom, contenu, cle, remplacerId, parLeRelais) => {
            cleRecue = cle;
            if (parLeRelais) { verifiePar = 'relais'; await parLeRelais({ id: 'SEANCE_TEST' }); }
            return { id: 'SEANCE_TEST', remplacee: false };
        };
        const lu = [];
        const vraiLire = Relais.lireLaSeance;
        Relais.lireLaSeance = async (cle, id) => { lu.push(cle + ':' + id); return { fiche: { id }, contenu: {} }; };
        const zone = document.createElement('div');
        const res = await Publication.publier({ titre: 'Suites', classe: '1ère 3', date: '2026-09-22' }, true, zone);
        DrivePublication.publier = original; Relais.lireLaSeance = vraiLire;
        DrivePublication.existeEncore = existait; DrivePublication.publieeSousLeNom = cherchait;
        return { lien, lienPublie: res && res.lien, verifiePar, cleRecue, lu };
    });
    r.egal('le lien nomme le relais, et ne porte ni clé ni clé de ressource',
        parRelais.lien, 'https://exemple.fr/Autableau/lecteur.html?id=SEANCE_TEST&r=lfb', JSON.stringify(parRelais));
    r.egal('la séance est vérifiée par le relais, comme la verra l’élève',
        { par: parRelais.verifiePar, lu: parRelais.lu }, { par: 'relais', lu: ['lfb:SEANCE_TEST'] }, JSON.stringify(parRelais));

    // Le texte à coller dans Pronote porte le lien, la date et le titre.
    const texte = await page.evaluate(() => Publication.resume(
        { titre: 'Suites & limites', classe: '1ère 3', date: '2026-09-22' },
        'https://exemple.fr/Autableau/lecteur.html?f=x'));
    r.verifie('le texte pour Pronote porte le lien et la séance',
        texte.includes('https://exemple.fr/Autableau/lecteur.html?f=x')
        && texte.includes('Suites & limites') && /22 septembre 2026/.test(texte), texte);

    // Sans les documents, le fichier fond : c'est le choix qu'on laisse à qui
    // a un Drive lent.
    const sansDocs = await page.evaluate(() => {
        const avec = JSON.stringify(Publication.contenuAPublier({ titre: 'x', classe: '', date: '2026-09-22' }, true));
        const sans = JSON.stringify(Publication.contenuAPublier({ titre: 'x', classe: '', date: '2026-09-22' }, false));
        const j = JSON.parse(sans);
        return { images: j.data.pages.every(p => !p.images.length), plusLeger: sans.length <= avec.length };
    });
    r.verifie('« sans les documents » enlève bien les images', sansDocs.images && sansDocs.plusLeger, JSON.stringify(sansDocs));

    // Le bouton vit au bas du panneau du Drive : c'est là qu'on range ses
    // séances, c'est là qu'on les publie.
    const bouton = await page.evaluate(async () => {
        const tiroir = document.getElementById('right-drawer');
        if (!tiroir.classList.contains('open')) toggleRightDrawer();
        MonDossier.changerDeSource('dossier');
        await new Promise(ok => setTimeout(ok, 400));
        const b = document.getElementById('dossier-publier');
        return { la: !!b, texte: b ? b.textContent : '' };
    });
    r.verifie('le bouton « Publier » est dans le tiroir du Drive', bouton.la && /Publier/.test(bouton.texte), JSON.stringify(bouton));

    await context.close();

    // ------------------------------------------------------------------
    // 4. LE LECTEUR : LA MÊME SÉANCE, REJOUÉE SANS UN OUTIL
    // ------------------------------------------------------------------
    const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 720 } });
    const p2 = await ctx2.newPage();
    const erreurs2 = [];
    p2.on('pageerror', e => { if (!/jsPDF|pdfjsLib|localforage is not defined|getUserMedia|mediaDevices|ResizeObserver loop/.test(e.message)) erreurs2.push(e.message.slice(0, 160)); });
    const lectures = [];
    // Une regexp couvre aussi /files/ID : un glob « files** » ne traverse
    // pas le slash qui suit le nom et laisserait partir une vraie requête.
    await p2.route(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files(?:[/?]|$)/, async route => {
        lectures.push(route.request().url());
        await route.fulfill({ status: 200, contentType: 'application/json',
            headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(seance) });
    });
    await p2.goto(APP_URL + '?lecteur=1&id=SEANCE_TEST&k=CLE_TEST&d=DOSSIER_INTERDIT');
    await p2.waitForFunction(() => !!window.Lecteur && !!window.PluginManager, { timeout: 30000 });
    try { await p2.waitForFunction(() => Lecteur.etat().chargee, null, { timeout: 30000 }); }
    catch (e) {
        const message = await p2.locator('#lecteur-message').textContent();
        throw new Error('Le replay ne se charge pas : ' + message + ' ; requêtes=' + JSON.stringify(lectures)
            + ' ; erreurs=' + erreurs2.join(' | '));
    }
    r.verifie('un élève ouvre directement le fichier sans demander la liste du dossier',
        lectures.length === 1 && new URL(lectures[0]).pathname === '/drive/v3/files/SEANCE_TEST'
        && !new URL(lectures[0]).searchParams.has('q'), JSON.stringify(lectures));
    await p2.waitForTimeout(300);

    const arrivee = await p2.evaluate(() => {
        const cache = (sel) => { const e = document.querySelector(sel); return !e || getComputedStyle(e).display === 'none'; };
        return { etat: Lecteur.etat(),
                 titre: document.getElementById('lecteur-nom').textContent,
                 sous: document.getElementById('lecteur-sous').textContent,
                 compte: document.getElementById('lecteur-compte').textContent,
                 outils: cache('#bar-tools') && cache('#bar-plugins') && cache('#right-drawer') && cache('#bottom-drawer'),
                 bandeau: getComputedStyle(document.getElementById('lecteur-bas')).display,
                 traits: freehands.length };
    });
    r.egal('le lecteur ouvre la séance sur sa fin, et sait combien de pas elle compte',
        { pas: arrivee.etat.pas, index: arrivee.etat.index, compte: arrivee.compte, traits: arrivee.traits },
        { pas: 261, index: 260, compte: '261 / 261', traits: 260 }, JSON.stringify(arrivee));
    r.egal('il nomme la séance et sa classe',
        { titre: arrivee.titre, sous: arrivee.sous },
        { titre: 'Suites & limites', sous: '1ère 3 · mardi 22 septembre 2026' }, JSON.stringify(arrivee));
    r.verifie('aucun outil du professeur n\'est à portée d\'élève', arrivee.outils, JSON.stringify(arrivee));
    r.verifie('la barre de lecture est là', arrivee.bandeau === 'flex', arrivee.bandeau);

    // Le bouton « play » : la séance se refait sous les yeux.
    const joue = await p2.evaluate(async () => {
        Lecteur.poser(0, { sansSuivi: true });
        const depart = { index: Lecteur.etat().index, traits: freehands.length };
        Lecteur.reglerLeDelai(40);
        Lecteur.lire();
        await new Promise(ok => setTimeout(ok, 500));
        const pendant = { index: Lecteur.etat().index, traits: freehands.length, lecture: Lecteur.etat().lecture };
        Lecteur.pause();
        return { depart, pendant };
    });
    r.egal('au début, le tableau est vide', joue.depart, { index: 0, traits: 0 }, JSON.stringify(joue));
    r.verifie('« play » redessine la séance, trait après trait',
        joue.pendant.index > 3 && joue.pendant.traits === joue.pendant.index && joue.pendant.lecture, JSON.stringify(joue));

    // Un pas à la fois, en avant et en arrière : c'est ainsi qu'un élève
    // refait une construction.
    const pas = await p2.evaluate(() => {
        Lecteur.poser(20, { sansSuivi: true });
        const a = freehands.length;
        Lecteur.pasAPas(1); const b = freehands.length;
        Lecteur.pasAPas(-1); Lecteur.pasAPas(-1); const c = freehands.length;
        return { a, b, c, index: Lecteur.etat().index };
    });
    r.egal('un pas en avant ajoute un trait, un pas en arrière le retire',
        { a: pas.a, b: pas.b, c: pas.c, index: pas.index }, { a: 20, b: 21, c: 19, index: 19 }, JSON.stringify(pas));

    // Le clavier : Espace lit, les flèches avancent — et rien ne file aux
    // raccourcis du professeur.
    const clavier = await p2.evaluate(async () => {
        Lecteur.pause(); Lecteur.poser(5, { sansSuivi: true });
        const avant = mode;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const apresFleche = Lecteur.etat().index;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        await new Promise(ok => setTimeout(ok, 60));
        return { apresFleche, modeAvant: avant, modeApres: mode, traits: freehands.length };
    });
    r.egal('la flèche avance d\'un pas, et les raccourcis d\'outils ne passent pas',
        { index: clavier.apresFleche, mode: clavier.modeApres, traits: clavier.traits },
        { index: 6, mode: clavier.modeAvant, traits: 6 }, JSON.stringify(clavier));

    // LES MAINS LIÉES. Rien ne doit partir sur le disque de l'élève : ni la
    // séance qu'il regarde, ni un trait qu'il poserait par mégarde.
    const mains = await p2.evaluate(async () => {
        const avant = freehands.length;
        saveState();
        const auto = await localforage.getItem(typeof AUTO_SAVE_KEY !== 'undefined' ? AUTO_SAVE_KEY : 'auTableau_autosave');
        return { historique: history.length, auto: auto === null, traits: freehands.length === avant, mode };
    });
    r.egal('le lecteur n\'écrit rien : ni historique, ni session reprise',
        { historique: mains.historique, auto: mains.auto, mode: mains.mode },
        { historique: 0, auto: true, mode: 'move' }, JSON.stringify(mains));

    // Tout voir : la page entière rentre dans l'écran, quel que soit le pas.
    const cadre = await p2.evaluate(() => {
        Lecteur.poser(40, { sansSuivi: true });
        Lecteur.toutVoir();
        const v1 = { z: zoom, x: Math.round(panX), y: Math.round(panY) };
        Lecteur.poser(200, { sansSuivi: true });
        Lecteur.toutVoir();
        return { v1, v2: { z: zoom, x: Math.round(panX), y: Math.round(panY) } };
    });
    r.egal('« tout voir » cadre la séance entière, et ne bouge plus quand on rembobine',
        cadre.v1, cadre.v2, JSON.stringify(cadre));

    // UN TABLEAU D'AVANT LE FILM. Tout ce qui a été enregistré jusqu'ici n'a
    // pas de film, ou n'en a qu'un bout : le lecteur ne doit pas rester
    // devant une page blanche — il montre le tableau tel qu'il a fini, et le
    // dit.
    const sansFilm = await p2.evaluate(async (s) => {
        const copie = JSON.parse(JSON.stringify(s));
        copie.data.pages.forEach(p => { p.film = []; p.filmArchive = []; });
        copie.seance.titre = 'Séance ancienne';
        await Lecteur.charger(copie, null);
        await new Promise(ok => setTimeout(ok, 200));
        return { traits: freehands.length, etat: Lecteur.etat(),
                 message: document.getElementById('lecteur-message').textContent,
                 boutons: document.getElementById('lecteur-jouer').disabled };
    }, seance);
    r.verifie('un tableau enregistré sans film montre quand même la séance finie',
        sansFilm.traits === 260 && sansFilm.etat.pas === 1 && sansFilm.boutons
        && /pas de film/.test(sansFilm.message), JSON.stringify(sansFilm));

    r.verifie('aucune erreur de page dans le lecteur', erreurs2.length === 0, erreurs2.join(' | '));
    await ctx2.close();

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    void path;
    return r.bilan();
};
