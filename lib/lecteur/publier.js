// ============================================================
// PUBLIER UNE SÉANCE POUR LE CAHIER DE TEXTES
// ============================================================
// « Je voudrais pouvoir insérer un tableau dans le cahier de texte Pronote…
// que le fichier déposé soit relisable en appuyant sur play pour les élèves
// et les parents. Les élèves pourraient se refaire la séance. »
//
// Pronote n'ouvre pas ses portes aux programmes : ce qu'on y met, on l'y met
// à la main. Ce qu'on peut faire, c'est n'avoir qu'UNE chose à y mettre —
// un lien — et que ce lien rejoue la séance.
//
// Le bouton envoie une copie de la séance sur Drive et partage uniquement
// ce fichier. Le dossier de stockage reste privé. L'élève ouvre son lien
// sans connexion ; le professeur autorise la publication avec Google.
// ============================================================
(function () {
    'use strict';

    const DOSSIER = 'Au Tableau — séances publiées';
    const CLE_REGLAGES = 'AuTableau_publication';
    const CLE_PREVENU = 'AuTableau_publication_prevenu';

    const el = (id) => document.getElementById(id);
    const dire = (m) => { if (typeof showToast === 'function') showToast(m); };
    const config = () => window.AUTABLEAU_PUBLICATION || {};

    // Les réglages : ceux du site d'abord (config.js), ceux de ce navigateur
    // ensuite. Un collègue qui installe sa copie n'a rien à saisir ; celui
    // qui se sert de la mienne met les siens, et ils restent chez lui.
    const reglages = { dossier: '', cle: '', adresse: '', clientId: '', profil: '' };
    function chargerLesReglages() {
        const c = config();
        reglages.dossier = c.dossier || '';
        reglages.cle = c.cle || '';
        reglages.adresse = c.adresse || '';
        reglages.clientId = c.clientId || window.AUTABLEAU_DRIVE_CLIENT_ID || '';
        reglages.profil = c.profil || '';
        try {
            const m = JSON.parse(localStorage.getItem(CLE_REGLAGES) || 'null');
            if (m) {
                if (m.dossier) reglages.dossier = m.dossier;
                if (m.cle) reglages.cle = m.cle;
                if (m.adresse) reglages.adresse = m.adresse;
                if (m.clientId) reglages.clientId = m.clientId;
                if (m.profil) reglages.profil = m.profil;
            }
        } catch (e) { /* stockage refusé */ }
    }
    function retenirLesReglages() {
        try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(reglages)); } catch (e) { /* refusé */ }
    }
    chargerLesReglages();

    // ---------------------------------------------------------------------
    // DEUX COMPTES, DEUX RELAIS
    // ---------------------------------------------------------------------
    // « Les séances du lycée doivent être sauvegardées dans le Drive de
    // lfbali, les séances perso dans mathsetmoi. »
    //
    // Un relais s'exécute sous un seul compte Google : il en faut donc un par
    // compte, et le lien de la séance dit lequel ouvrir — « ?r=lfb&id=… ». Le
    // nom court voyage dans l'adresse ; l'adresse du relais, elle, reste dans
    // les réglages, de sorte qu'un redéploiement ne casse aucun lien déjà
    // collé dans Pronote.
    //
    // Le compte où la séance est ÉCRITE est celui de la connexion Google ; le
    // profil choisi ici dit seulement quel relais la servira. Les deux doivent
    // désigner le même compte : la vérification faite juste après l'envoi s'en
    // assure, et le dit clairement quand ce n'est pas le cas.
    const CLE_PROFILS = 'AuTableau_publication_profils';
    const PROFILS_PAR_DEFAUT = [
        { cle: 'lfb', nom: 'Lycée (compte de l’établissement)' },
        { cle: 'mem', nom: 'Perso' }
    ];

    function profils() {
        const duSite = (config().profils || []).filter(p => p && p.cle);
        let dIci = [];
        try { dIci = JSON.parse(localStorage.getItem(CLE_PROFILS) || 'null') || []; } catch (e) { dIci = []; }
        const connus = new Map();
        [...PROFILS_PAR_DEFAUT, ...duSite, ...dIci].forEach(p => {
            if (p && p.cle) connus.set(p.cle, { cle: p.cle, nom: p.nom || p.cle });
        });
        return [...connus.values()];
    }

    function retenirLesProfils(liste) {
        try { localStorage.setItem(CLE_PROFILS, JSON.stringify(liste)); } catch (e) { /* refusé */ }
    }

    // Le profil qu'on utilise, et le relais qui va avec.
    function profilActif() {
        const liste = profils();
        const choisi = liste.find(p => p.cle === reglages.profil);
        return choisi || liste[0] || null;
    }
    function relaisDuProfil(cle) {
        return (window.Relais && cle) ? Relais.adresseDe(cle) : '';
    }
    const servieParUnRelais = () => {
        const p = profilActif();
        return !!(p && relaisDuProfil(p.cle));
    };


    // L'installation tient quand on peut publier ET faire lire : la connexion
    // Google d'un côté, un relais OU une clé de l'autre.
    const regle = () => !!(reglages.clientId && (servieParUnRelais() || reglages.cle));

    // L'adresse du lecteur. Sur GitHub Pages, c'est le dossier du site ;
    // ouverte depuis un fichier, la page n'a pas d'adresse publique et il
    // faut la donner une fois dans les réglages.
    function adresseDuSite() {
        if (reglages.adresse) return reglages.adresse.replace(/\/+$/, '');
        if (location.protocol === 'file:') return '';
        return location.origin + location.pathname.replace(/\/[^/]*$/, '');
    }

    // ---------------------------------------------------------------------
    // LE NOM DU FICHIER
    // ---------------------------------------------------------------------
    // Le nom sert seulement au rangement dans Drive. Il reste lisible — « 2026-09-22-1ere-3-suites » —
    // pour qu'on retrouve la séance dans le dossier du Drive d'un coup d'œil.
    function sansAccents(t) {
        return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    function morceau(t) {
        return sansAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    function nomPublic(date, classe, titre) {
        const bouts = [String(date || '').slice(0, 10), morceau(classe), morceau(titre)].filter(Boolean);
        return (bouts.join('-').slice(0, 90).replace(/-+$/, '')) || ('seance-' + Date.now());
    }
    function lienDe(fichier) {
        const id = typeof fichier === 'string' ? fichier : fichier.id;
        if (!/^[A-Za-z0-9_-]+$/.test(id || '')) throw new Error('La séance n’a pas encore d’identifiant Drive.');
        const base = adresseDuSite();
        if (!/^https?:\/\//.test(base)) throw new Error('Renseignez l’adresse publique du lecteur dans les réglages.');
        const url = new URL(base + '/lecteur.html');
        url.searchParams.set('id', id);
        // Le relais qui servira cette séance : son nom court suffit, l'adresse
        // vit dans les réglages du site et peut changer sans casser le lien.
        const p = profilActif();
        if (p && relaisDuProfil(p.cle)) url.searchParams.set('r', p.cle);
        // LA CLÉ NE VOYAGE PAS DANS LE LIEN. Elle y était recopiée dès que le
        // réglage local différait du site : chaque adresse distribuée la
        // portait en clair, et en changer cassait tous les liens déjà collés
        // dans Pronote. Elle vit maintenant dans le site seul
        // (lib/cloud/config.js) ; les anciens liens qui la portent encore
        // continuent de fonctionner, le lecteur les accepte toujours.
        if (fichier.resourceKey && !(p && relaisDuProfil(p.cle))) url.searchParams.set('rk', fichier.resourceKey);
        return url.href;
    }

    function dateDuJour() {
        const d = new Date();
        const deuxChiffres = (n) => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + deuxChiffres(d.getMonth() + 1) + '-' + deuxChiffres(d.getDate());
    }
    function dateLisible(iso) {
        const d = new Date(String(iso) + 'T12:00:00');
        if (isNaN(d.getTime())) return String(iso || '');
        return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    const poids = (n) => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo'
        : n > 1024 ? Math.round(n / 1024) + ' Ko' : n + ' o';

    // ---------------------------------------------------------------------
    // UN TABLEAU, UN LIEN — LE MÊME D'UNE SEMAINE À L'AUTRE
    // ---------------------------------------------------------------------
    // « Si je reprends un tableau et que je le modifie, le lien sera-t-il
    // actualisé, ou dois-je recopier le lien ? »
    //
    // Il l'était : chaque publication créait un fichier de plus, donc un lien
    // de plus, et celui qui dormait dans Pronote montrait la version d'avant.
    // On retient donc, pour chaque tableau, la séance qu'il a déjà en ligne :
    // republier la met à jour, le lien ne bouge pas, et les élèves voient la
    // dernière version sans qu'on touche au cahier de textes.
    //
    // Ce que l'on retient vit dans ce navigateur. Sur un autre poste, le nom du
    // fichier sert de second filet : on y reconnaît la séance et l'on demande
    // s'il faut la mettre à jour.
    const CLE_LIENS = 'AuTableau_publication_liens';

    // Le tableau ouvert, reconnu d'une fois sur l'autre : son fichier dans le
    // Drive quand il en a un — c'est ce qui le suit d'un poste à l'autre —,
    // son nom sinon.
    function cleDuTableau() {
        try {
            if (window.MonDossier && MonDossier.lie && MonDossier.lie()) {
                const c = MonDossier.chemin();
                if (c && c.length) return 'drive:' + c.join('/');
            }
        } catch (e) { /* le tiroir n'est pas là */ }
        let nom = '';
        try { nom = (window.MonDossier && MonDossier.nomCourant()) || ''; } catch (e) { nom = ''; }
        return 'nom:' + (nom || 'Sans titre');
    }

    async function liensConnus() {
        try { return (await localforage.getItem(CLE_LIENS)) || {}; } catch (e) { return {}; }
    }
    async function retenirLeLien(id) {
        const t = await liensConnus();
        t[cleDuTableau()] = { id, quand: Date.now() };
        try { await localforage.setItem(CLE_LIENS, t); } catch (e) { /* stockage refusé */ }
    }
    async function oublierLeLien(id) {
        const t = await liensConnus();
        let change = false;
        Object.keys(t).forEach(k => { if (t[k] && t[k].id === id) { delete t[k]; change = true; } });
        if (change) { try { await localforage.setItem(CLE_LIENS, t); } catch (e) { /* refusé */ } }
    }

    // Quelle séance en ligne cette publication doit-elle remplacer ? Celle que
    // ce tableau a déjà publiée, si elle est toujours là. Sinon, l'homonyme
    // trouvé sur le Drive — mais on demande, car deux tableaux différents
    // peuvent porter le même titre le même jour pour la même classe.
    async function seanceARemplacer(nom) {
        // CHERCHER NE DOIT JAMAIS EMPÊCHER DE PUBLIER. Si le Drive ne répond
        // pas à cette question, on publie une séance neuve : un lien de plus
        // vaut mieux qu'un cours qui ne part pas.
        let connu = null, homonyme = null;
        try {
            connu = (await liensConnus())[cleDuTableau()];
            if (connu && connu.id && await DrivePublication.existeEncore(connu.id)) return connu.id;
            homonyme = await DrivePublication.publieeSousLeNom(nom);
        } catch (e) { console.warn('Séance déjà en ligne : recherche impossible', e); return null; }
        if (!homonyme) return null;
        const mettreAJour = await new Promise((ok) => {
            if (typeof openConfirmModal !== 'function') { ok(true); return; }
            openConfirmModal('Une séance porte déjà ce nom',
                '« ' + nom + ' » est déjà en ligne. La mettre à jour ? Son lien, déjà collé dans Pronote, montrera la nouvelle version. Sinon, une séance de plus est publiée, avec un nouveau lien.',
                false, () => ok(true), () => ok(false));
        });
        return mettreAJour ? homonyme.id : null;
    }


    // ---------------------------------------------------------------------
    // CE QU'ON PUBLIE
    // ---------------------------------------------------------------------
    // Le tableau tel qu'il s'enregistre, avec son film — c'est lui qui se
    // rejoue. « Sans les documents » enlève les photos et les PDF posés : le
    // fichier fond, mais la séance se rejoue sur un tableau troué. À ne
    // prendre que si le Drive peine.
    function contenuAPublier(meta, avecLesDocuments) {
        const tableau = ui.brouillon ? ui.brouillon.tableau : MonDossier.contenuDuTableau();
        const data = MontageReplay.monter(tableau.data, ui.brouillon ? ui.brouillon.coupes : [], avecLesDocuments,
            ui.brouillon ? ui.brouillon.annotations : undefined);
        return { id: 'seance_' + Date.now(), name: meta.titre, format: 'au-tableau', enregistreLe: Date.now(),
                 seance: { titre: meta.titre, classe: meta.classe, date: meta.date, publieLe: Date.now(), version: 1 },
                 data };
    }

    // ---------------------------------------------------------------------
    // LA FENÊTRE
    // ---------------------------------------------------------------------
    const ui = { fenetre: null, onglet: 'publier', classes: [], resultat: null, publiees: null, occupe: false,
        brouillon: null, fermerMontage: null };
    const q = (sel) => ui.fenetre ? ui.fenetre.querySelector(sel) : null;

    function preparerBrouillon() {
        const tableau = MonDossier.contenuDuTableau();
        const empreinte = MontageReplay.empreinte(tableau.data);
        if (ui.brouillon && ui.brouillon.empreinte === empreinte) return;
        if (ui.brouillon && (ui.brouillon.coupes.length || ui.brouillon.annotations.length)) dire('Le tableau a changé : un nouveau montage commence.');
        const cdm = typeof classeDuMoment === 'function' ? classeDuMoment(ui.classes) : null;
        const classe = ui.classes.find(c => c.id === cdm);
        ui.brouillon = { tableau: JSON.parse(JSON.stringify(tableau)), empreinte, coupes: [], documents: true,
            annotations: MontageReplay.annotationsDe(tableau.data),
            meta: { titre: MonDossier.nomCourant() || 'Séance', classe: classe ? classe.nom : '', date: dateDuJour() } };
    }

    function arreterMontage() {
        if (ui.fermerMontage) ui.fermerMontage();
        ui.fermerMontage = null;
    }

    function h(tag, attrs, ...enfants) {
        const e = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k === 'class') e.className = v;
            else if (k === 'style') e.style.cssText = v;
            else if (k.startsWith('on')) e[k] = v;
            else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
        });
        enfants.flat().forEach(c => { if (c === null || c === undefined || c === false) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
        return e;
    }
    const bouton = (texte, action, classe) => h('button', { class: 'pw-btn' + (classe ? ' ' + classe : ''), type: 'button', onclick: action }, texte);
    const champ = (libelle, entree, aide) => h('label', { class: 'pw-champ' }, h('label', {}, libelle), entree,
        aide ? h('small', { class: 'pub-aide' }, aide) : null);

    function construire() {
        if (ui.fenetre) return;
        const f = document.createElement('div');
        f.id = 'pub-fenetre';
        f.className = 'pw';
        f.style.cssText = 'top:6vh; left:max(12px, calc(50% - 380px)); width:min(760px, calc(100vw - 24px)); max-height:86vh; display:none;';
        f.innerHTML = '<div class="pw-entete" id="pub-poignee">'
            + '<span class="pw-titre">Publier pour le cahier de textes</span>'
            + '<span class="pw-espace"></span>'
            + '<button class="pw-icone fermer" id="pub-fermer" title="Fermer">✕</button></div>'
            + '<div class="pw-corps"><div class="pw-rail">'
            + '<div class="pw-rail-titre">Séance</div>'
            + '<button class="pw-rail-item" data-onglet="montage">Monter le replay</button>'
            + '<button class="pw-rail-item" data-onglet="publier">Publier celle-ci</button>'
            + '<button class="pw-rail-item" data-onglet="liste">Déjà publiées</button>'
            + '<div class="pw-rail-titre" style="margin-top:14px">Installation</div>'
            + '<button class="pw-rail-item" data-onglet="reglages">Compte Google et clé</button>'
            + '</div><div class="pw-panneau" id="pub-panneau"></div></div>';
        document.body.appendChild(f);
        ui.fenetre = f;

        const poignee = f.querySelector('#pub-poignee');
        let glisse = null;
        poignee.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button')) return;
            glisse = { x: e.clientX - f.offsetLeft, y: e.clientY - f.offsetTop };
            try { poignee.setPointerCapture(e.pointerId); } catch (err) { /* refusé */ }
        });
        poignee.addEventListener('pointermove', (e) => { if (glisse) { f.style.left = (e.clientX - glisse.x) + 'px'; f.style.top = (e.clientY - glisse.y) + 'px'; } });
        const lacher = () => { glisse = null; };
        poignee.addEventListener('pointerup', lacher); poignee.addEventListener('pointercancel', lacher);

        f.querySelector('#pub-fermer').onclick = fermer;
        f.querySelectorAll('.pw-rail-item[data-onglet]').forEach(b => b.onclick = () => { ui.onglet = b.dataset.onglet; rendre(); });
    }

    async function ouvrir(onglet) {
        construire();
        chargerLesReglages();
        try { ui.classes = (await ClassesStore.loadAll()).filter(c => !c.archivee); } catch (e) { ui.classes = []; }
        preparerBrouillon();
        ui.onglet = onglet || (regle() ? 'publier' : 'reglages');
        ui.resultat = null;
        ui.fenetre.style.display = 'flex';
        if (typeof ramenerFenetreDansLecran === 'function') ramenerFenetreDansLecran(ui.fenetre);
        rendre();
    }
    function fermer() { arreterMontage(); if (ui.fenetre) ui.fenetre.style.display = 'none'; }

    function rendre() {
        if (!ui.fenetre || ui.fenetre.style.display === 'none') return;
        arreterMontage();
        ui.fenetre.classList.toggle('pub-montage', ui.onglet === 'montage');
        ui.fenetre.querySelectorAll('.pw-rail-item[data-onglet]').forEach(b => b.classList.toggle('actif', b.dataset.onglet === ui.onglet));
        const p = q('#pub-panneau');
        p.textContent = '';
        if (ui.onglet === 'reglages') rendreReglages(p);
        else if (ui.onglet === 'liste') rendreListe(p);
        else if (ui.onglet === 'montage') {
            ui.resultat = null;
            ui.fermerMontage = MontageInterface.ouvrir(p, ui.brouillon, () => { ui.onglet = 'publier'; rendre(); });
        }
        else rendrePublier(p);
    }

    // ---------------------------------------------------------------------
    // ONGLET « PUBLIER CELLE-CI »
    // ---------------------------------------------------------------------
    function rendrePublier(p) {
        const stats = MontageReplay.bilan(ui.brouillon.tableau.data, ui.brouillon.coupes);
        const annotations = ui.brouillon.annotations.length;
        p.appendChild(h('div', { class: 'pw-bloc pub-montage-resume' },
            h('div', {}, h('div', { class: 'pw-bloc-titre' }, 'Le replay à publier'),
                h('p', { class: 'pub-texte', id: 'pub-montage-resume' }, stats.retirees || annotations
                    ? stats.retirees + ' étape(s) retirée(s) · ' + annotations + ' annotation(s) préparée(s). Vérifiez leur affichage dans l’aperçu.'
                    : 'Vous pouvez retirer des passages, ajouter des annotations et prévisualiser la séance.')),
            bouton('Monter le replay', () => { ui.onglet = 'montage'; rendre(); })));
        if (!regle()) {
            p.appendChild(h('div', { class: 'pw-bloc' },
                h('div', { class: 'pw-bloc-titre' }, 'Encore une installation à faire, une seule fois'),
                h('p', { class: 'pub-texte' }, 'Enregistrez votre clé API, puis connectez le compte Google qui recevra les copies des séances.'),
                h('div', { class: 'pw-rangee' }, bouton('Me guider', () => { ui.onglet = 'reglages'; rendre(); }, 'primaire'))));
            return;
        }

        if (!DrivePublication.connecte()) { rendreConnexion(p); return; }

        const meta = ui.brouillon.meta;
        const titre = h('input', { type: 'text', class: 'pw-champ-texte', id: 'pub-titre', value: meta.titre, placeholder: 'Titre de la séance',
            oninput: e => { meta.titre = e.target.value; } });
        const classe = h('select', { class: 'pw-select', id: 'pub-classe' },
            h('option', { value: '' }, 'Aucune classe'),
            ui.classes.map(c => h('option', { value: c.nom, selected: c.nom === meta.classe }, c.nom)));
        classe.onchange = () => { meta.classe = classe.value; };
        const date = h('input', { type: 'date', class: 'pw-champ-texte', id: 'pub-date', value: meta.date,
            oninput: e => { meta.date = e.target.value; } });
        const docs = h('input', { type: 'checkbox', id: 'pub-docs', checked: ui.brouillon.documents,
            onchange: e => { ui.brouillon.documents = e.target.checked; } });

        // OÙ VA LA SÉANCE. Le compte du lycée pour les cours du lycée, le
        // compte personnel pour le reste : le relais choisi ici est celui qui
        // la servira, et le lien le nommera.
        const compte = h('select', { class: 'pw-select', id: 'pub-profil' },
            profils().map(x => h('option', { value: x.cle, selected: x.cle === (profilActif() || {}).cle },
                x.nom + (relaisDuProfil(x.cle) ? '' : ' — relais à régler'))));
        compte.onchange = () => { reglages.profil = compte.value; retenirLesReglages(); rendre(); };
        const relaisDit = servieParUnRelais()
            ? 'La séance restera privée dans ce Drive : c’est le relais qui la servira, sans clé.'
            : 'Aucun relais pour ce compte : la séance sera partagée par lien et lue avec la clé API.';
        p.appendChild(h('div', { class: 'pw-bloc' },
            h('div', { class: 'pw-bloc-titre' }, 'Ce que verront les élèves'),
            h('div', { class: 'pw-rangee' }, champ('Titre', titre), champ('Classe', classe), champ('Date', date)),
            h('div', { class: 'pw-rangee' }, champ('Publier dans', compte, relaisDit)),
            h('label', { class: 'pw-bascule' }, docs,
                h('span', {}, h('b', {}, 'Avec les documents posés sur le tableau'),
                    h('small', {}, 'Photos, PDF, captures. Sans eux le fichier est beaucoup plus léger, mais la séance se rejoue avec des trous.'))),
            h('p', { class: 'pub-texte' }, 'Un lien unique sera créé pour cette copie de la séance. Ce lien ne donne accès ni au dossier ni aux autres séances.')));

        const zone = h('div', { class: 'pw-bloc', id: 'pub-resultat' });
        p.appendChild(zone);

        const lancer = bouton('Publier la séance', async () => {
            if (ui.occupe) return;
            const meta = { titre: (titre.value || '').trim() || 'Séance', classe: classe.value, date: date.value || dateDuJour() };
            await publier(meta, docs.checked, zone);
        }, 'primaire');
        p.appendChild(h('div', { class: 'pw-pied' }, h('span', { class: 'pw-espace' }),
            bouton('Fermer', fermer), lancer));

        if (ui.resultat) montrerLeResultat(zone, ui.resultat);
    }

    // L'avertissement, une seule fois : ce qui part est lisible par qui a le
    // lien, et un lien se recopie.
    function prevenirSiBesoin() {
        return new Promise((ok) => {
            let vu = false;
            try { vu = localStorage.getItem(CLE_PREVENU) === 'oui'; } catch (e) { vu = false; }
            if (vu || typeof openConfirmModal !== 'function') { ok(true); return; }
            openConfirmModal('Ce qui est publié est public',
                'Le lien s\'ouvre sans compte : qui l\'a peut voir la séance, et le transmettre. '
                + 'Ne publiez pas un tableau où figurent des noms d\'élèves (plan de classe, tirage au sort, copies).',
                false,
                () => { try { localStorage.setItem(CLE_PREVENU, 'oui'); } catch (e) { /* refusé */ } ok(true); },
                () => ok(false));
        });
    }

    async function publier(meta, avecLesDocuments, zone) {
        if (ui.occupe) return null;
        ui.occupe = true;
        if (!(await prevenirSiBesoin())) { ui.occupe = false; return null; }
        zone.textContent = '';
        zone.appendChild(h('p', { class: 'pub-texte' }, 'Écriture dans votre Drive…'));
        try {
            // Valider l'adresse avant de créer une copie sur Drive.
            lienDe('verification');
            const nom = nomPublic(meta.date, meta.classe, meta.titre);
            const contenu = contenuAPublier(meta, avecLesDocuments);
            const remplacerId = await seanceARemplacer(nom);
            // CE QUE VERRA L'ÉLÈVE, ESSAYÉ POUR DE BON. Par le relais quand il y
            // en a un — la séance reste alors privée dans le Drive —, par la clé
            // sinon, comme avant.
            const p = profilActif();
            const parLeRelais = (p && relaisDuProfil(p.cle))
                ? (async (fiche) => {
                    try { await Relais.lireLaSeance(p.cle, fiche.id); }
                    catch (e) {
                        throw new Error('Le relais « ' + p.nom + ' » ne voit pas cette séance. '
                            + 'Êtes-vous connecté avec le compte Google de ce profil ? (' + (e.message || e) + ')');
                    }
                })
                : null;
            const fichier = await DrivePublication.publier(nom, contenu, reglages.cle, remplacerId, parLeRelais);
            await retenirLeLien(fichier.id);
            ui.resultat = { nom, fichier, lien: lienDe(fichier), meta,
                taille: new Blob([JSON.stringify(contenu)]).size, quand: Date.now(), enLigne: true };
            ui.publiees = null;
            montrerLeResultat(zone, ui.resultat);
            dire(fichier.remplacee ? 'Séance mise à jour — le lien ne change pas' : 'Séance publiée — le lien est prêt pour Pronote');
            return ui.resultat;
        } catch (e) {
            console.warn('Publication impossible :', e);
            zone.textContent = '';
            zone.appendChild(h('p', { class: 'pub-erreur' }, 'Publication impossible : ' + (e.message || e)));
            return null;
        } finally { ui.occupe = false; }
    }

    // Le résumé à coller dans le champ « Contenu » de la séance Pronote.
    function resume(meta, lien) {
        const lignes = [];
        lignes.push(meta.titre + (meta.classe ? ' — ' + meta.classe : ''));
        lignes.push('Séance du ' + dateLisible(meta.date) + '.');
        const autos = automatismesDuJour(meta);
        if (autos) lignes.push('Automatismes : ' + autos + '.');
        lignes.push('');
        lignes.push('Revoir la séance au tableau (appuyez sur ▶) : ' + lien);
        return lignes.join('\n');
    }

    // Ce que le journal des automatismes a noté ce jour-là pour cette classe :
    // c'est la partie du contenu qu'on retape le plus souvent.
    function automatismesDuJour(meta) {
        try {
            const d = window.Automatismes && Automatismes.donnees && Automatismes.donnees();
            if (!d || !Array.isArray(d.journal)) return '';
            const jour = String(meta.date);
            const titres = d.journal.filter(e => {
                const q = new Date(e.date);
                const iso = isNaN(q.getTime()) ? '' : q.toISOString().slice(0, 10);
                return iso === jour && (!meta.classe || e.classeNom === meta.classe);
            }).map(e => e.serieTitre).filter(Boolean);
            return [...new Set(titres)].join(', ');
        } catch (e) { return ''; }
    }

    async function copier(texte, quoi) {
        try {
            await navigator.clipboard.writeText(texte);
            dire(quoi + ' copié');
            return true;
        } catch (e) {
            // Le presse-papiers se refuse hors d'un site sécurisé : on montre
            // alors le texte tout sélectionné, prêt pour un Ctrl+C.
            const z = h('textarea', { class: 'pub-copie', readonly: true }, texte);
            const zone = q('#pub-resultat');
            if (zone) { zone.appendChild(z); z.focus(); z.select(); }
            dire('Copie automatique refusée : le texte est sélectionné, faites Ctrl+C');
            return false;
        }
    }

    function montrerLeResultat(zone, r) {
        zone.textContent = '';
        // Le lien a-t-il changé ? C'est la première question qu'on se pose
        // en revenant sur une séance déjà donnée.
        const aJour = !!(r.fichier && r.fichier.remplacee);
        zone.appendChild(h("div", { class: "pw-bloc-titre" }, aJour ? "La séance est à jour" : "C’est publié"));
        zone.appendChild(h('p', { class: 'pub-texte' }, aJour
            ? 'La version en ligne a été remplacée par celle-ci (' + poids(r.taille) + '). Le lien n’a pas changé :'
              + ' rien à recoller dans Pronote, les élèves verront la nouvelle version.'
            : 'La séance est en ligne (' + poids(r.taille) + '). Ce lien ouvre uniquement cette séance.'
              + ' Le dossier de stockage n’est pas partagé.'));
        zone.appendChild(h('div', { class: 'pub-lien' }, h('code', {}, r.lien)));
        const etat = h('p', { class: 'pub-etat', id: 'pub-etat' }, '');
        zone.appendChild(h('div', { class: 'pw-rangee pub-actions' },
            bouton('Copier le lien', () => copier(r.lien, 'Lien'), 'primaire'),
            bouton('Copier le texte pour Pronote', () => copier(resume(r.meta, r.lien), 'Texte')),
            bouton('Vérifier que c\'est en ligne', async () => {
                etat.textContent = 'Demande à Google…';
                const v = await verifier(r.fichier);
                etat.className = 'pub-etat ' + (v.ok ? 'bon' : 'attente');
                etat.textContent = v.message;
                r.enLigne = v.ok;
            }),
            bouton('Ouvrir le lecteur', () => window.open(r.lien, '_blank', 'noopener'))));
        zone.appendChild(etat);
        zone.appendChild(h('p', { class: 'pub-texte pub-mode-emploi' },
            'Dans Pronote : cahier de textes, la séance, champ « Contenu » — collez le texte ; le lien y devient cliquable.'));
    }

    async function verifier(fichier) {
        try {
            await DrivePublic.lireFichier(fichier.id, reglages.cle, fichier.resourceKey);
            return { ok: true, message: 'La séance est accessible sans connexion Google.' };
        } catch (e) { return { ok: false, message: DrivePublic.expliquer(e) }; }
    }

    // ---------------------------------------------------------------------
    // ONGLET « DÉJÀ PUBLIÉES »
    // ---------------------------------------------------------------------
    const listerLesPubliees = () => DrivePublication.lister();

    function rendreConnexion(p) {
        const etat = h('p', { class: 'pub-etat', role: 'status' }, '');
        const connecter = bouton('Connecter mon compte Google', async () => {
            connecter.disabled = true;
            etat.textContent = 'Choisissez le compte qui accueillera les séances publiées…';
            try {
                await DrivePublication.connecter(reglages.clientId);
                rendre();
            } catch (e) { etat.textContent = e.message; etat.className = 'pub-erreur'; }
            finally { connecter.disabled = false; }
        }, 'primaire');
        p.appendChild(h('div', { class: 'pw-bloc' },
            h('div', { class: 'pw-bloc-titre' }, 'Autoriser la publication sur Google Drive'),
            h('p', { class: 'pub-texte' }, 'Au Tableau crée un dossier privé et y dépose des copies. Seule la séance publiée est partagée en lecture. Vos tableaux de travail peuvent rester dans leurs dossiers habituels.'),
            h('p', { class: 'pub-texte' }, 'Cette connexion est réservée à l’enseignant. Les élèves n’ont pas à se connecter.'),
            connecter, etat));
    }

    function rendreListe(p) {
        if (!DrivePublication.connecte()) { rendreConnexion(p); return; }
        const liste = h('div', { class: 'pub-liste' }, h('p', { class: 'pub-texte' }, 'Lecture des séances publiées…'));
        p.appendChild(h('div', { class: 'pw-bloc' }, h('div', { class: 'pw-bloc-titre' }, 'Les séances déjà publiées'), liste));
        listerLesPubliees().then(entrees => {
            ui.publiees = entrees;
            liste.textContent = '';
            if (!entrees.length) {
                liste.appendChild(h('p', { class: 'pub-texte' }, 'Aucune séance publiée avec ce compte pour le moment.'));
                return;
            }
            entrees.forEach(e => {
                const lien = lienDe(e);
                let meta;
                try { meta = JSON.parse(e.description || '{}'); } catch (_) { meta = {}; }
                liste.appendChild(h('div', { class: 'pub-ligne' },
                    h('div', { class: 'pub-ligne-nom' }, h('b', {}, meta.titre || e.name),
                        h('small', {}, [meta.classe, meta.date, poids(Number(e.size) || 0)].filter(Boolean).join(' · '))),
                    h('div', { class: 'pub-ligne-actions' },
                        bouton('Copier le lien', () => copier(lien, 'Lien')),
                        bouton('Ouvrir', () => window.open(lien, '_blank', 'noopener')),
                        bouton('Retirer', () => retirer(e), 'danger'))));
            });
        }).catch(e => { liste.textContent = e.message; });
    }

    function retirer(fichier) {
        const faire = async () => {
            try {
                await DrivePublication.retirer(fichier.id);
                await oublierLeLien(fichier.id);
                if (ui.resultat?.fichier.id === fichier.id) ui.resultat = null;
                dire('Accès retiré — le lien ne donne plus accès à cette séance');
                rendre();
            } catch (e) { dire(e.message || 'Impossible de retirer cette séance'); }
        };
        if (typeof openConfirmModal === 'function') {
            openConfirmModal('Retirer l’accès à « ' + fichier.name + ' » ?',
                'Le lien collé dans Pronote ne permettra plus d’ouvrir cette séance. Votre tableau de travail reste disponible.',
                true, faire);
        } else faire();
    }

    function rendreReglages(p) {
        // ------------------------------------------------------------------
        // LES COMPTES ET LEURS RELAIS
        // ------------------------------------------------------------------
        // Un relais par compte Google : celui du lycée sert les cours du lycée,
        // le personnel sert le reste. On colle ici l'adresse « …/exec » que
        // donne le déploiement (relais/relais-seances.gs), et « Essayer » dit
        // sous quel compte il tourne — de quoi s'assurer qu'on ne les a pas
        // intervertis.
        const blocRelais = h('div', { class: 'pw-bloc' },
            h('div', { class: 'pw-bloc-titre' }, 'Comptes et relais'),
            h('p', { class: 'pub-texte' }, 'Un relais lit la séance sous votre compte et la renvoie à l’élève : '
                + 'aucune clé ne circule, et la séance reste privée dans votre Drive. '
                + 'La marche à suivre est en tête du fichier relais/relais-seances.gs.'),
            // L'ADRESSE DOIT ALLER DANS LE SITE, PAS SEULEMENT ICI.
            // Enregistrée là, elle ne vit que dans ce navigateur : elle suffit
            // pour publier et pour relire ses propres liens. Mais l'élève, lui,
            // arrive sur le site sans rien dans son stockage, et le lien ne
            // porte que le nom court du relais (« r=lfb »), jamais son adresse
            // — c'est ce qui permet de redéployer sans casser les liens déjà
            // collés dans Pronote. L'adresse doit donc figurer dans
            // lib/cloud/config.js, que tous les navigateurs reçoivent. Ce n'est
            // pas une clé : ce point d'entrée ne sert que les séances du dossier
            // publié, une par une, et ne les liste jamais.
            h('p', { class: 'pub-texte' }, 'Enregistrée ici, l’adresse ne vaut que pour ce navigateur — assez pour publier '
                + 'et relire vos propres liens. Pour que les élèves lisent, elle doit aussi être dans le site : '
                + 'copiez la ligne, et reportez-la dans lib/cloud/config.js, rubrique « relais ».'));

        profils().forEach(prof => {
            const adresse = h('input', { type: 'text', class: 'pw-champ-texte', value: relaisDuProfil(prof.cle),
                placeholder: 'https://script.google.com/macros/s/…/exec' });
            const nom = h('input', { type: 'text', class: 'pw-champ-texte', value: prof.nom });
            const etat = h('p', { class: 'pub-etat' }, '');
            const essayer = bouton('Essayer ce relais', async () => {
                etat.className = 'pub-etat'; etat.textContent = 'Demande au relais…';
                try {
                    const r = await Relais.essayer(adresse.value.trim());
                    // UN ESSAI RÉUSSI S'ENREGISTRE. L'essai interrogeait le
                    // texte tapé, la publication l'adresse rangée : qui
                    // vérifiait sans enregistrer gardait l'ancienne adresse,
                    // et la publication échouait en accusant le relais qu'on
                    // venait de voir répondre. Une adresse dont on vient de
                    // prouver qu'elle marche, on la garde.
                    Relais.poser(prof.cle, adresse.value.trim());
                    etat.className = 'pub-etat bon';
                    etat.textContent = 'Répond sous le compte ' + (r.compte || '(inconnu)')
                        + (r.pret ? ' — le dossier des séances est en place.' : ' — le dossier des séances n’existe pas encore ; il sera créé à la première publication.')
                        + ' Adresse enregistrée.';
                } catch (e) {
                    etat.className = 'pub-etat attente';
                    etat.textContent = e.message || String(e);
                }
            });
            const enregistrer = bouton('Enregistrer', () => {
                Relais.poser(prof.cle, adresse.value.trim());
                const liste = profils().map(x => x.cle === prof.cle ? { cle: x.cle, nom: nom.value.trim() || x.cle } : x);
                retenirLesProfils(liste);
                dire('Relais enregistré pour « ' + (nom.value.trim() || prof.cle) + ' »');
                rendre();
            }, 'primaire');

            blocRelais.appendChild(h('div', { class: 'pub-ligne pub-relais' },
                h('div', { class: 'pub-ligne-nom' },
                    h('div', { class: 'pw-rangee' },
                        champ('Nom du compte', nom, 'Ce que vous lisez dans « Publier dans ».'),
                        champ('Adresse du relais (' + prof.cle + ')', adresse, 'Le lien « …/exec » du déploiement.')),
                    etat),
                h('div', { class: 'pub-ligne-actions' }, essayer, enregistrer,
                    bouton('Copier la ligne du site', () => {
                        const a = adresse.value.trim();
                        if (!a) return dire('Collez d’abord l’adresse « …/exec » du déploiement.');
                        const q = String.fromCharCode(39);
                        copier('    ' + prof.cle + ': ' + q + a + q + ',', 'Ligne');
                    }))));
        });
        p.appendChild(blocRelais);


        if (reglages.dossier) {
            p.appendChild(h('div', { class: 'pw-bloc' },
                h('div', { class: 'pw-bloc-titre' }, 'Votre ancien dossier partagé'),
                h('p', { class: 'pub-texte' }, 'La nouvelle publication utilise un autre dossier privé. Si votre ancien dossier est encore partagé, ouvrez Google Drive → Partager → Accès général → Limité. Les anciens liens fondés sur ce dossier devront alors être remplacés.')));
        }
        const cle = h('input', { type: 'text', class: 'pw-champ-texte', id: 'pub-cle', value: reglages.cle, placeholder: 'AIza…', autocomplete: 'off' });
        const clientId = h('input', { type: 'text', class: 'pw-champ-texte', id: 'pub-client-id', value: reglages.clientId, placeholder: '…apps.googleusercontent.com' });
        const adresse = h('input', { type: 'url', class: 'pw-champ-texte', value: reglages.adresse,
            placeholder: adresseDuSite() || 'https://mathsetmoi.github.io/Autableau' });
        p.appendChild(h('div', { class: 'pw-bloc' },
            h('div', { class: 'pw-bloc-titre' }, 'Une clé pour ouvrir les séances'),
            h('p', { class: 'pub-texte' }, 'Collez votre clé API Google Drive. Elle sert à lire les fichiers publiés et figure dans les liens destinés aux élèves. Elle ne donne pas accès à votre Drive privé.'),
            champ('Clé API Google', cle, 'Restreignez-la à Google Drive API et au site ' + location.origin + '/* dans Google Cloud.'),
            h('details', {}, h('summary', {}, 'Connexion Google et adresse du lecteur'),
                champ('Identifiant client OAuth (Application Web)', clientId, 'L’identifiant du site est prérempli. Pour utiliser le vôtre, déclarez ' + location.origin + ' comme origine JavaScript autorisée. Aucun secret client n’est nécessaire.'),
                champ('Adresse du site lecteur', adresse, 'Laissez vide pour utiliser ce site.')),
            h('p', { class: 'pub-texte' }, 'Aucun dossier à partager ou à choisir : Au Tableau crée un dossier privé « ' + DOSSIER + ' » dans le compte connecté.')));
        if (DrivePublication.connecte()) {
            p.appendChild(bouton('Changer de compte Google', () => {
                DrivePublication.deconnecter(); ui.onglet = 'publier'; rendre();
            }));
        }
        const etat = h('p', { class: 'pub-etat', role: 'status' }, '');
        p.appendChild(h('div', { class: 'pw-pied' }, etat, h('span', { class: 'pw-espace' }),
            bouton('Enregistrer', () => {
                const base = adresse.value.trim().replace(/\/(?:index|lecteur)\.html\/?$/, '').replace(/\/+$/, '');
                if (base) {
                    try {
                        const u = new URL(base);
                        if (!['https:', 'http:'].includes(u.protocol) || u.search || u.hash || u.username || u.password) throw new Error();
                    } catch (_) { etat.textContent = 'Indiquez l’adresse https:// du site, sans paramètres.'; return; }
                }
                if (reglages.clientId !== clientId.value.trim()) DrivePublication.deconnecter();
                reglages.cle = cle.value.trim();
                reglages.clientId = clientId.value.trim();
                reglages.adresse = base;
                retenirLesReglages();
                dire(regle() ? 'Réglages enregistrés' : 'Il manque la clé API ou l’identifiant client Google');
                ui.onglet = regle() ? 'publier' : 'reglages';
                rendre();
            }, 'primaire')));
    }

    // ---------------------------------------------------------------------
    // LE BOUTON DANS LE TIROIR
    // ---------------------------------------------------------------------
    function poserDansLeTiroir(boite) {
        if (!boite) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'dossier-publier';
        b.className = 'btn-action secondary dossier-bouton dossier-publier';
        b.textContent = '▶ Publier pour le cahier de textes';
        b.title = 'Partager uniquement cette séance et copier son lien pour Pronote';
        b.onclick = () => ouvrir();
        boite.appendChild(b);
    }

    // ET DANS « EXPORTER », car c'est là qu'on va chercher quand on veut
    // mettre son tableau ailleurs. Le bouton s'ajoute à la fenêtre existante
    // plutôt que d'être écrit dans la page : rien à reprendre en amont.
    function poserDansLExport() {
        const popover = el('export-popup-menu') || el('export-popover');
        if (!popover || el('pub-depuis-export')) return;
        const grille = popover.id === 'export-popup-menu' ? popover : popover.querySelector('.export-actions-grid');
        if (!grille) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'pub-depuis-export';
        b.className = popover.id === 'export-popup-menu' ? 'menu-item' : 'btn-action secondary pub-depuis-export';
        b.textContent = '▶ Publier pour le cahier de textes…';
        b.title = 'Un lien que les élèves et les parents ouvrent pour rejouer la séance';
        b.onclick = () => { popover.classList.remove('visible', 'show'); ouvrir(); };
        grille.insertBefore(b, grille.firstChild);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poserDansLExport);
    else poserDansLExport();

    window.Publication = {
        ouvrir, fermer, publier, rendre, poserDansLeTiroir, poserDansLExport, verifier, listerLesPubliees,
        reglages, chargerLesReglages,
        poserLesReglages: (r) => { Object.assign(reglages, r || {}); retenirLesReglages(); },
        nomPublic, lienDe, resume, contenuAPublier, ui, DOSSIER
    };
})();
