// ============================================================
// LIRE UNE SÉANCE PAR LE RELAIS — SANS CLÉ, SANS COMPTE
// ============================================================
// Pour qu'un navigateur sans compte lise un fichier du Drive, Google exige une
// clé d'API : elle arrive donc chez l'élève, et donc chez n'importe qui. Le
// relais (relais/relais-seances.gs, déployé dans le compte de l'enseignant)
// renverse la chose : c'est lui qui lit le fichier, sous le compte du
// professeur, et qui le renvoie. Plus aucune clé ne circule, et les séances
// n'ont même plus besoin d'être partagées.
//
// UN RELAIS PAR COMPTE. Un script s'exécute sous un seul compte : celui du
// lycée pour les cours du lycée, le personnel pour le reste. Chaque relais
// porte un nom court — « lfb », « mem » — et le lien de la séance dit lequel
// ouvrir : « ?r=lfb&id=… ». L'adresse complète, elle, vit dans les réglages :
// on peut redéployer un relais sans casser un seul lien distribué.
// ============================================================
(function () {
    'use strict';

    const CLE_RELAIS = 'AuTableau_relais';   // localStorage : les adresses, chez le professeur

    const config = () => (window.AUTABLEAU_PUBLICATION || {});

    // Les relais connus : ceux du site d'abord, ceux de ce navigateur ensuite.
    function tous() {
        const sortie = {};
        const duSite = config().relais || {};
        Object.keys(duSite).forEach(k => { if (duSite[k]) sortie[k] = duSite[k]; });
        try {
            const m = JSON.parse(localStorage.getItem(CLE_RELAIS) || 'null');
            if (m && typeof m === 'object') Object.keys(m).forEach(k => { if (m[k]) sortie[k] = m[k]; });
        } catch (e) { /* stockage refusé */ }
        return sortie;
    }

    function adresseDe(cle) {
        const a = tous()[String(cle || '')];
        return a ? String(a).trim() : '';
    }

    function poser(cle, adresse) {
        const m = (() => { try { return JSON.parse(localStorage.getItem(CLE_RELAIS) || '{}'); } catch (e) { return {}; } })();
        if (adresse) m[cle] = String(adresse).trim(); else delete m[cle];
        try { localStorage.setItem(CLE_RELAIS, JSON.stringify(m)); } catch (e) { /* refusé */ }
        return m;
    }

    // Quand plusieurs comptes Google cohabitent dans le navigateur, les
    // adresses se promènent avec un « /u/0/ », « /u/1/ » qui désigne le
    // énième compte connecté — chez l'enseignant, pas chez l'élève. On le
    // retire : l'adresse redevient celle que « Gérer les déploiements »
    // donne, et vaut pour tout le monde.
    function adresseNette(adresse) {
        const brut = String(adresse || '').trim();
        try {
            const u = new URL(brut);
            u.pathname = u.pathname.replace(/^\/u\/\d+(?=\/)/, '');
            return u.href;
        } catch (e) { return brut; }
    }

    // Une adresse de relais est une application web d'Apps Script, et rien
    // d'autre : on ne va pas chercher une séance n'importe où sur ordre d'un
    // lien. Deux formes existent, selon le compte qui déploie — et la seconde
    // avait été oubliée, alors que c'est justement celle d'un établissement :
    //   https://script.google.com/macros/s/<id>/exec            compte ordinaire
    //   https://script.google.com/a/macros/lfbali.com/s/<id>/exec   Workspace
    const CHEMIN_EXEC = /^\/(?:a\/macros\/[^/]+|macros)\/s\/[^/]+\/exec$/;

    // Refuser ne suffit pas : il faut dire ce qui cloche, parce que la console
    // d'Apps Script propose plusieurs adresses qui se ressemblent et dont une
    // seule convient.
    function pourquoiPasValable(adresse) {
        const brut = String(adresse || '').trim();
        if (!brut) return 'Collez l’adresse « …/exec » donnée par le déploiement.';
        let u;
        try { u = new URL(adresseNette(brut)); }
        catch (e) { return 'Ceci n’est pas une adresse web complète : elle doit commencer par « https:// ».'; }
        if (u.protocol !== 'https:') return 'L’adresse du relais doit commencer par « https:// ».';
        if (!/(^|\.)google\.com$/.test(u.hostname)) {
            return 'Un relais est une application Apps Script : son adresse est sur script.google.com.';
        }
        if (CHEMIN_EXEC.test(u.pathname)) return '';
        if (/\/dev$/.test(u.pathname)) {
            return 'Cette adresse se termine par « /dev » : elle n’ouvre que pour vous, jamais pour un élève. Prenez celle qui finit par « /exec ».';
        }
        if (/\/(?:edit|projects|home)\b/.test(u.pathname)) {
            return 'Ceci est l’adresse de l’éditeur du script, pas celle du relais. La bonne est donnée par Déployer → Gérer les déploiements, et finit par « /exec ».';
        }
        return 'Cette adresse n’est pas celle d’un déploiement : elle doit contenir « /macros/s/… » et finir par « /exec ».';
    }

    function adresseValable(adresse) {
        return pourquoiPasValable(adresse) === '';
    }

    // Google répond parfois par une redirection vers googleusercontent.com :
    // fetch la suit tout seul, et la réponse porte alors les en-têtes qui
    // autorisent la lecture depuis notre page.
    async function demander(adresse, parametres) {
        const defaut = pourquoiPasValable(adresse);
        if (defaut) throw new Error(defaut);
        const u = new URL(adresseNette(adresse));
        Object.keys(parametres || {}).forEach(k => u.searchParams.set(k, parametres[k]));
        let r;
        try {
            r = await fetch(u.href, { cache: 'no-store', credentials: 'omit', redirect: 'follow' });
        } catch (e) {
            throw new Error('Le relais ne répond pas. Vérifiez qu’il est déployé « accessible à tout le monde ».');
        }
        if (r.status === 404) {
            // Google ne connaît pas ce déploiement. Neuf fois sur dix, c'est
            // l'identifiant du projet qu'on a pris pour celui du déploiement,
            // ou un déploiement archivé depuis.
            throw new Error("Google ne connaît aucun déploiement à cette adresse. Reprenez-la par Déployer → Gérer les déploiements → le bouton qui copie « URL de l’application Web » — et non dans la barre d’adresse de l’éditeur.");
        }
        if (!r.ok) throw new Error('Le relais a répondu « ' + r.status + ' ». Est-il déployé et autorisé ?');
        const texte = await r.text();
        let objet;
        try { objet = JSON.parse(texte); }
        catch (e) {
            // Une page HTML à la place du JSON, c'est presque toujours la page
            // de connexion : le déploiement n'est pas ouvert à tous.
            throw new Error(/<html/i.test(texte)
                ? 'Le relais demande une connexion Google : redéployez-le avec « Qui a accès : tout le monde ».'
                : 'Le relais a répondu quelque chose d’illisible.');
        }
        if (objet && objet.erreur) throw new Error(objet.erreur);
        return objet;
    }

    // La séance entière, telle que le lecteur l'attend.
    async function lireLaSeance(cle, id) {
        const adresse = adresseDe(cle);
        if (!adresse) throw new Error('Ce lien désigne un relais que ce site ne connaît pas (« ' + cle + ' »).');
        const contenu = await demander(adresse, { id });
        if (!contenu || !Array.isArray(contenu.data && contenu.data.pages)) {
            throw new Error('Ce fichier ne contient pas une séance Au Tableau.');
        }
        return { fiche: { id }, contenu };
    }

    // « Essayer ce relais » : il dit sous quel compte il tourne et s'il voit
    // déjà le dossier des séances.
    async function essayer(adresse) {
        const etat = await demander(adresse, { ping: '1' });
        if (!etat || etat.relais !== 'Au Tableau') throw new Error('Cette adresse répond, mais ce n’est pas le relais d’Au Tableau.');
        return etat;
    }

    window.Relais = { tous, adresseDe, poser, adresseNette, adresseValable, pourquoiPasValable, lireLaSeance, essayer, CLE_RELAIS };
})();
