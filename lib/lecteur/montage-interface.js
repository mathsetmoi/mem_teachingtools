(function () {
    'use strict';
    function h(tag, attrs, ...enfants) {
        const e = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k.startsWith('on')) e[k] = v;
            else if (v !== false && v != null) e.setAttribute(k, v);
        });
        enfants.flat().forEach(c => { if (c != null) e.append(typeof c === 'string' ? document.createTextNode(c) : c); });
        return e;
    }
    const bouton = (texte, action, attrs = {}) => h('button', { type: 'button', class: 'pw-btn', onclick: action, ...attrs }, texte);

    function ouvrir(p, brouillon, terminer) {
        const data = brouillon.tableau.data;
        const canal = 'montage-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        const adresse = new URL('index.html', location.href);
        adresse.search = new URLSearchParams({ lecteur: '1', montage: canal }).toString();
        adresse.hash = '';
        const origine = location.origin;
        // Chromium affiche « file:// » dans location.origin, mais transmet
        // « null » pour un message entre deux fichiers locaux.
        const fichierLocal = location.protocol === 'file:';
        const cible = fichierLocal || origine === 'null' ? '*' : origine;
        const cadre = h('iframe', { id: 'montage-lecteur', title: 'Lecteur du montage', src: adresse.href });
        let apercu = false, pret = false, charge = false, version = 0;
        let position = brouillon.position || { page: 0, index: 0 };
        let pageSelection = position.page;
        brouillon.annotations = brouillon.annotations || MontageReplay.annotationsDe(data);
        let annotationEditee = -1;

        const etat = h('p', { class: 'montage-position', id: 'montage-position', 'aria-live': 'polite' }, 'Chargement du lecteur…');
        const erreur = h('p', { class: 'pub-erreur', role: 'alert', id: 'montage-erreur' });
        const debut = h('input', { id: 'montage-debut', type: 'number', min: '1', step: '1', value: String(position.index + 1), class: 'pw-champ-texte' });
        const fin = h('input', { id: 'montage-fin', type: 'number', min: '1', step: '1', value: String(position.index + 1), class: 'pw-champ-texte' });
        const marquer = (champ) => { champ.value = String(position.index + 1); envoyer({ action: 'pause' }); };
        const iciDebut = bouton('Début ici', () => marquer(debut));
        const iciFin = bouton('Fin ici', () => marquer(fin));
        const liste = h('div', { class: 'montage-coupes', id: 'montage-coupes' });
        const resume = h('p', { class: 'pub-texte', id: 'montage-resume', 'aria-live': 'polite' });
        const piste = h('div', { class: 'montage-piste', 'aria-hidden': 'true' });

        function envoyer(message) {
            if (pret) cadre.contentWindow.postMessage({ type: 'autableau:montage', canal, version, ...message }, cible);
        }
        function charger() {
            if (!pret) return;
            charge = false;
            version++;
            etat.textContent = 'Chargement du ' + (apercu ? 'montage' : 'tableau d’origine') + '…';
            actualiserCommandes();
            try {
                envoyer({ action: 'charger', objet: {
                    name: brouillon.meta.titre,
                    data: MontageReplay.monter(data, apercu ? brouillon.coupes : [], brouillon.documents,
                        apercu ? brouillon.annotations : []),
                    seance: brouillon.meta
                }, position: apercu ? { page: 0, index: 0 } : position });
            } catch (e) { erreur.textContent = e.message; }
        }
        function changerVue(valeur) {
            apercu = valeur;
            erreur.textContent = '';
            original.setAttribute('aria-pressed', String(!apercu));
            resultat.setAttribute('aria-pressed', String(apercu));
            charger();
        }
        const original = bouton('1. Préparer le montage', () => changerVue(false), { 'aria-pressed': 'true', id: 'montage-original' });
        const resultat = bouton('2. Voir le montage', () => changerVue(true), { 'aria-pressed': 'false', id: 'montage-apercu' });
        const retirer = bouton('Retirer ce passage', () => {
            try {
                envoyer({ action: 'pause' });
                const c = { page: position.page, debut: Number(debut.value) - 1, fin: Number(fin.value) - 1 };
                const stats = MontageReplay.bilan(data, brouillon.coupes.concat(c));
                if (!stats.gardees) throw new Error('Gardez au moins une étape dans la séance.');
                brouillon.coupes = stats.passages;
                erreur.textContent = '';
                actualiserListe();
            } catch (e) { erreur.textContent = e.message; }
        }, { id: 'montage-retirer', class: 'pw-btn montage-retirer' });

        const texteAnnotation = h('textarea', { id: 'montage-annotation-texte', rows: '2', maxlength: '280',
            class: 'pw-champ-texte', placeholder: 'Ex. : Médiatrice et non bissectrice' });
        const styleAnnotation = h('select', { id: 'montage-annotation-style', class: 'pw-select' },
            h('option', { value: 'consigne' }, 'Consigne'), h('option', { value: 'rappel' }, 'Rappel'),
            h('option', { value: 'correction' }, 'Correction'));
        const debutAnnotation = h('input', { id: 'montage-annotation-debut', type: 'number', min: '1', step: '1',
            value: String(position.index + 1), class: 'pw-champ-texte' });
        const finAnnotation = h('input', { id: 'montage-annotation-fin', type: 'number', min: '1', step: '1',
            value: String(Math.min(position.index + 10, MontageReplay.nombre(data.pages[position.page]))), class: 'pw-champ-texte' });
        const pageAnnotation = h('span', { id: 'montage-annotation-page', class: 'pub-aide' });
        const erreurAnnotation = h('p', { id: 'montage-annotation-erreur', class: 'pub-erreur', role: 'alert' });
        const listeAnnotations = h('div', { id: 'montage-annotations', class: 'montage-annotations' });
        const resumeAnnotations = h('p', { id: 'montage-annotations-resume', class: 'pub-texte', 'aria-live': 'polite' });
        let bornesAnnotationModifiees = false;
        [debutAnnotation, finAnnotation].forEach(champ => {
            champ.oninput = () => { bornesAnnotationModifiees = true; };
            champ.onfocus = () => envoyer({ action: 'pause' });
        });
        const apparitionIci = bouton('Afficher ici', () => { bornesAnnotationModifiees = true; marquer(debutAnnotation); });
        const disparitionIci = bouton('Fin du message ici', () => { bornesAnnotationModifiees = true; marquer(finAnnotation); });
        const modeles = ['À recopier', 'À terminer', 'Travail en groupe', 'Voir Classroom', 'Rappel', 'Médiatrice et non bissectrice']
            .map(texte => bouton(texte, () => {
                envoyer({ action: 'pause' });
                if (annotationEditee < 0 && !texteAnnotation.value && !bornesAnnotationModifiees) placerNouvelleAnnotation();
                texteAnnotation.value = texte;
                styleAnnotation.value = texte === 'Rappel' ? 'rappel' : texte.startsWith('Médiatrice') ? 'correction' : 'consigne';
                texteAnnotation.focus();
            }, { class: 'pw-btn montage-modele' }));

        function placerNouvelleAnnotation() {
            debutAnnotation.value = String(position.index + 1);
            finAnnotation.value = String(Math.min(position.index + 10, MontageReplay.nombre(data.pages[position.page])));
        }
        texteAnnotation.onfocus = () => {
            envoyer({ action: 'pause' });
            if (annotationEditee < 0 && !texteAnnotation.value && !bornesAnnotationModifiees) placerNouvelleAnnotation();
        };
        function nouvelleAnnotation() {
            annotationEditee = -1;
            texteAnnotation.value = '';
            styleAnnotation.value = 'consigne';
            bornesAnnotationModifiees = false;
            placerNouvelleAnnotation();
            erreurAnnotation.textContent = '';
            ajouterAnnotation.textContent = 'Ajouter le message';
            annulerAnnotation.hidden = true;
        }
        const ajouterAnnotation = bouton('Ajouter le message', () => {
            try {
                envoyer({ action: 'pause' });
                const [note] = MontageReplay.normaliserAnnotations(data, [{ page: position.page,
                    debut: Number(debutAnnotation.value) - 1, fin: Number(finAnnotation.value) - 1,
                    texte: texteAnnotation.value, style: styleAnnotation.value }]);
                if (annotationEditee < 0) brouillon.annotations.push(note);
                else brouillon.annotations[annotationEditee] = note;
                nouvelleAnnotation();
                actualiserAnnotations();
            } catch (e) { erreurAnnotation.textContent = e.message; }
        }, { id: 'montage-annotation-ajouter', class: 'pw-btn primaire' });
        const annulerAnnotation = bouton('Annuler la modification', nouvelleAnnotation, { hidden: true });
        const champsAnnotation = [texteAnnotation, styleAnnotation, debutAnnotation, finAnnotation,
            apparitionIci, disparitionIci, ajouterAnnotation, annulerAnnotation, ...modeles];

        function actualiserAnnotations() {
            const coupes = MontageReplay.normaliser(data, brouillon.coupes);
            resumeAnnotations.textContent = brouillon.annotations.length
                ? brouillon.annotations.length + ' annotation(s). Vérifiez leur apparition dans « Voir le montage ».'
                : 'Aucune annotation ajoutée.';
            listeAnnotations.textContent = '';
            brouillon.annotations.forEach((a, i) => {
                const retirees = coupes.filter(c => c.page === a.page).reduce((n, c) =>
                    n + Math.max(0, Math.min(c.fin, a.fin) - Math.max(c.debut, a.debut) + 1), 0);
                const invisible = retirees === a.fin - a.debut + 1;
                const bornes = 'Page ' + (a.page + 1) + ' · étapes ' + (a.debut + 1) + ' à ' + (a.fin + 1);
                listeAnnotations.append(h('div', { class: 'montage-annotation' + (invisible ? ' hors-montage' : '') },
                    h('div', { class: 'montage-annotation-contenu' }, h('b', {}, a.texte), h('small', {}, bornes),
                        invisible ? h('small', { class: 'montage-annotation-avertissement' }, 'Passage entièrement retiré : ce message ne sera pas publié.') : null),
                    h('div', { class: 'montage-annotation-actions' },
                        bouton('Modifier', () => {
                            position = brouillon.position = { page: a.page, index: a.debut };
                            pageSelection = a.page;
                            debut.value = fin.value = String(a.debut + 1);
                            annotationEditee = i;
                            bornesAnnotationModifiees = true;
                            texteAnnotation.value = a.texte; styleAnnotation.value = a.style;
                            debutAnnotation.value = String(a.debut + 1); finAnnotation.value = String(a.fin + 1);
                            ajouterAnnotation.textContent = 'Enregistrer la modification';
                            annulerAnnotation.hidden = false;
                            erreurAnnotation.textContent = '';
                            changerVue(false);
                        }, { 'aria-label': 'Modifier le message : ' + a.texte }),
                        bouton('Supprimer', () => {
                            brouillon.annotations.splice(i, 1);
                            if (annotationEditee === i) nouvelleAnnotation();
                            else if (annotationEditee > i) annotationEditee--;
                            actualiserAnnotations();
                            if (apercu) charger();
                        }, { 'aria-label': 'Supprimer le message : ' + a.texte }))));
            });
        }

        function actualiserCommandes() {
            [debut, fin, iciDebut, iciFin, retirer].forEach(e => { e.disabled = apercu || !charge; });
            champsAnnotation.forEach(e => { e.disabled = apercu || !charge; });
            const n = MontageReplay.nombre(data.pages[position.page]);
            debut.max = fin.max = String(n);
            debutAnnotation.max = finAnnotation.max = String(n);
            pageAnnotation.textContent = apercu ? 'Revenez à « Préparer le montage » pour ajouter un message.'
                : 'Sur la page ' + (position.page + 1) + ' de l’original';
            piste.textContent = '';
            let avant = 0;
            const morceau = (longueur, coupe) => {
                if (longueur) piste.append(h('span', { style: 'flex:' + longueur, class: coupe ? 'retire' : '' }));
            };
            MontageReplay.normaliser(data, brouillon.coupes).filter(c => c.page === position.page).forEach(c => {
                morceau(c.debut - avant, false); morceau(c.fin - c.debut + 1, true); avant = c.fin + 1;
            });
            morceau(n - avant, false);
            piste.hidden = apercu;
        }
        function actualiserListe() {
            const stats = MontageReplay.bilan(data, brouillon.coupes);
            resume.textContent = stats.retirees
                ? stats.retirees + ' étape(s) retirée(s) · ' + stats.gardees + ' conservée(s) sur ' + stats.total + '.'
                : 'Aucune coupe · ' + stats.total + ' étape(s) conservée(s).';
            liste.textContent = '';
            stats.passages.forEach((c, i) => {
                const texte = 'Page ' + (c.page + 1) + ' · étapes ' + (c.debut + 1) + ' à ' + (c.fin + 1);
                liste.append(h('div', { class: 'montage-coupe' }, h('span', {}, texte),
                    bouton('Rétablir', () => {
                        brouillon.coupes = stats.passages.filter((_, k) => i !== k);
                        erreur.textContent = '';
                        actualiserListe();
                        if (apercu) charger();
                    }, { 'aria-label': 'Rétablir : ' + texte })));
            });
            actualiserAnnotations();
            actualiserCommandes();
        }
        function recevoir(e) {
            const m = e.data;
            if (e.source !== cadre.contentWindow || !(e.origin === origine || (fichierLocal && e.origin === 'null'))
                || !m || m.type !== 'autableau:montage' || m.canal !== canal) return;
            if (m.action === 'pret') { pret = true; charger(); return; }
            if (m.version !== version) return;
            if (m.action === 'erreur') { erreur.textContent = m.message; return; }
            if (m.action !== 'position') return;
            charge = true;
            if (!apercu) {
                position = brouillon.position = { page: m.page, index: m.index };
                if (pageSelection !== position.page) {
                    pageSelection = position.page;
                    debut.value = fin.value = String(position.index + 1);
                    nouvelleAnnotation();
                }
            }
            etat.textContent = (apercu ? 'Montage' : 'Original') + ' · page ' + (m.page + 1)
                + ' · étape ' + (m.index + 1) + ' sur ' + m.pas;
            actualiserCommandes();
        }
        window.addEventListener('message', recevoir);
        p.append(h('div', { class: 'montage-intro' },
            h('div', { class: 'pw-bloc-titre' }, 'Monter le replay'),
            h('p', { class: 'pub-texte' }, 'Parcourez la séance pour retirer des passages ou ajouter des messages aux élèves. Vérifiez le résultat dans « Voir le montage ».')),
            h('div', { class: 'montage-onglets', role: 'group', 'aria-label': 'Version affichée' }, original, resultat),
            cadre, etat, piste,
            h('div', { class: 'pw-bloc-titre' }, 'Retirer un passage'),
            h('div', { class: 'montage-selection' },
                h('div', { class: 'montage-borne' }, h('label', { for: 'montage-debut' }, 'Première étape à retirer'), debut, iciDebut),
                h('div', { class: 'montage-borne' }, h('label', { for: 'montage-fin' }, 'Dernière étape à retirer'), fin, iciFin), retirer),
            erreur, resume, liste,
            h('section', { class: 'montage-section', 'aria-label': 'Annotations du replay' },
                h('div', { class: 'pw-bloc-titre' }, 'Ajouter une annotation'),
                h('p', { class: 'pub-texte' }, 'Le message s’affiche dans un bandeau au-dessus des commandes du lecteur, pendant les étapes choisies.'),
                h('div', { class: 'montage-modeles', role: 'group', 'aria-label': 'Messages rapides' }, modeles),
                h('label', { for: 'montage-annotation-texte' }, 'Message (280 caractères maximum)'), texteAnnotation,
                h('div', { class: 'montage-annotation-reglages' }, h('label', { for: 'montage-annotation-style' }, 'Présentation'), styleAnnotation, pageAnnotation),
                h('div', { class: 'montage-selection' },
                    h('div', { class: 'montage-borne' }, h('label', { for: 'montage-annotation-debut' }, 'Afficher à partir de l’étape'), debutAnnotation, apparitionIci),
                    h('div', { class: 'montage-borne' }, h('label', { for: 'montage-annotation-fin' }, 'Jusqu’à l’étape incluse'), finAnnotation, disparitionIci)),
                erreurAnnotation,
                h('div', { class: 'montage-annotation-actions' }, ajouterAnnotation, annulerAnnotation), resumeAnnotations, listeAnnotations),
            h('p', { class: 'pub-aide' }, 'Votre tableau d’origine reste intact. Les coupes et annotations sont conservées jusqu’au rechargement du site ; publiez pour garder le replay monté.'),
            h('div', { class: 'pw-pied' }, bouton('Continuer vers la publication', terminer, { class: 'pw-btn primaire' })));
        actualiserListe();
        // Changer d'onglet ou fermer détruit aussi le lecteur : aucun replay
        // caché ne continue à tourner derrière le tableau de travail.
        return () => { window.removeEventListener('message', recevoir); cadre.remove(); };
    }
    window.MontageInterface = { ouvrir };
})();
