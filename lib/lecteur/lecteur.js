// ============================================================
// LE LECTEUR : LA SÉANCE REJOUÉE PAR LES ÉLÈVES
// ============================================================
// « Je voudrais que le fichier déposé soit relisable en appuyant sur play
// pour les élèves et les parents. Les élèves pourraient se refaire la
// séance. »
//
// Un lien collé dans le cahier de textes ouvre cette page : le tableau seul,
// sans un outil, avec un gros bouton de lecture. Le film enregistré avec le
// tableau se rejoue trait par trait, à la vitesse qu'on veut, un pas à la
// fois si l'on préfère, page par page. On pince pour zoomer, on glisse pour
// se déplacer ; la vue suit l'écriture pour qu'on n'ait pas à la chercher.
//
// C'est l'application elle-même qui dessine — mêmes traits, mêmes formules,
// mêmes photos — mais elle a les mains liées : rien ne s'écrit, ni sur le
// tableau, ni dans le navigateur de l'élève, ni dans celui du professeur qui
// ouvre son propre lien pour vérifier.
//
// La séance vient d'un fichier partagé du Drive (lib/lecteur/drive-public.js),
// d'une adresse quelconque (?u=…), ou d'un fichier .prof qu'on ouvre à la
// main quand le lien ne dit rien.
// ============================================================
(function () {
    'use strict';

    const params = new URLSearchParams(location.search);
    const enLecteur = params.has('lecteur') || params.has('id') || params.has('r') || params.has('f') || params.has('u') || params.has('seance');
    window.AUTABLEAU_LECTEUR = enLecteur;
    if (!enLecteur) return;
    const canalMontage = window.parent !== window ? params.get('montage') : null;
    let versionMontage = 0, montageCharge = false, chargementsMontage = Promise.resolve();
    function signalerAuMontage(action, contenu) {
        if (!canalMontage) return;
        window.parent.postMessage({ type: 'autableau:montage', canal: canalMontage,
            version: versionMontage, action, ...contenu }, location.protocol === 'file:' || location.origin === 'null' ? '*' : location.origin);
    }

    document.documentElement.classList.add('mode-lecteur');
    if (document.body) document.body.classList.add('mode-lecteur');

    // ---------------------------------------------------------------------
    // LES MAINS LIÉES : rien ne s'écrit, rien ne se reprend
    // ---------------------------------------------------------------------
    // Le démarrage de l'application relit la session autosauvée et propose
    // de la reprendre ; le lecteur ne doit ni la voir, ni l'écraser. On lui
    // fait trouver le stockage vide, et l'on rend muettes les écritures.
    if (window.localforage) {
        const getItemDOrigine = localforage.getItem.bind(localforage);
        const setItemDOrigine = localforage.setItem.bind(localforage);
        const cleAuto = () => (typeof AUTO_SAVE_KEY !== 'undefined') ? AUTO_SAVE_KEY : 'auTableau_autosave';
        localforage.getItem = (k, ...a) => (k === cleAuto()) ? Promise.resolve(null) : getItemDOrigine(k, ...a);
        localforage.setItem = (k, v, ...a) => (k === cleAuto()) ? Promise.resolve(v) : setItemDOrigine(k, v, ...a);
    }
    const muet = (nom, valeur) => { if (typeof window[nom] === 'function') window[nom] = () => valeur; };
    muet('saveState');
    muet('saveAppLocal');
    muet('writeAppLocal', Promise.resolve());
    muet('saveCurrentBoard');
    // L'historique d'annulation n'a pas lieu d'être : le lecteur a son film.
    // Le redérouler en deux cents états complets coûterait cher sur un
    // téléphone, pour rien.
    window.deroulerLeFilm = () => [];

    // IL N'Y A QU'UN OUTIL : LA MAIN. Les barres sont cachées, mais les
    // raccourcis du clavier vivent sur « window » comme les nôtres — et à
    // la cible, l'ordre d'inscription l'emporte sur la phase de capture :
    // une touche qui arrive avant nous prendrait le crayon, et l'élève
    // écrirait sur la séance. Quel que soit l'outil demandé, c'est la main
    // qu'on donne.
    const setModeDOrigine = window.setMode;
    if (typeof setModeDOrigine === 'function') {
        window.setMode = function () { return setModeDOrigine.call(this, 'move'); };
    }

    // Le premier écran (« trois portes ») n'a rien à dire à un élève.
    const pret = {};
    pret.promesse = new Promise(ok => { pret.resoudre = ok; });
    const initDOrigine = window.initPages;
    window.initPages = function () {
        const r = (typeof initDOrigine === 'function') ? initDOrigine.apply(this, arguments) : undefined;
        pret.resoudre();
        return r;
    };
    window.montrerLePremierEcran = () => { window.initPages(); return false; };
    // Si le démarrage prenait un autre chemin, on ne resterait pas bloqués.
    setTimeout(pret.resoudre, 8000);

    // ---------------------------------------------------------------------
    // LE FILM, PAS À PAS
    // ---------------------------------------------------------------------
    const familles = () => (typeof FILM_FAMILLES !== 'undefined') ? FILM_FAMILLES
        : ['points', 'segments', 'circles', 'rectangles', 'texts', 'freehands', 'curves', 'polygons', 'images', 'arcs', 'htmlPostits'];
    const CHAQUE = 25;   // un jalon tous les 25 pas : revenir en arrière ne refait pas tout

    // Une page du film : ses pas, ses jalons, et où l'on en est.
    function preparerLaPage(p) {
        const film = (window.FilmComplet ? FilmComplet.filmEntier(p) : ((p.filmArchive || []).concat(p.film || [])))
            .filter(x => x && typeof x === 'object');
        const finale = {};
        familles().forEach(f => { finale[f] = Array.isArray(p[f]) ? p[f] : []; });
        const annotations = (Array.isArray(p.annotationsReplay) ? p.annotationsReplay : []).filter(a => a
            && typeof a.texte === 'string' && a.texte.trim() && a.texte.length <= 280
            && Number.isInteger(a.debut) && Number.isInteger(a.fin)
            && a.debut >= 0 && a.fin >= a.debut && a.fin < Math.max(1, film.length));
        return { film, finale, annotations, nuit: nuitDeLaPage(p, finale), jalons: [], courant: null, index: -1, vue: null };
    }

    // ---------------------------------------------------------------------
    // CHAQUE PAGE SUR SON FOND
    // ---------------------------------------------------------------------
    // On passe en mode nuit pour une page, puis l'on revient au jour : la
    // séance n'a pas un mode, chacune de ses pages a le sien. La page le
    // porte quand elle a été écrite depuis qu'il est enregistré ; sinon, son
    // encre le dit — de la craie blanche ne s'écrit pas sur du papier blanc.
    function clarte(couleur) {
        const c = String(couleur || '').trim().toLowerCase();
        if (c === 'white') return 1;
        if (c === 'black') return 0;
        let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c);
        let rvb = m ? [m[1] + m[1], m[2] + m[2], m[3] + m[3]].map(x => parseInt(x, 16)) : null;
        if (!rvb && (m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/.exec(c))) rvb = [m[1], m[2], m[3]].map(x => parseInt(x, 16));
        if (!rvb && (m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(c))) rvb = [m[1], m[2], m[3]].map(Number);
        if (!rvb) return null;
        return (0.2126 * rvb[0] + 0.7152 * rvb[1] + 0.0722 * rvb[2]) / 255;
    }
    function nuitDeLaPage(p, finale) {
        if (typeof p.modeNuit === 'boolean') return p.modeNuit;
        let claires = 0, sombres = 0;
        ['freehands', 'texts', 'segments', 'circles', 'rectangles', 'polygons', 'curves', 'arcs'].forEach(f => {
            (finale[f] || []).forEach(o => {
                if (!o || o.isHighlighter) return;
                const k = clarte(o.strokeColor || o.color);
                if (k === null) return;
                if (k > 0.8) claires++;
                else if (k < 0.35) sombres++;
            });
        });
        if (claires > sombres) return true;
        if (sombres > claires) return false;
        return null;   // rien ne le dit : le mode du tableau
    }
    function poserLeModeDeLaPage() {
        const p = pageEnCours();
        if (!p || typeof poserLeModeNuit !== 'function') return;
        const nuit = typeof p.nuit === 'boolean' ? p.nuit
            : typeof seance.nuitDuTableau === 'boolean' ? seance.nuitDuTableau : seance.nuitAuDepart;
        poserLeModeNuit(!!nuit);
    }

    function appliquerLePas(cur, pas) {
        const etat = {};
        familles().forEach(f => {
            const d = pas[f];
            if (d === undefined) etat[f] = cur ? cur[f] : [];
            else if (Array.isArray(d)) etat[f] = d;
            else etat[f] = (cur ? cur[f] : []).concat(d['+'] || []);
        });
        return etat;
    }

    // L'état au pas i. On repart du jalon le plus proche, jamais du début.
    function etatAu(page, i) {
        if (!page.film.length) return page.finale;
        const cible = Math.max(0, Math.min(page.film.length - 1, i));
        let depart = -1, cur = null;
        if (page.index >= 0 && page.index <= cible) { depart = page.index; cur = page.courant; }
        const j = Math.floor(cible / CHAQUE);
        for (let k = j; k >= 0; k--) {
            if (page.jalons[k] && k * CHAQUE > depart) { depart = k * CHAQUE; cur = page.jalons[k]; break; }
        }
        for (let n = depart + 1; n <= cible; n++) {
            cur = appliquerLePas(cur, page.film[n]);
            if (n % CHAQUE === 0 && !page.jalons[n / CHAQUE]) page.jalons[n / CHAQUE] = cur;
        }
        page.index = cible; page.courant = cur;
        return cur;
    }

    // Ce qu'un pas ajoute — c'est ce que la vue va suivre.
    function ajoutsDuPas(pas) {
        const out = [];
        if (!pas) return out;
        ['freehands', 'curves', 'points', 'texts', 'images', 'arcs'].forEach(f => {
            const d = pas[f];
            if (d && !Array.isArray(d) && Array.isArray(d['+'])) d['+'].forEach(o => out.push({ f, o }));
        });
        return out;
    }

    function boiteDes(ajouts) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const prendre = (x, y) => {
            if (!isFinite(x) || !isFinite(y)) return;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        };
        ajouts.forEach(({ f, o }) => {
            if (!o) return;
            if (f === 'freehands' || f === 'curves') (o.points || []).forEach(p => prendre(p.x, p.y));
            else if (f === 'points') prendre(o.x, o.y);
            else if (f === 'images') { prendre(o.x, o.y); prendre(o.x + (o.w || 0), o.y + (o.h || 0)); }
            else if (f === 'arcs') { prendre(o.cx - o.radius, o.cy - o.radius); prendre(o.cx + o.radius, o.cy + o.radius); }
            else if (f === 'htmlPostits') { prendre(o.x, o.y); prendre(o.x + (o.w || 200), o.y + (o.h || 150)); }
            else if (f === 'texts') {
                let b = null;
                try { b = (typeof getItemLogicalBounds === 'function') ? getItemLogicalBounds('text', o) : null; } catch (e) { b = null; }
                if (b) { prendre(b.bx, b.by); prendre(b.bx + b.bw, b.by + b.bh); } else prendre(o.x, o.y);
            }
        });
        if (minX === Infinity) return null;
        return { x: minX, y: minY, l: maxX - minX, h: maxY - minY };
    }

    // ---------------------------------------------------------------------
    // LES FORMULES
    // Un texte qui porte une formule la dessine depuis une image fabriquée
    // par MathJax. Cette image ne voyage pas dans le film : on la refait, une
    // fois par formule, et on la garde.
    // ---------------------------------------------------------------------
    const formules = new Map();
    function assurerLesFormules(liste) {
        if (typeof createMathImage !== 'function') return;
        (liste || []).forEach(t => {
            if (!t || typeof t.content !== 'string' || !t.content.includes('$')) return;
            if (t.mathImg instanceof HTMLImageElement) return;
            const cle = [t.content, t.color || t.strokeColor || '', t.fontSize || ''].join('');
            const connue = formules.get(cle);
            if (connue && connue.img) { t.mathImg = connue.img; t.mathW = connue.w; t.mathH = connue.h; return; }
            if (connue === 'en cours') return;
            delete t.mathImg;
            formules.set(cle, 'en cours');
            createMathImage(t.content, t.color || t.strokeColor, t.fontSize, (img, w, h) => {
                if (!img) { formules.delete(cle); return; }
                formules.set(cle, { img, w, h });
                t.mathImg = img; t.mathW = w; t.mathH = h;
                if (typeof draw === 'function') draw();
            });
        });
    }

    // ---------------------------------------------------------------------
    // LA SÉANCE
    // ---------------------------------------------------------------------
    const seance = {
        pages: [], page: 0, titre: '', classe: '', date: '', publieLe: null,
        lecture: false, minuteur: null, delai: 700, suivre: true, chargee: false
    };
    const VITESSES = [
        { nom: 'Lent', delai: 1400 }, { nom: 'Normal', delai: 700 },
        { nom: 'Rapide', delai: 300 }, { nom: 'Très rapide', delai: 120 }
    ];

    const el = (id) => document.getElementById(id);
    const pageEnCours = () => seance.pages[seance.page];
    const nbPas = () => { const p = pageEnCours(); return p ? Math.max(1, p.film.length) : 1; };
    const indexCourant = () => { const p = pageEnCours(); return p ? Math.max(0, p.index) : 0; };

    function poser(i, options) {
        const p = pageEnCours();
        if (!p) return;
        const o = options || {};
        const cible = Math.max(0, Math.min(nbPas() - 1, i));
        const avance = cible === p.index + 1;
        const etat = etatAu(p, cible);
        afficherAnnotations(p, cible);
        let suivi = null;
        if (avance && seance.suivre && !o.sansSuivi) suivi = boiteDes(ajoutsDuPas(p.film[cible]));
        const avecPassage = o.passage && !suivi && typeof prendreLImageDAvant === 'function' && prendreLImageDAvant();
        assurerLesFormules(etat.texts);
        if (typeof appliquerEtatDuTableau === 'function') appliquerEtatDuTableau(etat, false);
        if (avecPassage && typeof jouerLePassage === 'function') jouerLePassage();
        else if (typeof finirLePassage === 'function') finirLePassage();
        if (suivi) amenerDansLaVue(suivi);
        majBarre();
    }

    // ---------------------------------------------------------------------
    // LA VUE
    // ---------------------------------------------------------------------
    function ecran() {
        const haut = el('lecteur-haut'), bas = el('lecteur-bas');
        return {
            L: window.innerWidth, H: window.innerHeight,
            enHaut: haut ? haut.getBoundingClientRect().height : 0,
            enBas: bas ? bas.getBoundingClientRect().height : 0
        };
    }

    function cadrer(boite) {
        if (glissade) { cancelAnimationFrame(glissade); glissade = null; }
        if (typeof finirLePassage === 'function') finirLePassage();
        const e = ecran();
        const marge = Math.max(16, Math.round(Math.min(e.L, e.H) * 0.04));
        if (!boite) { zoom = 1; panX = e.L / 2; panY = e.H / 2; }
        else {
            const libreL = Math.max(100, e.L - marge * 2);
            const libreH = Math.max(100, e.H - e.enHaut - e.enBas - marge * 2);
            const k = Math.min(libreL / Math.max(1, boite.l), libreH / Math.max(1, boite.h));
            const zMin = (typeof ZOOM_TOUT_VOIR_MIN !== 'undefined') ? ZOOM_TOUT_VOIR_MIN : 0.05;
            const zMax = (typeof ZOOM_TOUT_VOIR_MAX !== 'undefined') ? ZOOM_TOUT_VOIR_MAX : 2;
            zoom = Math.max(zMin, Math.min(zMax, k));
            panX = marge + (libreL - boite.l * zoom) / 2 - boite.x * zoom;
            panY = e.enHaut + marge + (libreH - boite.h * zoom) / 2 - boite.y * zoom;
        }
        if (typeof majCurseurZoom === 'function') majCurseurZoom();
        if (typeof majPastilleZoom === 'function') majPastilleZoom();
        if (typeof draw === 'function') draw();
    }

    // Tout ce qu'une page porte, pour la cadrer.
    function boiteDeLEtat(etat) {
        const tout = [];
        ['freehands', 'curves', 'points', 'texts', 'images', 'arcs', 'htmlPostits'].forEach(f => {
            (etat[f] || []).forEach(o => tout.push({ f, o }));
        });
        return boiteDes(tout);
    }

    // Tout voir : la page entière, telle qu'elle finit — quel que soit le
    // pas montré, pour que la vue ne bouge pas quand on rembobine.
    function toutVoir() {
        const p = pageEnCours();
        if (!p) return;
        p.vue = boiteDeLEtat(p.finale);
        cadrer(p.vue);
    }

    let glissade = null;
    function amenerDansLaVue(boite) {
        if (!boite) return;
        const e = ecran();
        const marge = 24;
        const x1 = boite.x * zoom + panX, y1 = boite.y * zoom + panY;
        const x2 = x1 + boite.l * zoom, y2 = y1 + boite.h * zoom;
        const dedans = x1 >= marge && y1 >= e.enHaut + marge && x2 <= e.L - marge && y2 <= e.H - e.enBas - marge;
        if (dedans) return;
        // On recentre sur ce qui vient d'être écrit ; une pièce plus grande
        // que l'écran se cale par son coin haut gauche.
        const libreL = e.L, libreH = e.H - e.enHaut - e.enBas;
        let cibleX, cibleY;
        if (boite.l * zoom > libreL - marge * 2) cibleX = marge - boite.x * zoom;
        else cibleX = (libreL - boite.l * zoom) / 2 - boite.x * zoom;
        if (boite.h * zoom > libreH - marge * 2) cibleY = e.enHaut + marge - boite.y * zoom;
        else cibleY = e.enHaut + (libreH - boite.h * zoom) / 2 - boite.y * zoom;
        glisserVers(cibleX, cibleY);
    }

    function glisserVers(cibleX, cibleY) {
        if (glissade) cancelAnimationFrame(glissade);
        const dep = { x: panX, y: panY }, t0 = performance.now(), duree = 220;
        const pas = () => {
            const t = Math.min(1, (performance.now() - t0) / duree);
            const k = 1 - Math.pow(1 - t, 3);
            panX = dep.x + (cibleX - dep.x) * k; panY = dep.y + (cibleY - dep.y) * k;
            if (typeof draw === 'function') draw();
            glissade = (t < 1) ? requestAnimationFrame(pas) : null;
        };
        glissade = requestAnimationFrame(pas);
    }

    // ---------------------------------------------------------------------
    // LIRE, PAUSE, PAS À PAS
    // ---------------------------------------------------------------------
    function lire() {
        const p = pageEnCours();
        if (!p || p.film.length < 2) return false;
        if (indexCourant() >= nbPas() - 1) poser(0, { sansSuivi: true });
        seance.lecture = true;
        majBarre();
        programmer();
        return true;
    }
    function programmer() {
        clearTimeout(seance.minuteur);
        seance.minuteur = setTimeout(avancer, seance.delai);
    }
    function avancer() {
        if (!seance.lecture) return;
        if (indexCourant() >= nbPas() - 1) { pause(); return; }
        poser(indexCourant() + 1, { passage: true });
        programmer();
    }
    function pause() {
        seance.lecture = false;
        clearTimeout(seance.minuteur);
        seance.minuteur = null;
        majBarre();
    }
    function lireOuPause() { return seance.lecture ? (pause(), false) : lire(); }
    function pasAPas(sens) { pause(); poser(indexCourant() + sens, { passage: sens > 0 }); }

    function reglerLeDelai(delai) {
        seance.delai = Math.max(40, delai | 0);
        // Les fondus d'un pas à l'autre suivent la vitesse de l'application.
        if (typeof window.reglerLaVitesse === 'function' && typeof LECTURE_REFERENCE !== 'undefined') {
            try { window.reglerLaVitesse(LECTURE_REFERENCE / seance.delai); } catch (e) { /* tant pis */ }
        }
        if (seance.lecture) programmer();
        majBarre();
    }

    function changerDePage(k) {
        if (k < 0 || k >= seance.pages.length || k === seance.page) return;
        pause();
        seance.page = k;
        poserLeModeDeLaPage();
        if (typeof loadPage === 'function') loadPage(k);
        const p = pageEnCours();
        poser(p.film.length ? p.film.length - 1 : 0, { sansSuivi: true });
        if (p.vue === null) toutVoir(); else cadrer(p.vue);
        majBarre();
    }

    // ---------------------------------------------------------------------
    // LA BARRE
    // ---------------------------------------------------------------------
    const ICONES = {
        jouer: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
        pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
        prec: '<svg viewBox="0 0 24 24"><path d="M16 5v14L6 12z"/></svg>',
        suiv: '<svg viewBox="0 0 24 24"><path d="M8 5v14l10-7z"/></svg>',
        debut: '<svg viewBox="0 0 24 24"><path d="M5 5h2v14H5zM19 5v14L8 12z"/></svg>',
        fin: '<svg viewBox="0 0 24 24"><path d="M17 5h2v14h-2zM5 5v14l11-7z"/></svg>',
        cadrer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
    };

    function construire() {
        if (el('lecteur-haut')) return;
        const haut = document.createElement('div');
        haut.id = 'lecteur-haut'; haut.className = 'lecteur-ui';
        haut.innerHTML = '<div class="lecteur-titre"><b id="lecteur-nom">Séance</b><span id="lecteur-sous"></span></div>'
            + '<div class="lecteur-haut-actions"><button type="button" id="lecteur-cadrer" title="Tout voir (T)">' + ICONES.cadrer + '</button></div>';
        const bas = document.createElement('div');
        bas.id = 'lecteur-bas'; bas.className = 'lecteur-ui';
        bas.innerHTML = '<div id="lecteur-annotations" hidden role="status" aria-live="polite" aria-atomic="true"></div>'
            + '<div class="lecteur-ligne">'
            + '<input type="range" id="lecteur-curseur" min="0" max="0" value="0" aria-label="Où en est la lecture">'
            + '<span id="lecteur-compte">0 / 0</span></div>'
            + '<div class="lecteur-ligne lecteur-boutons">'
            + '<button type="button" id="lecteur-debut" title="Début">' + ICONES.debut + '</button>'
            + '<button type="button" id="lecteur-prec" title="Pas précédent (←)">' + ICONES.prec + '</button>'
            + '<button type="button" id="lecteur-jouer" class="grand" title="Lire / pause (Espace)">' + ICONES.jouer + '</button>'
            + '<button type="button" id="lecteur-suiv" title="Pas suivant (→)">' + ICONES.suiv + '</button>'
            + '<button type="button" id="lecteur-fin" title="Fin">' + ICONES.fin + '</button>'
            + '<select id="lecteur-vitesse" aria-label="Vitesse">' + VITESSES.map(v => '<option value="' + v.delai + '">' + v.nom + '</option>').join('') + '</select>'
            + '<div id="lecteur-pages"></div>'
            + '<label class="lecteur-suivre" title="La vue suit ce qui s\'écrit"><input type="checkbox" id="lecteur-suivre" checked> Suivre l\'écriture</label>'
            + '</div>';
        const voile = document.createElement('div');
        voile.id = 'lecteur-voile'; voile.className = 'lecteur-ui';
        voile.innerHTML = '<div class="lecteur-carte"><div id="lecteur-message">Chargement de la séance…</div>'
            + '<div id="lecteur-actions"></div></div>';
        document.body.appendChild(haut); document.body.appendChild(bas); document.body.appendChild(voile);

        el('lecteur-jouer').onclick = lireOuPause;
        el('lecteur-prec').onclick = () => pasAPas(-1);
        el('lecteur-suiv').onclick = () => pasAPas(1);
        el('lecteur-debut').onclick = () => { pause(); poser(0, { sansSuivi: true }); };
        el('lecteur-fin').onclick = () => { pause(); poser(nbPas() - 1, { sansSuivi: true }); };
        el('lecteur-cadrer').onclick = toutVoir;
        el('lecteur-vitesse').value = String(seance.delai);
        el('lecteur-vitesse').onchange = (e) => reglerLeDelai(parseInt(e.target.value, 10));
        el('lecteur-suivre').onchange = (e) => { seance.suivre = !!e.target.checked; };
        el('lecteur-curseur').addEventListener('input', () => {
            const v = parseInt(el('lecteur-curseur').value, 10);
            pause();
            poser(isFinite(v) ? v : 0, { sansSuivi: true });
        });
        // Le clavier : les mêmes gestes que le lecteur de l'application.
        window.addEventListener('keydown', (e) => {
            const dansUnChamp = e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
            if (!dansUnChamp) {
                if (e.key === ' ') { e.preventDefault(); lireOuPause(); }
                else if (e.key === 'ArrowRight') { e.preventDefault(); pasAPas(1); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); pasAPas(-1); }
                else if (e.key === 'Home') { e.preventDefault(); pause(); poser(0, { sansSuivi: true }); }
                else if (e.key === 'End') { e.preventDefault(); pause(); poser(nbPas() - 1, { sansSuivi: true }); }
                else if (e.key === 't' || e.key === 'T') { e.preventDefault(); toutVoir(); }
                else if (e.key === 'PageDown') { e.preventDefault(); changerDePage(seance.page + 1); }
                else if (e.key === 'PageUp') { e.preventDefault(); changerDePage(seance.page - 1); }
            }
            // Rien ne doit atteindre les raccourcis de l'application : « P »
            // prendrait le crayon, Suppr effacerait, Ctrl+Z annulerait.
            e.stopImmediatePropagation();
        }, true);
        ['paste', 'drop', 'dragover', 'dragenter'].forEach(type => {
            window.addEventListener(type, (e) => { e.preventDefault(); e.stopImmediatePropagation(); }, true);
        });
        let largeurTableau = el('board').clientWidth, hauteurTableau = el('board').clientHeight;
        window.addEventListener('resize', () => {
            const c = el('board');
            if (c.clientWidth === largeurTableau && c.clientHeight === hauteurTableau) return;
            largeurTableau = c.clientWidth; hauteurTableau = c.clientHeight;
            const p = pageEnCours();
            if (p && p.vue) cadrer(p.vue);
        });
    }

    let annotationsAffichees = [];
    function afficherAnnotations(page, index) {
        const zone = el('lecteur-annotations');
        if (!zone) return;
        const actives = page.annotations.filter(a => index >= a.debut && index <= a.fin);
        // Un même message reste en place, y compris en pause : pas de
        // recréation ni d'annonce vocale répétée à chaque trait du replay.
        if (actives.length === annotationsAffichees.length && actives.every((a, i) => a === annotationsAffichees[i])) return;
        annotationsAffichees = actives;
        zone.textContent = '';
        zone.hidden = !actives.length;
        const styles = { consigne: 'Consigne', rappel: 'Rappel', correction: 'Correction' };
        actives.forEach(a => {
            const style = Object.prototype.hasOwnProperty.call(styles, a.style) ? a.style : 'consigne';
            const note = document.createElement('div');
            note.className = 'lecteur-annotation ' + style;
            const titre = document.createElement('b'); titre.textContent = styles[style];
            const texte = document.createElement('span'); texte.textContent = a.texte;
            note.append(titre, texte); zone.appendChild(note);
        });
        zone.scrollTop = 0;
    }

    function majBarre() {
        if (!el('lecteur-bas')) return;
        const n = nbPas(), i = indexCourant();
        const curseur = el('lecteur-curseur');
        curseur.max = Math.max(0, n - 1);
        if (document.activeElement !== curseur) curseur.value = i;
        el('lecteur-compte').textContent = (i + 1) + ' / ' + n;
        const jouer = el('lecteur-jouer');
        jouer.innerHTML = seance.lecture ? ICONES.pause : ICONES.jouer;
        jouer.classList.toggle('en-marche', seance.lecture);
        jouer.setAttribute('aria-label', seance.lecture ? 'Pause' : 'Lire');
        const sansFilm = n < 2;
        ['lecteur-jouer', 'lecteur-prec', 'lecteur-suiv', 'lecteur-debut', 'lecteur-fin', 'lecteur-curseur'].forEach(id => { el(id).disabled = sansFilm; });
        const pagesEl = el('lecteur-pages');
        pagesEl.textContent = '';
        if (seance.pages.length > 1) {
            seance.pages.forEach((p, k) => {
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'lecteur-page' + (k === seance.page ? ' actif' : '');
                b.textContent = String(k + 1); b.title = 'Page ' + (k + 1);
                b.onclick = () => changerDePage(k);
                pagesEl.appendChild(b);
            });
        }
        if (montageCharge) signalerAuMontage('position', { page: seance.page, index: i, pas: n, lecture: seance.lecture });
    }

    function message(texte, actions) {
        const voile = el('lecteur-voile');
        if (!voile) return;
        voile.style.display = 'flex';
        el('lecteur-message').textContent = texte;
        const zone = el('lecteur-actions');
        zone.textContent = '';
        (actions || []).forEach(a => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'lecteur-btn' + (a.primaire ? ' primaire' : '');
            b.innerHTML = a.html || ''; b.appendChild(document.createTextNode(a.texte));
            b.onclick = a.action;
            if (a.id) b.id = a.id;
            zone.appendChild(b);
        });
    }
    function fermerLeVoile() { const v = el('lecteur-voile'); if (v) v.style.display = 'none'; }

    // ---------------------------------------------------------------------
    // OUVRIR UNE SÉANCE
    // ---------------------------------------------------------------------
    function dateLisible(iso) {
        if (!iso) return '';
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T12:00:00' : iso);
        if (isNaN(d.getTime())) return String(iso);
        return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    async function charger(objet, fiche) {
        const contenu = objet && objet.data && objet.data.pages ? objet.data : objet;
        if (!contenu || !Array.isArray(contenu.pages) || !contenu.pages.length) throw new Error('Ce fichier n\'est pas un tableau Au Tableau');
        pause();
        seance.chargee = false;
        const meta = (objet && objet.seance) || {};
        seance.titre = meta.titre || (objet && objet.name) || contenu.nomDuTableau || 'Séance';
        seance.classe = meta.classe || '';
        seance.date = meta.date || '';
        seance.publieLe = meta.publieLe || (fiche && fiche.modifiedTime) || null;
        // Les films se prennent AVANT de confier les pages à l'application :
        // elle retouche `film` en chargeant une page.
        seance.pages = contenu.pages.map(preparerLaPage);
        seance.page = 0;

        await pret.promesse;
        if (seance.nuitAuDepart === undefined) seance.nuitAuDepart = (typeof isDarkMode !== 'undefined') && isDarkMode;
        seance.nuitDuTableau = typeof contenu.modeNuit === 'boolean' ? contenu.modeNuit : null;
        if (typeof restoreState === 'function') restoreState(contenu);
        poserLeModeDeLaPage();
        if (typeof setMode === 'function') setMode('move');
        if (typeof clearSelection === 'function') clearSelection();

        el('lecteur-nom').textContent = seance.titre;
        const sous = [seance.classe, dateLisible(seance.date)].filter(Boolean).join(' · ');
        el('lecteur-sous').textContent = sous;
        document.title = seance.titre + (seance.classe ? ' — ' + seance.classe : '') + ' — Au Tableau';

        const p = pageEnCours();
        poser(p.film.length ? p.film.length - 1 : 0, { sansSuivi: true });
        toutVoir();
        majBarre();
        seance.chargee = true;

        if (p.film.length < 2 && seance.pages.every(q => q.film.length < 2)) {
            message('Cette séance n\'a pas de film : voici le tableau tel qu\'il a fini.',
                [{ texte: 'Voir le tableau', primaire: true, id: 'lecteur-demarrer', action: fermerLeVoile }]);
        } else {
            message('', [{ texte: 'Rejouer la séance', primaire: true, id: 'lecteur-demarrer', html: ICONES.jouer,
                action: () => { fermerLeVoile(); poser(0, { sansSuivi: true }); lire(); } }]);
            el('lecteur-message').textContent = seance.titre + (sous ? ' — ' + sous : '');
        }
        window.dispatchEvent(new CustomEvent('lecteur:chargee'));
    }

    function proposerUnFichier(texte) {
        const entree = document.createElement('input');
        entree.type = 'file'; entree.accept = '.prof,.json,application/json'; entree.style.display = 'none';
        entree.addEventListener('change', async () => {
            const f = entree.files && entree.files[0];
            if (!f) return;
            try { await charger(JSON.parse(await f.text()), null); }
            catch (e) { message('Impossible d\'ouvrir ce fichier : ' + (e.message || e), [ouvrirUnFichier]); }
        });
        document.body.appendChild(entree);
        const ouvrirUnFichier = { texte: 'Ouvrir un fichier .prof', primaire: true, action: () => entree.click() };
        message(texte || 'Aucune séance n\'est désignée. Ouvrez un tableau enregistré pour le rejouer.', [ouvrirUnFichier]);
    }

    async function demarrer() {
        construire();
        majBarre();
        if (canalMontage) {
            message('Chargement de l’aperçu…');
            window.addEventListener('message', e => {
                const m = e.data;
                if (e.source !== window.parent || !(e.origin === location.origin || (location.protocol === 'file:' && e.origin === 'null')) || !m
                    || m.type !== 'autableau:montage' || m.canal !== canalMontage) return;
                if (m.action === 'pause') { pause(); return; }
                if (m.action !== 'charger') return;
                montageCharge = false;
                pause();
                versionMontage = m.version;
                chargementsMontage = chargementsMontage.then(async () => {
                    if (m.version !== versionMontage) return;
                    try {
                        await charger(m.objet, null);
                        if (m.version !== versionMontage) return;
                        const pos = m.position || {};
                        if (Number.isInteger(pos.page)) changerDePage(pos.page);
                        poser(Number.isInteger(pos.index) ? pos.index : 0, { sansSuivi: true });
                        fermerLeVoile();
                        montageCharge = true;
                        majBarre();
                    } catch (err) {
                        signalerAuMontage('erreur', { message: err.message || 'Impossible de charger le montage.' });
                    }
                });
            });
            signalerAuMontage('pret');
            return;
        }
        const u = params.get('u');
        const id = params.get('id');
        const relais = params.get('r');
        const f = params.get('f') || params.get('seance');
        try {
            if (id && relais) {
                // LE RELAIS : c'est lui qui lit le fichier, sous le compte du
                // professeur. Aucune clé ne circule, et la séance peut rester
                // privée dans son Drive.
                if (!window.Relais) throw new Error('Le lecteur du relais manque');
                message('Chargement de la séance…');
                const { fiche, contenu } = await Relais.lireLaSeance(relais, id);
                await charger(contenu, fiche);
            } else if (id) {
                if (!window.DrivePublic) throw new Error('Le lecteur du Drive manque');
                const { cle } = DrivePublic.reglages(params);
                if (!cle) throw new Error('Ce lien est incomplet : demandez un nouveau lien à votre enseignant.');
                message('Chargement de la séance…');
                const { fiche, contenu } = await DrivePublic.lireFichier(id, cle, params.get('rk'));
                await charger(contenu, fiche);
            } else if (u) {
                message('Chargement de la séance…');
                const r = await fetch(u, { cache: 'no-store' });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                await charger(await r.json(), null);
            } else if (f) {
                if (!window.DrivePublic) throw new Error('Le lecteur du Drive manque');
                const { dossier, cle } = DrivePublic.reglages(params);
                if (!dossier || !cle) {
                    message('Ce lien est incomplet : il ne dit pas dans quel dossier chercher la séance.', []);
                    return;
                }
                message('Chargement de la séance…');
                const nom = /\.prof$/i.test(f) ? f : f + '.prof';
                const { fiche, contenu } = await DrivePublic.lireLaSeance(nom, dossier, cle);
                if (!contenu) {
                    message('La séance « ' + f + ' » n\'est pas encore en ligne. Si elle vient d\'être publiée, réessayez dans une minute.',
                        [{ texte: 'Réessayer', primaire: true, action: demarrer }]);
                    return;
                }
                await charger(contenu, fiche);
            } else {
                proposerUnFichier();
            }
        } catch (e) {
            console.warn('Lecteur :', e);
            const explication = (window.DrivePublic && (e.code !== undefined)) ? DrivePublic.expliquer(e) : (e.message || String(e));
            message('Impossible d\'ouvrir la séance. ' + explication, [{ texte: 'Réessayer', primaire: true, action: demarrer }]);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { document.body.classList.add('mode-lecteur'); demarrer(); });
    else { document.body.classList.add('mode-lecteur'); demarrer(); }

    window.Lecteur = {
        seance, charger, poser, lire, pause, lireOuPause, pasAPas, changerDePage, toutVoir, reglerLeDelai,
        etat: () => ({ page: seance.page, index: indexCourant(), pas: nbPas(), lecture: seance.lecture,
                       pages: seance.pages.map(p => p.film.length), chargee: seance.chargee }),
        boiteDes, etatAu
    };
})();
