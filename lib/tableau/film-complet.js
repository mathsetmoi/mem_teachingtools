// ============================================================
// LE FILM ENTIER DE LA SÉANCE
// ============================================================
// L'historique d'annulation garde deux cents états du tableau, pas plus :
// au-delà, il jette les plus anciens — c'est la seule façon de tenir en
// mémoire, chaque état étant le tableau complet. Le film enregistré avec le
// tableau suivait le même couperet : sur une heure de cours à sept cents
// traits, le lecteur ne pouvait rejouer que le dernier quart d'heure.
//
// Un pas du film ne pèse pourtant que ce qu'il ajoute — quelques centaines
// d'octets par trait. Ce que l'historique jette, on le range donc dans une
// ARCHIVE posée sur la page (`page.filmArchive`), qui part sur le disque avec
// elle : le film entier, c'est l'archive suivie du film courant. L'annulation
// garde ses deux cents pas, le lecteur en ligne rejoue toute la séance.
//
// On note aussi l'heure de chaque pas : sans elle, on ne peut dire ni combien
// a duré la séance, ni à quel moment on a écrit quoi.
//
// Rien de tout cela ne touche script.js : `trimHistory` et `saveState` sont
// des fonctions globales, on pose la nôtre par-dessus.
// ============================================================
(function () {
    'use strict';

    const ARCHIVE_MAX = 4000;     // pas gardés dans l'archive d'une page
    const ARCHIVE_COUPE = 1000;   // combien on en retire quand elle déborde

    const familles = () => (typeof FILM_FAMILLES !== 'undefined') ? FILM_FAMILLES
        : ['points', 'segments', 'circles', 'rectangles', 'texts', 'freehands', 'curves', 'polygons', 'images', 'arcs', 'htmlPostits'];

    // Chaque tableau d'archive a un dernier état détaché. WeakMap ne part
    // pas sur le disque et libère le cache avec les archives abandonnées.
    // La clé est l'archive, car syncPage remplace l'objet page à chaque fois.
    const archivesConnues = new WeakMap();

    function appliquerPas(cur, pas) {
        const etat = {};
        familles().forEach(f => {
            const d = pas[f];
            etat[f] = d === undefined ? (cur ? cur[f] : [])
                : Array.isArray(d) ? d : (cur ? cur[f] : []).concat(d['+'] || []);
        });
        return etat;
    }

    function compacterPas(cur, pas) {
        const etat = appliquerPas(cur, pas);
        const compact = etapeDuFilm(cur, etat);
        // L'heure et toute autre métadonnée restent attachées à l'étape.
        Object.keys(pas).forEach(k => { if (!familles().includes(k)) compact[k] = pas[k]; });
        return compact;
    }

    // Les anciennes versions archivaient la première case de l'historique
    // APRÈS qu'elle était devenue un tableau complet. À chaque trait elles
    // rangeaient donc de nouveau presque toute la séance. On convertit ces
    // archives une seule fois, à l'ouverture ou avant le premier export.
    function preparerArchive(p) {
        if (!p || !Array.isArray(p.filmArchive) || !p.filmArchive.length) return null;
        const connue = archivesConnues.get(p.filmArchive);
        if (connue && connue.longueur === p.filmArchive.length
            && connue.dernier === p.filmArchive[p.filmArchive.length - 1]) return connue.etat;
        let courant = null;
        const archive = p.filmArchive.map(pas => {
            if (!pas || typeof pas !== 'object') return pas;
            const compact = compacterPas(courant, pas);
            courant = appliquerPas(courant, compact);
            return compact;
        });
        p.filmArchive = archive;
        memoriserArchive(archive, courant);
        return courant;
    }

    function memoriserArchive(archive, etat) {
        archivesConnues.set(archive, { etat, longueur: archive.length, dernier: archive[archive.length - 1] });
    }

    // L'état complet au bout d'une suite de pas — sans passer par des chaînes.
    function etatAuBout(pas) {
        let cur = null;
        pas.forEach(p => {
            if (!p || typeof p !== 'object') return;
            cur = appliquerPas(cur, p);
        });
        return cur;
    }

    // Une archive qui déborde perd ses plus anciens pas ; le premier qui
    // reste redevient un état entier, comme la première case du film.
    function contenirLArchive(archive) {
        if (archive.length <= ARCHIVE_MAX) return archive;
        const entier = etatAuBout(archive.slice(0, ARCHIVE_COUPE + 1));
        const premier = {};
        familles().forEach(f => { premier[f] = (entier && entier[f]) || []; });
        const t = archive[ARCHIVE_COUPE] && archive[ARCHIVE_COUPE].t;
        if (t) premier.t = t;
        return [premier].concat(archive.slice(ARCHIVE_COUPE + 1));
    }

    const pageCourante = () => (typeof pages !== 'undefined' && typeof currentPageIndex !== 'undefined') ? pages[currentPageIndex] : null;

    // Ce que l'historique jette, l'archive le reçoit.
    //
    // UNE SUBTILITÉ : en coupant la tête du film, l'application redonne son
    // état entier à la case qui devient la première — elle la REMPLACE par un
    // objet neuf, qui ne porte plus l'heure. Comme c'est cette case-là qui
    // sera archivée au tour suivant, l'archive perdait toutes ses heures sauf
    // une. On la lui rend.
    const trimDOrigine = window.trimHistory;
    if (typeof trimDOrigine === 'function') {
        window.trimHistory = function () {
            const avant = (typeof filmPas !== 'undefined' && Array.isArray(filmPas)) ? filmPas.slice() : null;
            const r = trimDOrigine.apply(this, arguments);
            if (avant) {
                const coupe = avant.length - filmPas.length;
                if (coupe > 0) {
                    const remplacee = avant[coupe];
                    if (remplacee && remplacee.t && filmPas[0] && !filmPas[0].t) filmPas[0].t = remplacee.t;
                    const p = pageCourante();
                    if (p) {
                        let courant = preparerArchive(p);
                        const ajouts = avant.slice(0, coupe).map(pas => {
                            const compact = compacterPas(courant, pas);
                            courant = appliquerPas(courant, compact);
                            return compact;
                        });
                        p.filmArchive = contenirLArchive((p.filmArchive || []).concat(ajouts));
                        memoriserArchive(p.filmArchive, courant);
                    }
                }
            }
            return r;
        };
    }

    // L'heure du pas, posée sur la case que saveState vient d'ajouter.
    //
    // ON RECONNAÎT LA CASE, PAS LE COMPTE : une fois l'historique plein,
    // chaque geste en ajoute une et en retire une — la longueur ne bouge
    // plus, et c'est justement là que l'heure aurait cessé d'être notée.
    const saveDOrigine = window.saveState;
    if (typeof saveDOrigine === 'function') {
        window.saveState = function () {
            const avant = (typeof filmPas !== 'undefined' && Array.isArray(filmPas)) ? filmPas[filmPas.length - 1] : null;
            const r = saveDOrigine.apply(this, arguments);
            if (Array.isArray(filmPas) && filmPas.length) {
                const dernier = filmPas[filmPas.length - 1];
                if (dernier !== avant && dernier && typeof dernier === 'object' && !dernier.t) dernier.t = Date.now();
            }
            return r;
        };
    }

    // Le film entier d'une page : l'archive, puis le film courant.
    function filmEntier(p) {
        if (!p) return [];
        preparerArchive(p);
        return (Array.isArray(p.filmArchive) ? p.filmArchive : []).concat(Array.isArray(p.film) ? p.film : []);
    }

    window.FilmComplet = { filmEntier, etatAuBout, contenirLArchive, preparerArchive, ARCHIVE_MAX };
})();
