// Publication côté enseignant. Seul le fichier reçoit un droit de lecture
// anonyme. Le dossier et le jeton OAuth ne voyagent jamais dans le lien.
(function () {
    'use strict';
    const API = 'https://www.googleapis.com/drive/v3/files';
    const SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const MARQUE = 'seance-individuelle-v1';
    const MSG_ADRESSE = 'Google n’a pas fourni une adresse d’envoi valide. Réessayez.';
    const DOSSIER = 'Au Tableau — séances publiées';
    const CHAMPS = 'id,name,mimeType,parents,trashed,resourceKey,appProperties,permissions(id,type,role)';
    let jeton = '', expiration = 0;

    const connecte = () => !!jeton && Date.now() < expiration;
    function deconnecter() { jeton = ''; expiration = 0; }

    function preparer() {
        if (window.AUTABLEAU_LECTEUR || document.getElementById('google-identity')) return;
        const script = document.createElement('script');
        script.id = 'google-identity';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        document.head.appendChild(script);
    }

    // Appeler directement depuis le bouton : Google exige un geste humain.
    function connecter(clientId) {
        deconnecter();
        return new Promise((resolve, reject) => {
            if (!clientId) return reject(new Error('Renseignez un identifiant client OAuth Google de type Application Web dans les réglages.'));
            if (!window.google?.accounts?.oauth2) {
                preparer();
                return reject(new Error('La connexion Google se charge. Réessayez dans quelques secondes.'));
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId, scope: SCOPE, include_granted_scopes: false,
                error_callback: () => reject(new Error('Connexion Google interrompue. Autorisez la fenêtre de connexion puis réessayez.')),
                callback: (r) => {
                    if (r.error || !r.access_token || !google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
                        reject(new Error('Autorisez Au Tableau à gérer les fichiers qu’il crée pour publier la séance.'));
                        return;
                    }
                    jeton = r.access_token;
                    expiration = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000;
                    resolve();
                }
            });
            client.requestAccessToken({ prompt: 'select_account' });
        });
    }

    // GOOGLE A DES DÉFAILLANCES PASSAGÈRES : « Internal Error », « Backend
    // Error », une limite de débit atteinte. Google recommande lui-même de
    // réessayer après une attente qui double à chaque fois ; abandonner au
    // premier refus faisait échouer une publication pour une seconde de
    // mauvaise humeur de son serveur, et laissait l'enseignant devant un
    // message anglais qui ne lui apprenait rien.
    const PASSAGER = [429, 500, 502, 503, 504];
    const patienter = (ms) => new Promise(r => setTimeout(r, ms));

    async function appeler(url, options = {}, brut = false) {
        if (!connecte()) throw new Error('Reconnectez votre compte Google pour publier ou retirer une séance.');
        let derniere = null;
        for (let essai = 0; essai < 4; essai++) {
            if (essai) await patienter(600 * Math.pow(2, essai - 1) + Math.random() * 400);
            const r = await fetch(url, { ...options, cache: 'no-store', credentials: 'omit',
                headers: { ...options.headers, Authorization: 'Bearer ' + jeton } });
            if (r.ok) return brut ? r : r.status === 204 ? null : r.json();
            if (r.status === 401) {
                deconnecter();
                throw new Error('La connexion Google a expiré. Reconnectez-vous puis réessayez.');
            }
            const corps = await r.json().catch(() => ({}));
            derniere = new Error(corps.error?.message || 'Google Drive refuse la demande (HTTP ' + r.status + ').');
            derniere.code = r.status;
            if (PASSAGER.indexOf(r.status) < 0) throw derniere;
        }
        derniere.message = 'Google Drive n’a pas répondu correctement, quatre fois de suite (« '
            + derniere.message + ' »). La panne est de son côté : réessayez dans un moment.';
        throw derniere;
    }
    const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const ficheDe = (id) => appeler(API + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(CHAMPS));

    function estPrive(d) {
        // Une liste absente ne prouve pas que le dossier est privé.
        return d.mimeType === 'application/vnd.google-apps.folder' && !d.trashed
            && Array.isArray(d.permissions) && d.permissions.length > 0
            && d.permissions.every(p => p.type === 'user' && p.role === 'owner');
    }
    async function liste(q, fields) {
        let page = '', fichiers = [];
        do {
            const p = new URLSearchParams({ q, fields: 'nextPageToken,files(' + fields + ')', pageSize: '1000' });
            if (page) p.set('pageToken', page);
            const r = await appeler(API + '?' + p);
            fichiers = fichiers.concat(r.files || []);
            page = r.nextPageToken || '';
        } while (page);
        return fichiers;
    }
    async function dossierPrive() {
        const dossiers = await liste("trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='autableauDossier' and value='" + MARQUE + "' }", CHAMPS);
        const prive = dossiers.find(estPrive);
        if (prive) return prive;
        // Jamais le dossier public de l'ancienne configuration : nouvelle
        // copie à la racine de Mon Drive, sans aucune permission ajoutée.
        const cree = await appeler(API + '?fields=id', json('POST', {
            name: DOSSIER, mimeType: 'application/vnd.google-apps.folder',
            appProperties: { autableauDossier: MARQUE }
        }));
        const dossier = await ficheDe(cree.id);
        if (!estPrive(dossier)) throw new Error('Le dossier de publication doit être privé. Vérifiez ses autorisations dans Google Drive.');
        return dossier;
    }

    async function envoyer(metadata, contenu) {
        const media = new Blob([JSON.stringify(contenu)], { type: 'application/json' });
        if (media.size > 5 * 1024 * 1024) {
            // Les photos, PDF et le film d'une heure dépassent facilement
            // les 5 Mo permis par l'envoi multipart.
            const depart = await appeler('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
                ...json('POST', metadata), headers: { 'Content-Type': 'application/json',
                    'X-Upload-Content-Type': 'application/json', 'X-Upload-Content-Length': String(media.size) }
            }, true);
            const adresse = new URL(depart.headers.get('Location') || '');
            if (adresse.origin !== 'https://www.googleapis.com' || !adresse.pathname.startsWith('/upload/drive/')) {
                throw new Error(MSG_ADRESSE);
            }
            return appeler(adresse.href, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: media });
        }
        const boundary = 'autableau_' + crypto.randomUUID();
        const body = new Blob([
            '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n', JSON.stringify(metadata),
            '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n', media,
            '\r\n--' + boundary + '--'
        ], { type: 'multipart/related; boundary=' + boundary });
        return appeler('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
            method: 'POST', headers: { 'Content-Type': body.type }, body
        });
    }

    // ---------------------------------------------------------------------
    // METTRE À JOUR PLUTÔT QUE REFAIRE
    // ---------------------------------------------------------------------
    // Un lien collé dans le cahier de textes ne se recolle pas. Reprendre une
    // séance et la republier doit donc changer le CONTENU du même fichier, et
    // non en créer un second : sans cela l'élève restait sur la version de la
    // veille, et le professeur recopiait son lien à chaque fois.
    //
    // Drive refuse « parents » dans une mise à jour : on ne lui envoie que ce
    // qui change — le nom, la description, la marque — et le contenu.
    async function remplacer(id, infos, contenu) {
        const media = new Blob([JSON.stringify(contenu)], { type: 'application/json' });
        const base = 'https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(id);
        if (media.size > 5 * 1024 * 1024) {
            const depart = await appeler(base + '?uploadType=resumable&fields=id', {
                ...json('PATCH', infos), headers: { 'Content-Type': 'application/json',
                    'X-Upload-Content-Type': 'application/json', 'X-Upload-Content-Length': String(media.size) }
            }, true);
            const adresse = new URL(depart.headers.get('Location') || '');
            if (adresse.origin !== 'https://www.googleapis.com' || !adresse.pathname.startsWith('/upload/drive/')) {
                throw new Error(MSG_ADRESSE);
            }
            return appeler(adresse.href, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: media });
        }
        const boundary = 'autableau_' + crypto.randomUUID();
        const body = new Blob([
            '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n', JSON.stringify(infos),
            '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n', media,
            '\r\n--' + boundary + '--'
        ], { type: 'multipart/related; boundary=' + boundary });
        return appeler(base + '?uploadType=multipart&fields=id', {
            method: 'PATCH', headers: { 'Content-Type': body.type }, body
        });
    }

    // Une valeur dans une requête « q » : Drive veut les apostrophes échappées.
    const citer = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

    // La séance déjà en ligne sous ce nom, s'il y en a une.
    async function publieeSousLeNom(nom) {
        const l = await liste('trashed=false and name=' + citer(nom + '.prof')
            + " and appProperties has { key='autableauReplay' and value='" + MARQUE + "' }",
            CHAMPS + ',modifiedTime,size,description');
        return l[0] || null;
    }

    // Ce fichier-là est-il toujours une séance publiée ? On a pu la retirer, la
    // mettre à la corbeille, ou changer de compte entre-temps.
    async function existeEncore(id) {
        try {
            const f = await ficheDe(id);
            return (!f.trashed && f.appProperties?.autableauReplay === MARQUE) ? f : null;
        } catch (e) { return null; }
    }

    async function publier(nom, contenu, cle, remplacerId, parLeRelais) {
        if (!cle && !parLeRelais) throw new Error('Renseignez la clé API dans les réglages.');
        const dossier = await dossierPrive();
        const infos = { name: nom + '.prof', appProperties: { autableauReplay: MARQUE },
            description: JSON.stringify(contenu.seance) };
        let fichier, creee = false;
        try {
            if (remplacerId) fichier = await remplacer(remplacerId, infos, contenu);
            else {
                fichier = await envoyer({ ...infos, mimeType: 'application/json', parents: [dossier.id] }, contenu);
                creee = true;
            }
            let fiche = await ficheDe(fichier.id);
            // Recontrôler le parent juste avant de rendre la copie lisible : un
            // dossier partagé exposerait toutes les autres séances avec elle.
            for (const parent of fiche.parents || []) {
                if (!estPrive(await ficheDe(parent))) throw new Error('Le dossier a été partagé. Remettez son accès général sur « Limité » avant de publier.');
            }
            // LE PARTAGE PUBLIC NE SERT QU'À LA LECTURE PAR CLÉ. Servie par un
            // relais, la séance reste privée : personne d'autre que le compte du
            // professeur ne peut la lire, pas même avec son identifiant.
            if (!parLeRelais && !(fiche.permissions || []).some(p => p.type === 'anyone')) {
                await appeler(API + '/' + encodeURIComponent(fiche.id) + '/permissions?fields=id',
                    json('POST', { type: 'anyone', role: 'reader', allowFileDiscovery: false }));
                fiche = await ficheDe(fiche.id);
            }
            // Ce que verra l'élève, essayé pour de bon avant de rendre le lien.
            if (parLeRelais) await parLeRelais(fiche);
            else {
                try { await DrivePublic.lireFichier(fiche.id, cle, fiche.resourceKey); }
                catch (e) { e.message = DrivePublic.expliquer(e); throw e; }
            }
            fiche.remplacee = !creee;
            return fiche;
        } catch (e) {
            // ON NE JETTE QUE CE QU'ON VIENT DE CRÉER. Une séance mise à jour est
            // déjà en ligne et son lien circule : la mettre à la corbeille sur un
            // envoi raté couperait un lien qui marchait.
            if (creee && fichier?.id) {
                try { await appeler(API + '/' + encodeURIComponent(fichier.id), json('PATCH', { trashed: true })); }
                catch (_) { e.message += ' Une copie a été créée sur Drive : vérifiez son partage avant de réessayer.'; }
            }
            throw e;
        }
    }


    async function lister() {
        const fichiers = await liste("trashed=false and appProperties has { key='autableauReplay' and value='" + MARQUE + "' }",
            CHAMPS + ',modifiedTime,size,description');
        // SERVIE PAR UN RELAIS, UNE SÉANCE N'A AUCUN PARTAGE : filtrer sur le
        // partage public l'aurait rendue invisible à son propre auteur.
        return fichiers.map(f => ({ ...f, publique: (f.permissions || []).some(p => p.type === 'anyone') }))
            .sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
    }
    // RETIRER UNE SÉANCE. Couper le partage suffisait quand l'élève lisait le
    // fichier lui-même. Servie par un relais, la séance est lisible parce
    // qu'elle est DANS le dossier des séances publiées : on la met donc à la
    // corbeille du Drive, d'où elle revient pendant trente jours si besoin.
    // Le tableau de travail, lui, n'est pas touché : ceci n'est qu'une copie.
    async function retirer(id) {
        const f = await ficheDe(id);
        if (f.appProperties?.autableauReplay !== MARQUE) throw new Error('Ce fichier n’est pas une séance publiée par Au Tableau.');
        for (const p of f.permissions || []) {
            if (p.type === 'anyone') await appeler(API + '/' + encodeURIComponent(id) + '/permissions/' + encodeURIComponent(p.id), { method: 'DELETE' });
        }
        await appeler(API + '/' + encodeURIComponent(id), json('PATCH', { trashed: true }));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preparer);
    else preparer();
    window.DrivePublication = { connecter, connecte, deconnecter, publier, lister, retirer,
        publieeSousLeNom, existeEncore, DOSSIER };
})();
