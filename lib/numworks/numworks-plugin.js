// ==============================================================================
// LA CALCULATRICE NUMWORKS SUR LE TABLEAU — COLLÈGE OU LYCÉE
// ==============================================================================
// « Je voudrais intégrer le simulateur calculatrice NumWorks collège et celui
// du lycée. »
//
// NumWorks propose son émulateur « prêt à intégrer », mais en anglais et pour
// la seule calculatrice graphique. La page lib/numworks/calculatrice.html
// pose le même composant, en français, et choisit le modèle : la scientifique
// (collège) ou la graphique (lycée). Ici, on la met dans une fenêtre web du
// tableau — la même que GeoGebra ou Python : elle se déplace, se redimensionne,
// se met en grand, et part avec la séance.
//
// Ce fichier ne touche pas à plugin.js : il s'enregistre comme les autres
// outils, dans la rubrique « Maths - Algèbre », à côté du traceur de
// fonctions et du tableau de signes — c'est là qu'on cherche une calculatrice
// graphique. (« Maths - Numérique » compte déjà vingt-quatre outils, que la
// grille range en rangées égales ; un vingt-cinquième les déséquilibrait.)
// ==============================================================================
(function () {
    'use strict';

    const CLE_MODELE = 'auTableau_numworks_modele';

    // Les deux calculatrices, et la place qu'elles prennent sur le tableau
    // (en unités du tableau, barre de titre comprise). La scientifique est
    // plus trapue que la graphique.
    const MODELES = {
        college: { nom: 'Collège — scientifique', titre: 'NumWorks collège', l: 340, h: 620 },
        lycee:   { nom: 'Lycée — graphique',      titre: 'NumWorks lycée',   l: 330, h: 700 }
    };

    function modeleRetenu() {
        try { const m = localStorage.getItem(CLE_MODELE); if (MODELES[m]) return m; } catch (e) { /* refusé */ }
        return 'lycee';
    }
    function retenirLeModele(m) {
        try { localStorage.setItem(CLE_MODELE, m); } catch (e) { /* refusé */ }
    }

    // L'adresse de la page, relative à celle du tableau : elle vaut en ligne
    // (https), sur un serveur local (http) et depuis un dossier (file). C'est
    // pour cela qu'on ne passe pas par « ouvrirUneFenetreWeb », qui n'accepte
    // que du https — une règle faite pour les sites d'ailleurs, pas pour une
    // page à nous.
    function adresseDeLaCalculatrice(modele) {
        return new URL('lib/numworks/calculatrice.html?modele=' + encodeURIComponent(modele), document.baseURI).href;
    }

    // Une fenêtre web comme les autres — voir « ouvrirUneFenetreWeb » dans
    // script.js, dont ceci reprend la forme.
    function poserLaCalculatrice(modele) {
        const m = MODELES[modele] || MODELES.lycee;
        retenirLeModele(modele);
        if (typeof htmlPostits === 'undefined' || typeof nextId === 'undefined') return null;
        const ech = (typeof zoom !== 'undefined' && zoom) || 1;
        const px = (typeof panX !== 'undefined') ? panX : 0;
        const py = (typeof panY !== 'undefined') ? panY : 0;
        const fenetre = {
            id: nextId++,
            x: (window.innerWidth / 2 - px) / ech - m.l / 2,
            y: (window.innerHeight / 2 - py) / ech - m.h / 2,
            w: m.l / ech, h: m.h / ech,
            mode: 'web', url: adresseDeLaCalculatrice(modele),
            titre: m.titre,
            content: '', bg: '#ffffff', minimized: false,
            ancre: 'tableau', z: globalZ++
        };
        htmlPostits.push(fenetre);
        if (typeof saveState === 'function') saveState();
        if (typeof renderHtmlPostits === 'function') renderHtmlPostits();
        if (typeof showToast === 'function') showToast('🧮 ' + m.titre + ' est sur le tableau');
        return fenetre;
    }

    const ICONE = '<svg viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor"'
        + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<rect x="5" y="2" width="14" height="20" rx="2"/>'
        + '<rect x="8" y="5" width="8" height="4" rx="1"/>'
        + '<line x1="8" y1="13" x2="8" y2="13.01"/><line x1="12" y1="13" x2="12" y2="13.01"/><line x1="16" y1="13" x2="16" y2="13.01"/>'
        + '<line x1="8" y1="17" x2="8" y2="17.01"/><line x1="12" y1="17" x2="12" y2="17.01"/><line x1="16" y1="17" x2="16" y2="17.01"/>'
        + '</svg>';

    // ------------------------------------------------------------------
    // L'ÉCRAN DE LA CALCULATRICE DANS LE REPLAY
    // ------------------------------------------------------------------
    // Ce qu'on tape vit dans l'émulateur, pas sur le tableau : le replay
    // montrait une calculatrice neuve, sans aucun des calculs de la classe —
    // et rien du tout tant que numworks.com n'avait pas répondu. La page de
    // la calculatrice photographie donc son écran après chaque saisie et
    // l'envoie ici ; on le range sur la fenêtre (« ecran »), et l'étape part
    // dans le film comme un trait.
    const PAGE = 'lib/numworks/calculatrice.html';
    const estUneCalculatrice = (o) => !!o && o.mode === 'web' && String(o.url || '').indexOf(PAGE) >= 0;
    const enLecture = () => !!window.AUTABLEAU_LECTEUR
        || (typeof lectureOuverte !== 'undefined' && lectureOuverte);

    window.addEventListener('message', (e) => {
        const m = e.data;
        if (!m || m.type !== 'autableau:numworks' || typeof m.ecran !== 'string') return;
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(m.ecran) || m.ecran.length > 300000) return;
        if (enLecture() || typeof htmlPostits === 'undefined') return;
        // Le message vient-il d'une de nos calculatrices ? On le reconnaît à
        // son cadre, pas à ce qu'il dit de lui-même.
        const cadres = document.querySelectorAll('#html-postits-container .html-postit iframe');
        let id = null;
        cadres.forEach(c => { if (c.contentWindow === e.source) id = parseInt(c.closest('.html-postit').dataset.id, 10); });
        const o = htmlPostits.find(p => p.id === id);
        if (!estUneCalculatrice(o) || o.ecran === m.ecran) return;
        o.ecran = m.ecran;
        if (typeof saveState === 'function') saveState();
    });

    // Dans le replay, l'écran de ce moment-là couvre la calculatrice. Un
    // bouton la rend à l'élève, qui peut refaire le calcul lui-même ; l'écran
    // revient dès que la séance en montre un nouveau.
    const STYLE = `
        .nw-ecran-replay { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column;
            align-items: center; gap: 10px; padding: 12px; background: #f5f6fa; overflow: auto;
            font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #2d3436; }
        .nw-ecran-replay img { width: 100%; max-width: 640px; image-rendering: pixelated;
            border: 6px solid #2d3436; border-radius: 6px; background: #fff; box-sizing: border-box; }
        .nw-ecran-replay p { margin: 0; text-align: center; color: #636e72; }
        .nw-ecran-replay button { border: 1px solid #b2bec3; background: #fff; color: #2d3436; border-radius: 8px;
            padding: 6px 12px; font: inherit; cursor: pointer; }
        .nw-ecran-replay button:hover { background: #ecf0f1; }
        .html-postit-web { position: relative; }`;

    function montrerLesEcrans() {
        const conteneur = document.getElementById('html-postits-container');
        if (!conteneur || typeof htmlPostits === 'undefined') return;
        conteneur.querySelectorAll('.html-postit').forEach(el => {
            const o = htmlPostits.find(p => p.id === parseInt(el.dataset.id, 10));
            const boite = el.querySelector('.html-postit-web');
            if (!boite) return;
            let voile = boite.querySelector('.nw-ecran-replay');
            const montrer = window.AUTABLEAU_LECTEUR && estUneCalculatrice(o) && o.ecran && el._nwRendu !== o.ecran;
            if (!montrer) { if (voile) voile.remove(); return; }
            if (!voile) {
                voile = document.createElement('div');
                voile.className = 'nw-ecran-replay';
                voile.innerHTML = '<img alt="Écran de la calculatrice"><p>L’écran de la calculatrice à ce moment de la séance.</p>'
                    + '<button type="button">Utiliser la calculatrice</button>';
                voile.querySelector('button').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    el._nwRendu = voile.querySelector('img').getAttribute('src');
                    voile.remove();
                });
                boite.appendChild(voile);
            }
            const img = voile.querySelector('img');
            if (img.getAttribute('src') !== o.ecran) img.setAttribute('src', o.ecran);
        });
    }

    // Le lecteur se charge APRÈS ce fichier : c'est à la fin du chargement
    // qu'on sait si l'on rejoue une séance.
    function brancherLeReplay() {
        if (!window.AUTABLEAU_LECTEUR) return;
        const style = document.createElement('style');
        style.textContent = STYLE;
        (document.head || document.documentElement).appendChild(style);
        const rendreDOrigine = window.renderHtmlPostits;
        if (typeof rendreDOrigine === 'function') {
            window.renderHtmlPostits = function () {
                const r = rendreDOrigine.apply(this, arguments);
                montrerLesEcrans();
                return r;
            };
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancherLeReplay);
    else brancherLeReplay();

    if (typeof registerPlugin !== 'function') return;

    registerPlugin('numworksTool', 'Maths - Algèbre', {
        MODELES,
        adresseDeLaCalculatrice,
        poser: poserLaCalculatrice,

        init: function () {
            const grid = document.getElementById('plugins-grid'); if (!grid) return;
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.id = 'btn-numworks';
            btn.title = 'Calculatrice NumWorks (collège ou lycée)';
            btn.setAttribute('data-tooltip', 'Calculatrice NumWorks');
            btn.innerHTML = ICONE;
            grid.appendChild(btn);
            btn.addEventListener('click', (e) => { e.stopPropagation(); this.ouvrir(); });
        },

        // Le choix du modèle, puis la fenêtre. Le dernier choix est retenu :
        // un professeur de collège n'a pas à le redire à chaque séance.
        ouvrir: function () {
            if (typeof openCustomPrompt !== 'function') { poserLaCalculatrice(modeleRetenu()); return; }
            openCustomPrompt('Calculatrice NumWorks', [
                { type: 'select', label: 'Modèle', value: modeleRetenu(), options: [
                    { value: 'college', label: MODELES.college.nom },
                    { value: 'lycee', label: MODELES.lycee.nom }
                ] }
            ], null, (res) => { poserLaCalculatrice(MODELES[res[0]] ? res[0] : 'lycee'); });
        },

        edit: function () { this.ouvrir(); }
    });
})();
