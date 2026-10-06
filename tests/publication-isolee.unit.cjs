// Contrats de partage, sans compte ni accès réseau : les vrais modules
// parlent à un serveur Drive simulé qui applique les permissions des fichiers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const MARQUE = 'seance-individuelle-v1';
const OWNER = { id: 'owner', type: 'user', role: 'owner' };
const ANYONE = { id: 'anyoneWithLink', type: 'anyone', role: 'reader' };
const seance = titre => ({ name: titre, seance: { titre, classe: '3e', date: '2026-09-22' },
    data: { pages: [{ film: [{ t: 1, freehands: [] }, { t: 2, freehands: [{ id: 1 }] }] }] } });

function environnement(options = {}) {
    const fichiers = new Map(), requetes = [], stockage = new Map();
    let n = 0, now = Date.now(), oauth, metadataEnAttente;
    const copie = o => JSON.parse(JSON.stringify(o));
    const reponse = (o, status = 200) => new Response(status === 204 ? null : JSON.stringify(o), {
        status, headers: { 'Content-Type': 'application/json' }
    });
    const erreur = (status, message) => reponse({ error: { message } }, status);
    const dossier = (id, permissions = [OWNER]) => ({ id, name: 'Dossier', mimeType: 'application/vnd.google-apps.folder',
        appProperties: { autableauDossier: MARQUE }, permissions: copie(permissions), trashed: false });
    if (options.ancienDossierPartage) fichiers.set('ancien', dossier('ancien', [OWNER, ANYONE]));
    let pannes = options.pannes || 0;
    const ctx = { URL, URLSearchParams, Blob, crypto: webcrypto, console,
        setTimeout, clearTimeout,   // le navigateur les a ; la réessai de Drive s en sert
        Date: class extends Date { static now() { return now; } },
        location: new URL('https://mathsetmoi.github.io/Autableau/'),
        document: { readyState: 'loading', addEventListener() {} },
        localStorage: { getItem: k => stockage.get(k) || null, setItem: (k, v) => stockage.set(k, v) },
        AUTABLEAU_DRIVE_CLIENT_ID: 'client-test.apps.googleusercontent.com',
        AUTABLEAU_PUBLICATION: { cle: '' },
        google: { accounts: { oauth2: {
            hasGrantedAllScopes: () => !options.refusConsentement,
            initTokenClient: config => {
                oauth = config;
                return { requestAccessToken: () => config.callback({ access_token: 'JETON_PROF', expires_in: 3600 }) };
            }
        } } },
        fetch: async (url, init = {}) => {
            const u = new URL(url), method = init.method || 'GET';
            const auth = init.headers?.Authorization === 'Bearer JETON_PROF';
            // Une défaillance passagère de Google, à la demande du test.
            if (auth && pannes > 0) { pannes--; return erreur(500, 'Internal Error'); }
            requetes.push({ url: u.href, method, headers: init.headers, credentials: init.credentials });
            if (!auth) {
                assert.equal(init.credentials, 'omit', 'aucun cookie du professeur chez le lecteur');
                assert.equal(init.headers?.Authorization, undefined, 'aucun jeton du professeur chez le lecteur');
                if (u.searchParams.get('key') !== 'CLE_TEST') return erreur(403, 'API key not valid');
                const id = u.pathname.split('/').pop(), f = fichiers.get(id);
                if (!f || f.trashed || !f.permissions.some(p => p.type === 'anyone')) return erreur(404, 'Not found');
                if (u.searchParams.get('alt') !== 'media') return erreur(400, 'Media expected');
                if (f.resourceKey) assert.equal(init.headers['X-Goog-Drive-Resource-Keys'], id + '/' + f.resourceKey);
                return reponse(f.contenu);
            }
            // Mettre à jour un fichier existant : même chemin, un identifiant en plus.
            const majUpload = u.pathname.match(new RegExp("^\\/upload\\/drive\\/v3\\/files\\/(.+)$"));
            if (majUpload) {
                const vise = fichiers.get(decodeURIComponent(majUpload[1]));
                assert.ok(vise, 'mise à jour d un fichier inconnu');
                if (u.searchParams.get('uploadType') === 'resumable') {
                    metadataEnAttente = { __maj: vise.id, ...JSON.parse(init.body) };
                    return new Response(null, { status: 200, headers: {
                        Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=SESSION'
                    } });
                }
                const boundary = init.body.type.split('boundary=')[1];
                const parties = (await init.body.text()).split('--' + boundary);
                const lire = p => JSON.parse(p.slice(p.indexOf('\r\n\r\n') + 4).trim());
                assert.equal(method, 'PATCH');
                const infos = lire(parties[1]);
                assert.equal(infos.parents, undefined, 'une mise à jour ne redonne pas de parent');
                Object.assign(vise, infos, { contenu: lire(parties[2]) });
                return reponse({ id: vise.id });
            }
            if (u.pathname === '/upload/drive/v3/files') {
                if (u.searchParams.get('uploadType') === 'resumable') {
                    metadataEnAttente = JSON.parse(init.body);
                    return new Response(null, { status: 200, headers: {
                        Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=SESSION'
                    } });
                }
                let metadata, contenu;
                if (method === 'PUT') {
                    metadata = metadataEnAttente;
                    contenu = JSON.parse(await init.body.text());
                    if (metadata && metadata.__maj) {
                        const vise = fichiers.get(metadata.__maj);
                        const { __maj, ...infos } = metadata;
                        Object.assign(vise, infos, { contenu });
                        return reponse({ id: vise.id });
                    }
                } else {
                    const boundary = init.body.type.split('boundary=')[1];
                    const parties = (await init.body.text()).split('--' + boundary);
                    const lire = p => JSON.parse(p.slice(p.indexOf('\r\n\r\n') + 4).trim());
                    metadata = lire(parties[1]); contenu = lire(parties[2]);
                }
                const id = 'seance_' + ++n;
                const f = { ...metadata, id, contenu, permissions: copie([OWNER]),
                    resourceKey: 'cle_ressource_' + n, modifiedTime: '2026-09-22T12:00:00Z', size: 500 };
                fichiers.set(id, f);
                if (options.dossierPartagePendantEnvoi) fichiers.get(metadata.parents[0]).permissions.push(copie(ANYONE));
                return reponse({ id });
            }
            if (u.pathname === '/drive/v3/files') {
                if (method === 'POST') {
                    const id = 'dossier_' + ++n;
                    fichiers.set(id, dossier(id, options.nouveauDossierPartage ? [OWNER, ANYONE] : [OWNER]));
                    return reponse({ id });
                }
                const filtreDossiers = u.searchParams.get('q').includes('autableauDossier');
                const nomCherche = (u.searchParams.get('q').match(/name='([^']*)'/) || [])[1];
                const tous = [...fichiers.values()].filter(f => !f.trashed &&
                    (filtreDossiers ? !!f.appProperties.autableauDossier : !!f.appProperties.autableauReplay) && (!nomCherche || f.name === nomCherche));
                const debut = Number(u.searchParams.get('pageToken') || 0);
                return reponse({ files: tous.slice(debut, debut + 1),
                    ...(debut + 1 < tous.length ? { nextPageToken: String(debut + 1) } : {}) });
            }
            const [, id, permission] = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)(?:\/permissions(?:\/([^/]+))?)?$/) || [];
            const f = fichiers.get(id);
            if (!f) return erreur(404, 'Not found');
            if (u.pathname.includes('/permissions')) {
                assert.notEqual(f.mimeType, 'application/vnd.google-apps.folder', 'aucun droit ajouté au dossier');
                if (method === 'POST') {
                    if (options.partageInterdit) return erreur(403, 'Le partage externe est interdit.');
                    assert.deepEqual(JSON.parse(init.body), { type: 'anyone', role: 'reader', allowFileDiscovery: false });
                    f.permissions.push(copie(ANYONE));
                    return reponse({ id: ANYONE.id });
                }
                assert.equal(method, 'DELETE');
                f.permissions = f.permissions.filter(p => p.id !== permission);
                return reponse(null, 204);
            }
            if (method === 'PATCH') { Object.assign(f, JSON.parse(init.body)); return reponse(f); }
            return reponse(f);
        }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const fichier of ['drive-public.js', 'drive-publication.js', 'publier.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../lib/lecteur', fichier), 'utf8'), ctx, { filename: fichier });
    }
    ctx.Publication.poserLesReglages({ dossier: 'DOSSIER_ANCIEN_SECRET', cle: 'CLE_TEST' });
    return { ctx, fichiers, requetes, stockage, oauth: () => oauth, avancer: ms => { now += ms; },
        connecter: () => ctx.DrivePublication.connecter(ctx.AUTABLEAU_DRIVE_CLIENT_ID) };
}

test('chaque publication partage son fichier, jamais le parent ; sans mise à jour demandée, deux séances font deux liens', async () => {
    const e = environnement(); await e.connecter();
    const a = await e.ctx.DrivePublication.publier('meme-titre', seance('A'), 'CLE_TEST');
    const b = await e.ctx.DrivePublication.publier('meme-titre', seance('B'), 'CLE_TEST');   // sans « remplacerId »
    assert.notEqual(a.id, b.id);
    const ua = new URL(e.ctx.Publication.lienDe(a)), ub = new URL(e.ctx.Publication.lienDe(b));
    assert.notEqual(ua.href, ub.href);
    assert.equal(ua.searchParams.get('id'), a.id);
    assert.equal(ua.searchParams.get('rk'), a.resourceKey);
    assert.equal(ua.searchParams.has('d'), false);
    assert.equal(ua.searchParams.has('f'), false);
    assert.equal(ua.href.includes('JETON_PROF'), false);
    assert.equal(ua.href.includes('DOSSIER_ANCIEN_SECRET'), false);
    assert.equal([...e.stockage.values()].some(v => v.includes('JETON_PROF')), false);
    const parent = e.fichiers.get(e.fichiers.get(a.id).parents[0]);
    assert.deepEqual(parent.permissions, [OWNER]);
    await assert.rejects(e.ctx.DrivePublic.lireFichier(parent.id, 'CLE_TEST'), /Not found/);
    const index = e.requetes.length;
    const lecture = await e.ctx.DrivePublic.lireFichier(a.id, 'CLE_TEST', a.resourceKey);
    assert.equal(lecture.contenu.seance.titre, 'A');
    assert.equal(e.requetes.length, index + 1, 'une seule lecture directe, aucune liste de dossier');
    assert.equal(e.oauth().scope, 'https://www.googleapis.com/auth/drive.file');
    assert.equal(e.oauth().include_granted_scopes, false);
});

test('un ancien dossier public est ignoré et ses droits restent inchangés', async () => {
    const e = environnement({ ancienDossierPartage: true }); await e.connecter();
    const f = await e.ctx.DrivePublication.publier('cours', seance('Cours'), 'CLE_TEST');
    assert.notEqual(e.fichiers.get(f.id).parents[0], 'ancien');
    assert.deepEqual(e.fichiers.get('ancien').permissions, [OWNER, ANYONE]);
});

test('une liste de dossiers ne prouve pas la confidentialité sans ses permissions', async () => {
    const e = environnement({ ancienDossierPartage: true });
    delete e.fichiers.get('ancien').permissions;
    await e.connecter();
    const f = await e.ctx.DrivePublication.publier('cours', seance('Cours'), 'CLE_TEST');
    assert.notEqual(e.fichiers.get(f.id).parents[0], 'ancien');
});

test('un nouveau dossier déjà partagé bloque la publication avant tout envoi', async () => {
    const e = environnement({ nouveauDossierPartage: true }); await e.connecter();
    await assert.rejects(e.ctx.DrivePublication.publier('cours', seance('Cours'), 'CLE_TEST'), /doit être privé/);
    assert.equal(e.requetes.some(r => r.url.includes('/upload/')), false);
});

test('un partage du parent pendant l’envoi bloque la publication et met la copie à la corbeille', async () => {
    const e = environnement({ dossierPartagePendantEnvoi: true }); await e.connecter();
    await assert.rejects(e.ctx.DrivePublication.publier('cours', seance('Cours'), 'CLE_TEST'), /dossier a été partagé/);
    assert.equal(e.requetes.some(r => r.url.includes('/permissions')), false);
    assert.ok([...e.fichiers.values()].find(f => f.appProperties.autableauReplay).trashed);
});

test('retirer une séance bloque son lien et conserve l’autre, avec pagination de la liste enseignant', async () => {
    const e = environnement(); await e.connecter();
    const a = await e.ctx.DrivePublication.publier('a', seance('A'), 'CLE_TEST');
    const b = await e.ctx.DrivePublication.publier('b', seance('B'), 'CLE_TEST');
    assert.equal((await e.ctx.DrivePublication.lister()).length, 2);
    await e.ctx.DrivePublication.retirer(a.id);
    await assert.rejects(e.ctx.DrivePublic.lireFichier(a.id, 'CLE_TEST', a.resourceKey), /Not found/);
    assert.equal((await e.ctx.DrivePublic.lireFichier(b.id, 'CLE_TEST', b.resourceKey)).contenu.seance.titre, 'B');
    assert.equal((await e.ctx.DrivePublication.lister()).length, 1);
    assert.equal(e.fichiers.get(a.id).trashed, true,
        'la copie publiée part à la corbeille : couper le partage ne suffit pas quand c’est un relais qui sert');
    assert.equal(e.fichiers.get(b.id).trashed, undefined, 'et l’autre séance n’est pas touchée');
});

for (const [nom, options, cle, message] of [
    ['clé refusée chez l’élève', {}, 'MAUVAISE_CLE', /clé d.API/],
    ['partage interdit par l’établissement', { partageInterdit: true }, 'CLE_TEST', /interdit/]
]) test(nom + ' : aucun faux succès, la copie inachevée est retirée', async () => {
    const e = environnement(options); await e.connecter();
    await assert.rejects(e.ctx.DrivePublication.publier('cours', seance('Cours'), cle), message);
    const f = [...e.fichiers.values()].find(f => f.appProperties.autableauReplay);
    assert.ok(f.trashed);
    await assert.rejects(e.ctx.DrivePublic.lireFichier(f.id, 'CLE_TEST', f.resourceKey), /Not found/);
});

test('autorisation refusée ou expirée : aucun accès réseau ni publication', async () => {
    const refuse = environnement({ refusConsentement: true });
    await assert.rejects(refuse.connecter(), /Autorisez/);
    assert.equal(refuse.ctx.DrivePublication.connecte(), false);
    const e = environnement(); await e.connecter(); e.avancer(3600000);
    await assert.rejects(e.ctx.DrivePublication.publier('cours', seance('Cours'), 'CLE_TEST'), /Reconnectez/);
    assert.equal(e.requetes.length, 0);
});

test('la clé ne voyage jamais dans le lien, même réglée en local', () => {
    const e = environnement();
    e.ctx.AUTABLEAU_PUBLICATION.cle = 'AUTRE_CLE';
    const u = new URL(e.ctx.Publication.lienDe('SEANCE_TEST'));
    assert.equal(u.searchParams.has('k'), false, 'la clé reste sur le site, pas dans l adresse donnée aux élèves');
    assert.equal(u.searchParams.get('id'), 'SEANCE_TEST');
    assert.equal(u.href.includes('CLE_TEST'), false);
});

test('republier la même séance met à jour le fichier : même identifiant, donc même lien', async () => {
    const e = environnement(); await e.connecter();
    const premier = await e.ctx.DrivePublication.publier('cours-du-jour', seance('Version 1'), 'CLE_TEST');
    assert.equal(premier.remplacee, false);
    const vise = await e.ctx.DrivePublication.publieeSousLeNom('cours-du-jour');
    assert.equal(vise.id, premier.id, 'on retrouve la séance par son nom, d un poste à l autre');
    const second = await e.ctx.DrivePublication.publier('cours-du-jour', seance('Version 2'), 'CLE_TEST', vise.id);
    assert.equal(second.id, premier.id);
    assert.equal(second.remplacee, true);
    assert.equal(e.ctx.Publication.lienDe(second), e.ctx.Publication.lienDe(premier));
    const lu = await e.ctx.DrivePublic.lireFichier(premier.id, 'CLE_TEST', premier.resourceKey);
    assert.equal(lu.contenu.seance.titre, 'Version 2', 'le lien d hier montre le travail d aujourd hui');
    assert.equal([...e.fichiers.values()].filter(x => x.appProperties && x.appProperties.autableauReplay).length, 1,
        'une seule séance sur le Drive, pas une de plus à chaque publication');
    assert.equal(e.fichiers.get(premier.id).permissions.filter(p => p.type === 'anyone').length, 1,
        'le partage existant n est pas redonné une seconde fois');
});

test('une mise à jour qui échoue ne jette pas la séance déjà en ligne', async () => {
    const e = environnement(); await e.connecter();
    const f = await e.ctx.DrivePublication.publier('cours', seance('En ligne'), 'CLE_TEST');
    // La clé devient fausse : la relecture anonyme échouera après l envoi.
    await assert.rejects(e.ctx.DrivePublication.publier('cours', seance('Nouvelle'), 'MAUVAISE_CLE', f.id));
    assert.equal(e.fichiers.get(f.id).trashed, undefined, 'la séance publiée reste en ligne');
    assert.ok(e.fichiers.get(f.id).permissions.some(p => p.type === 'anyone'), 'et son lien marche toujours');
});

test('une séance avec plus de 5 Mo de documents est envoyée par une session resumable', async () => {
    const e = environnement(); await e.connecter();
    const contenu = seance('Cours avec PDF');
    contenu.data.assets = { document: 'x'.repeat(6 * 1024 * 1024) };
    const f = await e.ctx.DrivePublication.publier('cours', contenu, 'CLE_TEST');
    assert.equal(e.fichiers.get(f.id).contenu.data.assets.document.length, 6 * 1024 * 1024);
    assert.ok(e.requetes.some(r => r.method === 'PUT' && r.url.includes('upload_id=')));
    assert.equal(e.requetes.some(r => r.url.includes('uploadType=multipart')), false);
});

// « Publication impossible : Internal Error ». Le serveur de Google a des
// défaillances passagères, et Google recommande lui-même d'attendre puis de
// réessayer. Abandonner au premier refus faisait perdre une séance pour une
// seconde de mauvaise humeur, en anglais et sans rien expliquer.
test('une défaillance passagère de Google ne fait pas perdre la séance', async () => {
    const e = environnement({ pannes: 1 }); await e.connecter();
    const f = await e.ctx.DrivePublication.publier('cours', seance('Cours'), 'CLE_TEST');
    assert.ok(f.id, 'la séance est publiée malgré le refus');
});

// Et quand la panne dure, on cesse d'insister, en français, en disant de
// quel côté est le défaut.
test('une panne qui dure est dite en français, et de qui elle vient', async () => {
    const e = environnement({ pannes: 99 }); await e.connecter();
    await assert.rejects(e.ctx.DrivePublication.publier('cours', seance('Cours'), 'CLE_TEST'),
        /quatre fois de suite|de son côté/);
});
